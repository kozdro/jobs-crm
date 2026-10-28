#!/usr/bin/env python3
"""Read native Codex skill discovery/config; don't expose user config or credentials."""
import json
import queue
import subprocess
import threading
from sync import ROOT
from check import SKILLS


def main():
    proc = subprocess.Popen(['codex', 'app-server'], cwd=ROOT, stdin=subprocess.PIPE,
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    messages = queue.Queue()
    def read():
        for line in proc.stdout:
            messages.put(json.loads(line))
        messages.put(None)
    threading.Thread(target=read, daemon=True).start()
    def rpc(number, method, params):
        proc.stdin.write(json.dumps({'id': number, 'method': method, 'params': params})+'\n')
        proc.stdin.flush()
        while True:
            data = messages.get(timeout=30)
            if data is None:
                raise RuntimeError('Codex app-server exited before response')
            if data.get('id') == number:
                if 'error' in data:
                    raise RuntimeError(str(data['error']))
                return data['result']
    try:
        rpc(1, 'initialize', {'clientInfo': {'name':'jobs-harness-discovery','version':'1'},
                              'capabilities': {'experimentalApi':True}})
        config = rpc(2, 'config/read', {'cwd':str(ROOT),'includeLayers':False})
        skills = rpc(3, 'skills/list', {'cwds':[str(ROOT)],'forceReload':True})
        found = set()
        errors = []
        for row in skills['data']:
            for skill in row.get('skills', []):
                if str(ROOT) in str(skill.get('path','')) and skill.get('enabled',True):
                    found.add(skill['name'])
            for error in row.get('errors', []):
                if str(ROOT) in str(error):
                    errors.append(error)
        agents = config['config'].get('agents', {})
        result = {'codex':subprocess.check_output(['codex','--version'],text=True).strip(),
                  'projectSkills':sorted(found), 'missingSkills':sorted(SKILLS-found),
                  'skillErrors':errors, 'agentsEnabled':agents.get('enabled'),
                  'maxConcurrentThreads':agents.get('max_concurrent_threads_per_session'),
                  'agentRoleRuntime':'NOT RUN by discovery; eval G verifies generic delegation with canonical role, not typed profile'}
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if not result['missingSkills'] and not errors and agents.get('enabled') else 1
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill(); proc.wait()


if __name__ == '__main__':
    raise SystemExit(main())
