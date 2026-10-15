"""Run both servers; stop the container if either server exits."""
import os
import signal
import subprocess
import time
import urllib.error
import urllib.request


def main():
    stopping = False
    children = []

    def request_stop(signum, frame):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    port = int(os.environ.get('PORT', '8080'))
    if port == 8001:
        raise ValueError('PORT 8001 is reserved for the internal API')
    try:
        api = subprocess.Popen([
            'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8001',
            '--timeout-keep-alive', '65',
        ], cwd='/app')
        children.append(api)
        deadline = time.monotonic() + 30
        while not stopping:
            if api.poll() is not None or time.monotonic() > deadline:
                raise RuntimeError('Internal API failed to start')
            try:
                with urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=1):
                    break
            except (urllib.error.URLError, TimeoutError):
                time.sleep(0.1)
        if stopping:
            return 0
        web_env = dict(os.environ, HOSTNAME='0.0.0.0', PORT=str(port))
        for key in ('GEMINI_API_KEY', 'GOOGLE_API_KEY'):
            web_env.pop(key, None)
        children.append(subprocess.Popen(['node', 'server.js'], cwd='/web', env=web_env))
        while not stopping:
            if any(child.poll() is not None for child in children):
                print('A FinScope server exited; stopping the container.', flush=True)
                return 1
            time.sleep(0.2)
        return 0
    finally:
        for child in children:
            if child.poll() is None:
                child.terminate()
        deadline = time.monotonic() + 7
        for child in children:
            try:
                child.wait(timeout=max(0.1, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()


if __name__ == '__main__':
    raise SystemExit(main())
