"""Hotkey Panel offline editor - the local web server (no MO2 imports, so it can be tested on its own).

It serves the panel's own page (the files MO2 would give the game) to a browser on this PC, adds offline.js, and
reads / writes hotkeys.json the same way the game's DLL does (.tmp, then the old file kept as .bak). It never
writes while Skyrim runs (the game owns the file then), and refuses a save when the file changed since it was
loaded (the game saved meanwhile) - the page then asks for a reload.
"""
import json
import os
import re
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
         '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ttf': 'font/ttf', '.otf': 'font/otf',
         '.woff': 'font/woff', '.woff2': 'font/woff2', '.jpg': 'image/jpeg'}


def skyrim_running():
    try:
        out = subprocess.run(['tasklist', '/fi', 'imagename eq SkyrimSE.exe', '/nh'], capture_output=True, text=True,
                             creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)).stdout
        return 'skyrimse.exe' in out.lower()
    except Exception:
        return False


def file_token(path):
    try:
        return str(os.stat(path).st_mtime_ns)
    except OSError:
        return ''


class Setup:
    """Everything the server needs, worked out on MO2's own thread before the server uses it."""

    def __init__(self, files, state_read, state_write, game_keys, fonts):
        self.files = files                # 'css/hkp.css' -> real path (the winning mod's file)
        self.state_read = state_read      # real path of the hotkeys.json the game would read ('' = none yet)
        self.state_write = state_write    # where a save goes (that file, or MO2's overwrite folder)
        self.game_keys = game_keys        # [[dik, "Activate"], ...]
        self.fonts = fonts                # installed font family names


class EditorServer:
    def __init__(self, setup):
        self.setup = setup
        self.lock = threading.Lock()
        self.httpd = ThreadingHTTPServer(('127.0.0.1', 0), self._handler())
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever, name='HotkeyPanelEditor', daemon=True)
        self.thread.start()

    def url(self):
        return 'http://127.0.0.1:%d/' % self.port

    def stop(self):
        self.httpd.shutdown()
        self.httpd.server_close()

    def update(self, setup):
        with self.lock:
            self.setup = setup

    # ---- state ----
    def read_state(self):
        with self.lock:
            s = self.setup
        path = s.state_write if os.path.isfile(s.state_write) else s.state_read
        state = None
        if path and os.path.isfile(path):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    state = json.load(f)
            except Exception:
                state = None
        return {'token': file_token(path) if path else '', 'path': s.state_write, 'state': state}

    def write_state(self, body, token):
        with self.lock:
            s = self.setup
        if skyrim_running():
            return 409, {'ok': False, 'error': 'Skyrim is running - close the game first (it saves hotkeys.json itself).'}
        current = s.state_write if os.path.isfile(s.state_write) else s.state_read
        if current and token != file_token(current):
            return 409, {'ok': False, 'error': 'hotkeys.json changed since this page loaded (the game saved?) - reload the page.'}
        try:
            json.loads(body)
        except Exception:
            return 400, {'ok': False, 'error': 'not saved: the panel sent broken JSON'}
        target = s.state_write
        os.makedirs(os.path.dirname(target), exist_ok=True)
        if current and current != target and not os.path.isfile(target):
            # first save into MO2's overwrite folder: keep the file it shadows untouched
            pass
        tmp, bak = target + '.tmp', target + '.bak'
        with open(tmp, 'w', encoding='utf-8', newline='') as f:
            f.write(body)
        if os.path.isfile(target):
            try:
                os.replace(target, bak)
            except OSError:
                pass
        os.replace(tmp, target)
        return 200, {'ok': True, 'token': file_token(target), 'path': target}

    # ---- http ----
    def _handler(self):
        server = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _send(self, code, data, ctype):
                if isinstance(data, str):
                    data = data.encode('utf-8')
                self.send_response(code)
                self.send_header('Content-Type', ctype)
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def _json(self, code, obj):
                self._send(code, json.dumps(obj), 'application/json; charset=utf-8')

            def do_GET(self):
                path = self.path.split('?', 1)[0].split('#', 1)[0]
                with server.lock:
                    s = server.setup
                if path in ('/', '/index.html'):
                    real = s.files.get('index.html')
                    if not real:
                        return self._send(404, 'Hotkey Panel page not found in the enabled mods.', 'text/plain')
                    with open(real, 'r', encoding='utf-8') as f:
                        html = f.read()
                    tag = '<script src="__offline/offline.js"></script>\n'
                    m = re.search(r'<script src="js/hkp\.js[^"]*"></script>\s*', html)
                    html = html[:m.end()] + tag + html[m.end():] if m else html.replace('</body>', tag + '</body>', 1)
                    return self._send(200, html, TYPES['.html'])
                if path == '/__offline/offline.js':
                    with open(os.path.join(HERE, 'offline.js'), 'r', encoding='utf-8') as f:
                        return self._send(200, f.read(), TYPES['.js'])
                if path == '/api/state':
                    return self._json(200, server.read_state())
                if path == '/api/gamekeys':
                    return self._json(200, s.game_keys)
                if path == '/api/fonts':
                    return self._json(200, s.fonts)
                rel = path.lstrip('/').replace('\\', '/')
                real = s.files.get(rel) or s.files.get(rel.lower())
                if not real or '..' in rel:
                    return self._send(404, 'not found', 'text/plain')
                with open(real, 'rb') as f:
                    data = f.read()
                return self._send(200, data, TYPES.get(os.path.splitext(real)[1].lower(), 'application/octet-stream'))

            def do_POST(self):
                path = self.path.split('?', 1)[0]
                if path != '/api/state':
                    return self._send(404, 'not found', 'text/plain')
                n = int(self.headers.get('Content-Length') or 0)
                body = self.rfile.read(n).decode('utf-8') if n else ''
                code, obj = server.write_state(body, self.headers.get('X-Token', ''))
                return self._json(code, obj)

        return H


# ---- helpers the plugin uses to build a Setup ----

def read_game_keys(paths):
    """Skyrim's gameplay keyboard binds from the first controlmap file that exists ([[dik, event], ...])."""
    for p in paths:
        if not p or not os.path.isfile(p):
            continue
        out, ctx = [], None
        with open(p, 'r', encoding='utf-8', errors='replace') as f:
            for line in f:
                t = line.strip()
                if t.startswith('//'):
                    ctx = t[2:].strip().lower()
                    continue
                if not t or ctx is None or not ctx.startswith('main gameplay'):
                    continue
                cols = re.split(r'\t+', t)
                if len(cols) < 2:
                    continue
                for part in re.split(r'[+,]', cols[1]):
                    part = part.strip()
                    if part.lower().startswith('0x'):
                        try:
                            v = int(part, 16)
                        except ValueError:
                            continue
                        if v != 0xFF and v < 256:
                            out.append([v, cols[0]])
        return out
    return []


def installed_fonts():
    names = set()
    try:
        import winreg
        for hive, key in ((winreg.HKEY_LOCAL_MACHINE, r'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'),
                          (winreg.HKEY_CURRENT_USER, r'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts')):
            try:
                with winreg.OpenKey(hive, key) as k:
                    i = 0
                    while True:
                        try:
                            name = winreg.EnumValue(k, i)[0]
                        except OSError:
                            break
                        i += 1
                        name = re.sub(r'\s*\((TrueType|OpenType)\)\s*$', '', name)
                        name = re.sub(r'\s+(Bold|Italic|Light|Medium|Semibold|SemiBold|Black|Regular|Thin)( (Bold|Italic))*$', '', name)
                        for part in name.split(' & '):
                            if part.strip():
                                names.add(part.strip())
            except OSError:
                pass
    except ImportError:
        pass
    return sorted(names, key=str.lower)


def documents_dir():
    try:
        import ctypes
        buf = ctypes.create_unicode_buffer(260)
        if ctypes.windll.shell32.SHGetFolderPathW(None, 5, None, 0, buf) == 0:   # CSIDL_PERSONAL
            return buf.value
    except Exception:
        pass
    return os.path.join(os.path.expanduser('~'), 'Documents')
