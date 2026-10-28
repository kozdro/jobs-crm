#!/usr/bin/env python3
"""Run one native CLI case in an isolated snapshot. Never auto-grade AI behavior."""
import argparse
import json
import subprocess
from pathlib import Path
import tempfile
import time
from review import command, preflight
from sync import ROOT


from runtime import fingerprint, changes, digest, prepare_snapshot, run_process


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('tool', choices=('codex', 'claude'))
    parser.add_argument('case', choices=list('ABCDEFG'))
    parser.add_argument('--timeout', type=int, default=600)
    args = parser.parse_args()
    if args.timeout < 10:
        parser.error('--timeout must be at least 10 seconds')
    preflight()
    from runtime import HIDDEN_EVAL
    source = {k:v for k,v in fingerprint(ROOT).items() if k not in HIDDEN_EVAL}
    cases = json.loads((ROOT / 'harness/evals/scenarios.json').read_text())
    case = next(c for c in cases if c['id'] == args.case)
    run = ROOT / '.harness-runs' / f'{args.tool}-{args.case}-{time.time_ns()}'
    run.mkdir(parents=True)
    with tempfile.TemporaryDirectory(prefix='jobs-harness-eval-') as tmp:
        snapshot = Path(tmp).resolve() / 'repo'
        prepare_snapshot(ROOT, snapshot)
        before = fingerprint(snapshot)
        if args.tool == 'codex':
            cmd = command('codex', 'backend-reviewer', snapshot)
            prompt = case['prompt']
        else:
            cmd = command('claude', 'backend-reviewer', snapshot)
            if args.case != 'G':
                i = cmd.index('--agent'); del cmd[i:i+2]
                i = cmd.index('--agents'); del cmd[i:i+2]
                cmd.remove('--restricted')
                cmd += ['--disallowedTools', 'Edit,Write,Bash,NotebookEdit']
                cmd[cmd.index('--tools')+1] = 'Read,Grep,Glob,Skill,Agent'
                cmd[cmd.index('--allowedTools')+1] = 'Read,Grep,Glob,Skill,Agent'
            prompt = case['prompt']
        if args.case == 'G':
            # Exercise the shipped wrapper, including preflight and candidate comparison.
            import sys
            cmd = [sys.executable, str(snapshot / 'harness/scripts/review.py'), args.tool, 'backend-reviewer', '--timeout', str(args.timeout-5)]
            prompt = ('Autor fixture: odrębna sesja bootstrap spec_analysis; kandydat to cały syntetyczny plik. ' + prompt)
        started = time.monotonic()
        with (run / 'stdout.jsonl').open('w') as out, (run / 'stderr.txt').open('w') as err:
            code, execution = run_process(cmd, prompt, snapshot, out, err, args.timeout, grace=5 if args.case == 'G' else 2)
        after = fingerprint(snapshot)
        changed = changes(before, after)
        sessions = set()
        for line in (run / 'stdout.jsonl').read_text().splitlines():
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if event.get('thread_id'):
                sessions.add(event['thread_id'])
            if event.get('session_id'):
                sessions.add(event['session_id'])
        source_after = {k:v for k,v in fingerprint(ROOT).items() if k not in HIDDEN_EVAL}
        source_changed = changes(source, source_after)
        report = {'cliVersion':subprocess.check_output([args.tool, '--version'],text=True).strip(),
                  'sessions':sorted(sessions), 'snapshotFiles':before, 'candidateDigest':digest(source),
                  'sourceChangedFiles':source_changed,
                  'tool': args.tool, 'case': args.case, 'execution': execution, 'exitCode': code,
                  'elapsedSeconds': round(time.monotonic()-started, 2), 'changedFiles': changed,
                  'snapshotDigest': digest(before),
                  'behaviorGrade': 'NOT GRADED', 'applicationTests': 'NOT RUN',
                  'command': cmd, 'prompt': prompt}
        (run / 'execution.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
        print(json.dumps({'path': str(run.relative_to(ROOT)), **{k: report[k] for k in ['execution','exitCode','changedFiles','behaviorGrade']}}))
        return 0 if code == 0 and not changed and not source_changed else 1


if __name__ == '__main__':
    raise SystemExit(main())
