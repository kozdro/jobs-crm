"""Negative tests for the maintenance gates; no model responses are mocked as PASS."""
import json
from pathlib import Path
import shutil
import tempfile
import unittest
import subprocess
import runtime
import check
import review
import sync


class HarnessTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / 'repo'
        shutil.copytree(sync.ROOT, self.root, symlinks=True, ignore=shutil.ignore_patterns('.git', '.harness-runs', '__pycache__'))

        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)

    def tearDown(self):
        self.tmp.cleanup()

    def test_baseline(self):
        self.assertEqual(check.check(self.root), [])

    def test_changed_adapter_fails_without_repair(self):
        p = self.root / '.claude/agents/backend-reviewer.md'
        p.write_text(p.read_text().replace('["Read", "Grep", "Glob"]', '["Read", "Bash"]'))
        before = p.read_bytes()
        self.assertIn('adapter drift (run sync.py --check)', check.check(self.root))
        self.assertEqual(p.read_bytes(), before)

    def test_missing_and_broken_skill_link_fail(self):
        p = self.root / '.agents/skills/analyze-requirement'
        p.unlink()
        p.symlink_to('/nonexistent-jobs-crm-test-skill')
        errors = check.check(self.root)
        self.assertTrue(any('broken symlink' in e for e in errors))
        self.assertTrue(any('escaping skill link' in e for e in errors))

    def test_vendor_tampering_fails(self):
        p = self.root / 'harness/vendor/emilkowalski-skills/skills/break-ui/CATALOG.md'
        p.write_text(p.read_text() + '\nChanged\n')
        self.assertTrue(any('vendor hash' in e for e in check.check(self.root)))

    def test_unmanifested_vendor_script_fails(self):
        (self.root / 'harness/vendor/designer-skills/install.sh').write_text('exit 0\n')
        self.assertIn('unmanifested/missing vendor file', check.check(self.root))

    def test_broken_document_link_fails(self):
        p = self.root / 'docs/harness/README.md'
        p.write_text(p.read_text() + '\n[missing](missing.md)\n')
        self.assertTrue(any('broken link' in e for e in check.check(self.root)))

    def test_sync_refuses_to_overwrite_skill_directory(self):
        p = self.root / '.claude/skills/analyze-requirement'
        p.unlink(); p.mkdir()
        with self.assertRaises(ValueError):
            sync.sync(self.root)

    def test_review_rejects_new_configuration(self):
        (self.root / '.mcp.json').write_text('{}')
        with self.assertRaises(ValueError):
            review.preflight(self.root)

    def test_review_rejects_project_config_drift(self):
        p = self.root / '.codex/config.toml'
        p.write_text(p.read_text() + '\n[features]\napps = true\n')
        with self.assertRaises(ValueError):
            review.preflight(self.root)

    def test_review_has_no_writer_role(self):
        with self.assertRaises(ValueError):
            review.command('codex', 'backend-engineer')

    def test_launchers_restrict_native_tools(self):
        c = review.command('codex', 'backend-reviewer')
        self.assertEqual(c[c.index('--sandbox')+1], 'read-only')
        self.assertEqual(c[c.index('-a')+1], 'never')
        self.assertIn('--ignore-user-config', c)
        a = review.command('claude', 'security-reviewer')
        self.assertEqual(a[a.index('--tools')+1], 'Read,Grep,Glob')
        self.assertIn('--strict-mcp-config', a)
        self.assertIn('--restricted', a)
        self.assertIn('--no-session-persistence', a)
        self.assertEqual(a[a.index('--permission-mode')+1], 'dontAsk')
        self.assertEqual(a[a.index('--setting-sources')+1], 'project')
        definition = json.loads(a[a.index('--agents')+1])['security-reviewer']
        self.assertEqual(definition['tools'], ['Read','Grep','Glob'])
        self.assertIn('harness/skills/review-change/SKILL.md', definition['prompt'])
        for flag in ['features.apps=false','features.plugins=false','features.request_permissions_tool=false','web_search="disabled"']:
            self.assertIn(flag, c)
        self.assertIn('projects.' + json.dumps(str(sync.ROOT.resolve())) + '.trust_level="trusted"', c)

    def test_review_rejects_codex_role_config_injection(self):
        p = self.root / '.codex/agents/backend-reviewer.toml'
        p.write_text(p.read_text() + '\n[mcp_servers.mutator]\ncommand = "bad"\n')
        with self.assertRaises(ValueError):
            review.preflight(self.root)

    def test_review_rejects_claude_role_hook(self):
        p = self.root / '.claude/agents/backend-reviewer.md'
        p.write_text(p.read_text().replace('model: inherit', 'hooks: {}\nmodel: inherit'))
        with self.assertRaises(ValueError):
            review.preflight(self.root)

    def test_review_rejects_unknown_tool_file(self):
        (self.root / '.claude/unreviewed.json').write_text('{}')
        with self.assertRaises(ValueError):
            review.preflight(self.root)

    def test_fingerprint_detects_mutations_and_links(self):
        before = runtime.fingerprint(self.root)
        p = self.root / 'AGENTS.md'; p.write_text(p.read_text() + '\nchanged\n')
        (self.root / 'CLAUDE.md').unlink()
        (self.root / 'new.txt').write_text('new')
        (self.root / 'external-link').symlink_to('/tmp')
        changed = runtime.changes(before, runtime.fingerprint(self.root))
        self.assertEqual(changed, ['AGENTS.md', 'CLAUDE.md', 'external-link', 'new.txt'])

    def test_snapshot_excludes_secrets_and_rubric(self):
        (self.root / '.env').write_text('SYNTHETIC_TEST_SECRET=fixture')
        (self.root / 'private').mkdir(); (self.root / 'private/cv.txt').write_text('synthetic')
        (self.root / '.harness-runs').mkdir(); (self.root / '.harness-runs/log').write_text('synthetic')
        snapshot = Path(self.tmp.name) / 'snapshot'
        runtime.prepare_snapshot(self.root, snapshot)
        for rel in runtime.HIDDEN_EVAL + ('.env', 'private/cv.txt', '.harness-runs/log'):
            self.assertFalse((snapshot / rel).exists(), rel)
        self.assertTrue((snapshot / '.agents/skills/review-change').is_symlink())
        self.assertTrue((snapshot / '.agents/skills/review-change/SKILL.md').is_file())
        review.preflight(snapshot)

    def test_snapshot_refuses_external_symlink(self):
        (self.root / 'external-link').symlink_to('/tmp')
        with self.assertRaises(ValueError):
            runtime.prepare_snapshot(self.root, Path(self.tmp.name) / 'snapshot')

    def test_process_exit_and_timeout_are_not_pass(self):
        import sys
        self.assertEqual(runtime.run_process([sys.executable, '-c', 'raise SystemExit(7)'], '', self.root), (7, 'FAILED'))
        self.assertEqual(runtime.run_process([sys.executable, '-c', 'import time; time.sleep(10)'], '', self.root, timeout=0.05), (None, 'TIMEOUT'))

    def test_skill_support_files_fail_closed(self):
        p = self.root / 'harness/skills/analyze-requirement/agents'
        p.mkdir(); (p / 'openai.yaml').write_text('dependencies: {}\n')
        with self.assertRaises(ValueError):
            review.preflight(self.root)
        self.assertTrue(any('unreviewed skill support file' in e for e in check.check(self.root)))

    def test_nested_timeout_terminates_term_ignoring_started_grandchild(self):
        import os
        import sys
        started = Path(self.tmp.name) / 'started'
        marker = Path(self.tmp.name) / 'unexpected-write'
        child = ('import os,signal,time; from pathlib import Path; '
                 'signal.signal(signal.SIGTERM,signal.SIG_IGN); '
                 'Path(' + repr(str(started)) + ').write_text(str(os.getpid())); '
                 'time.sleep(10); Path(' + repr(str(marker)) + ').write_text("leaked")')
        wrapper = ('import sys; sys.path.insert(0, ' + repr(str(sync.ROOT / 'harness/scripts')) + '); '
                   'from runtime import run_process; run_process(' + repr([sys.executable, '-c', child]) + ', "", ' + repr(str(self.root)) + ', timeout=20)')
        with open('/dev/null', 'w') as output:
            code, status = runtime.run_process([sys.executable, '-c', wrapper], '', self.root,
                                               stdout=output, stderr=output, timeout=1, grace=5)
        self.assertEqual(status, 'TIMEOUT')
        self.assertTrue(started.exists(), 'test requires an actually started grandchild')
        with self.assertRaises(ProcessLookupError):
            os.kill(int(started.read_text()), 0)
        self.assertFalse(marker.exists(), 'grandchild survived outer timeout')


if __name__ == '__main__':
    unittest.main()
