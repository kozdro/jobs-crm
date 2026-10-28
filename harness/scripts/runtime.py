"""Small local verification helpers; no orchestration framework or model grading."""
import hashlib
import json
import os
from pathlib import Path
import signal
import shutil
import subprocess

HIDDEN_EVAL = ('harness/evals/scenarios.json', 'harness/evals/README.md',
               'docs/harness/bootstrap-plan.md', 'docs/harness/verification.md', 'harness/evals/results.json')


def candidate_paths(root):
    data = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=root)
    result = []
    for raw in sorted(set(data.split(b'\0')) - {b''}):
        rel = Path(os.fsdecode(raw))
        if any(part in {'.git', '.harness-runs', '__pycache__', 'secrets', 'private'} or
               part.startswith('.env') for part in rel.parts):
            continue
        p = root / rel
        if p.exists() or p.is_symlink():
            result.append(rel)
    return result


def fingerprint(root):
    result = {}
    # Include untracked/ignored mutations too, excluding only local logs and Git runtime metadata.
    for base, dirs, names in os.walk(root, followlinks=False):
        dirs[:] = sorted(d for d in dirs if d not in {'.git', '.harness-runs', '__pycache__'})
        for name in dirs + sorted(names):
            p = Path(base) / name
            rel = str(p.relative_to(root))
            if p.is_symlink():
                result[rel] = {'link': os.readlink(p)}
            elif p.is_file():
                result[rel] = {'sha256':hashlib.sha256(p.read_bytes()).hexdigest(), 'mode':p.stat().st_mode & 0o777}
    return result


def changes(before, after):
    return sorted(k for k in set(before) | set(after) if before.get(k) != after.get(k))


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def prepare_snapshot(root, snapshot):
    snapshot.mkdir()
    for rel in candidate_paths(root):
        p = root / rel
        target = snapshot / rel
        if str(rel) in HIDDEN_EVAL:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        if p.is_symlink():
            if not p.resolve().is_relative_to(root.resolve()):
                raise ValueError('External symlink refused: ' + str(rel))
            target.symlink_to(os.readlink(p), target_is_directory=p.is_dir())
        elif p.is_file():
            shutil.copy2(p, target)
    subprocess.run(['git', 'init', '-q', str(snapshot)], check=True)


def run_process(cmd, prompt, cwd, stdout=None, stderr=None, timeout=600, grace=2):
    proc = None
    # A nested review wrapper receives TERM and forwards it to its own CLI group.
    # Give that handler time to run before escalating to KILL.
    def interrupt(signum, frame):
        raise InterruptedError('Process interrupted by signal ' + str(signum))
    previous = signal.signal(signal.SIGTERM, interrupt)
    def terminate():
        if proc is None:
            return
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            return
        try:
            proc.communicate(timeout=grace)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.communicate()
    try:
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=stdout, stderr=stderr,
                                text=True, cwd=cwd, start_new_session=True)
        proc.communicate(prompt, timeout=timeout)
        return proc.returncode, ('TIMEOUT' if proc.returncode == 124 else
                                 'COMPLETED' if proc.returncode == 0 else 'FAILED')
    except subprocess.TimeoutExpired:
        terminate()
        return None, 'TIMEOUT'
    except BaseException:
        terminate()
        raise
    finally:
        signal.signal(signal.SIGTERM, previous)
