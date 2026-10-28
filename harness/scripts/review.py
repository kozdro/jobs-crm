#!/usr/bin/env python3
"""Start an independent native review session; task text comes from stdin."""
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
ROLES = ('frontend-reviewer', 'backend-reviewer', 'security-reviewer')


def command(tool, role, root=ROOT):
    if role not in ROLES:
        raise ValueError('Only independent reviewers are supported')
    if tool == 'codex':
        # Per-role sandbox_mode is ignored by current Codex. Restrict the parent.
        # Ignore user configuration (auth stays native), disable extensions, and
        # never allow approvals to expand the read-only sandbox.
        return ['codex', '--no-daemon', '-a', 'never', 'exec', '--ignore-user-config',
                '--ignore-rules', '--strict-config', '--sandbox', 'read-only',
                '-c', 'features.apps=false', '-c', 'features.plugins=false',
                '-c', 'features.request_permissions_tool=false',
                '-c', 'web_search="disabled"',
                '-c', 'projects.' + json.dumps(str(root.resolve())) + '.trust_level="trusted"',
                '--json', '-']
    if tool == 'claude':
        # --restricted skips project agent discovery; inject the reviewed adapter
        # through the native --agents option, with a fixed read-only tool pool.
        metadata = json.loads((root / 'harness/roles/registry.json').read_text())[role]
        body = ((root / f'.claude/agents/{role}.md').read_text().split('---', 2)[2]
                + '\nPrzed oceną przeczytaj harness/skills/review-change/SKILL.md.\n')
        definition = {role: {'description':metadata['description'], 'prompt':body,
                             'tools':['Read','Grep','Glob'], 'model':'inherit'}}
        return ['claude', '-p', '--agent', role, '--agents', json.dumps(definition, ensure_ascii=False), '--tools', 'Read,Grep,Glob',
                '--allowedTools', 'Read,Grep,Glob', '--restricted', '--strict-mcp-config',
                '--mcp-config', '{"mcpServers":{}}', '--setting-sources', 'project',
                '--permission-mode', 'dontAsk', '--no-session-persistence',
                '--output-format', 'stream-json', '--verbose']
    raise ValueError('Unknown tool')


def preflight(root=ROOT):
    # No silent project MCP/hooks injection into the restricted Codex parent.
    from sync import expected, sync
    files, links = expected(root)
    if sync(root, check=True):
        raise ValueError('Native adapter or skill link drift; run sync.py --check')
    registry = json.loads((root / 'harness/roles/registry.json').read_text())
    if any(registry[name]['access'] != 'read' for name in ROLES):
        raise ValueError('Reviewer access must remain read-only')
    allowed = set(files) | set(links)
    for directory in ('.codex', '.claude', '.agents'):
        for path in (root / directory).rglob('*'):
            if path.is_file() or path.is_symlink():
                if str(path.relative_to(root)) not in allowed:
                    raise ValueError('Unreviewed tool configuration: ' + str(path.relative_to(root)))
    for path in (root / 'harness/skills').rglob('*'):
        if (path.is_file() or path.is_symlink()) and (path.name != 'SKILL.md' or path.parent.parent != root / 'harness/skills'):
            raise ValueError('Unreviewed skill support file: ' + str(path))
    for path in (root / 'harness/skills').glob('*/SKILL.md'):
        header = path.read_text().split('---', 2)[1]
        if '!`' in path.read_text() or any(line and not line.startswith(('name:', 'description:')) for line in header.strip().splitlines()):
            raise ValueError('Unreviewed executable skill metadata: ' + str(path))
    if (root / '.codex/config.toml').read_text() != files['.codex/config.toml']:
        raise ValueError('Project Codex config drift: review restrictions must be reassessed')
    for path in ('.mcp.json', '.codex/hooks.json', '.claude/settings.json', '.claude/settings.local.json'):
        if (root / path).exists():
            raise ValueError('Review launcher requires inspection of new configuration: ' + path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('tool', choices=('codex', 'claude'))
    parser.add_argument('role', choices=ROLES)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--timeout', type=int, default=600)
    args = parser.parse_args()
    from runtime import fingerprint, changes, digest, run_process
    before = fingerprint(ROOT)
    preflight()
    cmd = command(args.tool, args.role)
    if args.dry_run:
        print(json.dumps(cmd))
        return 0
    task = sys.stdin.read().strip()
    if not task:
        parser.error('Provide review scope, candidate and author identity on stdin')
    prefix = ('To niezależna sesja review. Nie modyfikuj żadnych plików ani nie uruchamiaj testów '
              'z efektami zapisu. Czytaj AGENTS.md i harness/workflows/delivery.md. ')
    if args.tool == 'codex':
        prefix += (f'Uruchom dokładnie jednego natywnego subagenta dla roli {args.role}. '
                   f'Jeśli API pozwala wybrać profil, wybierz tę rolę; jeśli udostępnia tylko task_name, użyj '
                   f'{args.role.replace(chr(45), chr(95))} i przekaż obowiązek odczytu '
                   f'harness/roles/{args.role}.md oraz wspólnego workflow. '
                   'Raportuj ten wariant jako generic subagent + canonical role, nie typed profile. '
                   'Przekaż zadanie i zaczekaj na findings. ')
    if fingerprint(ROOT) != before:
        raise ValueError('Candidate changed during preflight')
    code, execution = run_process(cmd, prefix + '\n' + task, ROOT, timeout=args.timeout)
    after = fingerprint(ROOT)
    changed = changes(before, after)
    print(json.dumps({'reviewExecution':execution, 'exitCode':code, 'changedFiles':changed,
                      'candidateBefore':digest(before), 'candidateAfter':digest(after)}), file=sys.stderr)
    return (code if code is not None else 124) if not changed else 1


if __name__ == '__main__':
    sys.exit(main())
