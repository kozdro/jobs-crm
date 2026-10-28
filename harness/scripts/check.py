#!/usr/bin/env python3
"""Validate this harness only, not the product documentation or AI behavior."""
import hashlib
import json
import re
import sys
from pathlib import Path
from sync import ROOT, expected, sync

ROLES = set('spec-analyst ux-designer frontend-engineer backend-engineer frontend-reviewer backend-reviewer qa-engineer security-reviewer platform-engineer'.split())
SKILLS = set('analyze-requirement clarify-requirements plan-slice implement-slice verify-acceptance review-change record-decision component-spec form-design state-machine accessibility-audit design-qa-checklist break-ui mobile-native'.split())


def check(root=ROOT):
    errors = []
    def require(ok, message):
        if not ok:
            errors.append(message)
    registry = json.loads((root / 'harness/roles/registry.json').read_text())
    require(set(registry) == ROLES, 'role inventory')
    require({p.name for p in (root / 'harness/skills').iterdir()} == SKILLS, 'skill inventory')
    require(not sync(root, check=True), 'adapter drift (run sync.py --check)')
    files, links = expected(root)
    for folder, suffix in [('.codex/agents', '.toml'), ('.claude/agents', '.md')]:
        require({p.stem for p in (root / folder).glob('*' + suffix)} == ROLES, folder + ' unexpected/missing role')
    for folder in ['.agents/skills', '.claude/skills']:
        require({p.name for p in (root / folder).iterdir()} == SKILLS, folder + ' unexpected/missing skill')
    for name, role in registry.items():
        require((root / f'harness/roles/{name}.md').is_file(), 'missing role ' + name)
        require(set(role['skills']) <= SKILLS, 'unknown role skill ' + name)
        require(role['access'] == ('read' if name.endswith('reviewer') or name == 'spec-analyst' else 'write'), 'role access ' + name)
    for rel in links:
        require((root / rel).is_dir(), 'broken symlink ' + rel)
        require((root / rel).resolve().is_relative_to((root / 'harness/skills').resolve()), 'escaping skill link ' + rel)
    for p in (root / 'harness/skills').rglob('*'):
        if p.is_file() or p.is_symlink():
            require(p.name == 'SKILL.md' and p.parent.parent == root / 'harness/skills', 'unreviewed skill support file ' + str(p.relative_to(root)))
    for name in SKILLS:
        p = root / f'harness/skills/{name}/SKILL.md'
        if not p.is_file():
            errors.append('missing skill ' + name)
            continue
        data = p.read_text()
        front = re.match(r'\A---\n(.*?)\n---\n', data, re.S)
        require(front is not None, 'missing frontmatter ' + name)
        if front:
            fields = dict(re.findall(r'^(\w[\w-]*):\s*(.+)$', front[1], re.M))
            require(fields.get('name') == name, 'skill name ' + name)
            require(bool(fields.get('description')), 'skill description ' + name)
            require(set(fields) <= {'name', 'description', 'license', 'metadata'}, 'nonportable frontmatter ' + name)
        require('!`' not in data, 'dynamic command injection ' + name)
    vendor = root / 'harness/vendor'
    manifest = json.loads((vendor / 'manifest.json').read_text())
    sources = {s['id']: s for s in manifest['sources']}
    for source in sources.values():
        require(bool(re.fullmatch('[0-9a-f]{40}', source['commit'])), 'unpinned vendor')
        require(source['license'] == 'MIT', 'unreviewed license')
        require((vendor / source['id'] / 'LICENSE').is_file(), 'missing license')
    pinned = set()
    for entry in manifest['files']:
        p = vendor / entry['path']
        require(p.resolve().is_relative_to(vendor.resolve()), 'escaping vendor file')
        require(entry['source'] in sources, 'unknown vendor source')
        pinned.add(entry['path'])
        require(p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest() == entry['sha256'], 'vendor hash ' + entry['path'])
    actual = {str(p.relative_to(vendor)) for source in sources for p in (vendor / source).rglob('*') if p.is_file()}
    require(actual == pinned, 'unmanifested/missing vendor file')
    # Check links only in authored harness docs/adapters; external original links are upstream content.
    authored = [root / 'AGENTS.md', root / 'CLAUDE.md', root / '.github/pull_request_template.md']
    authored += list((root / 'docs/harness').rglob('*.md'))
    authored += [p for p in (root / 'harness').rglob('*.md') if 'vendor' not in p.parts]
    authored += [vendor / 'README.md']
    for p in authored:
        require(p.is_file(), 'missing ' + str(p.relative_to(root)))
        if not p.is_file():
            continue
        text = re.sub(r'```.*?```', '', p.read_text(), flags=re.S)
        for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)', text):
            if '://' in target or target.startswith('#'):
                continue
            target = target.split('#')[0]
            require((p.parent / target).exists(), f'broken link {p.relative_to(root)} -> {target}')
    return errors


if __name__ == '__main__':
    try:
        errors = check()
    except (OSError, ValueError, KeyError) as exc:
        raise SystemExit('FAIL harness validation: ' + str(exc))
    if errors:
        raise SystemExit('FAIL\n' + '\n'.join(errors))
    print('PASS harness structure, adapter equality, local links and pinned vendor integrity')
    print('Application tests and behavioral evals are NOT RUN by this check.')
