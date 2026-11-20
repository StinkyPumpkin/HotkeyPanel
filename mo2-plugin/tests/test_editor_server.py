"""Tests for the offline editor's server (no MO2 needed). Run: python -I mo2-plugin/tests/test_editor_server.py
Uses the page from dist/ and a temporary hotkeys.json; never touches a real one."""
import json, os, shutil, sys, tempfile, unittest, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'HotkeyPanelEditor'))
import editor_server as es  # noqa: E402

PAGE = os.path.normpath(os.path.join(HERE, '..', '..', 'dist', 'PrismaUI', 'views', 'HotkeyPanel'))


def page_files():
    files = {}
    for cur, _, names in os.walk(PAGE):
        for n in names:
            real = os.path.join(cur, n)
            rel = os.path.relpath(real, PAGE).replace('\\', '/')
            files[rel] = real
    return files


def get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=5) as r:
        return r.status, r.read()


def post(url, body, token):
    req = urllib.request.Request(url, data=body.encode('utf-8'), method='POST', headers={'X-Token': token, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


class T(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.state = os.path.join(self.tmp, 'mod', 'SKSE', 'Plugins', 'HotkeyPanel', 'hotkeys.json')
        os.makedirs(os.path.dirname(self.state))
        with open(self.state, 'w', encoding='utf-8') as f:
            json.dump({'keys': {'KeyQ': {'layers': {'default': {'label': 'Old'}}}}, 'settings': {'panelGeom': {'x': .1, 'y': .1, 'w': .5, 'h': .5}}}, f)
        es.skyrim_running = lambda: False
        self.srv = es.EditorServer(es.Setup(page_files(), self.state, self.state, [[18, 'Activate']], ['Segoe UI']))
        self.u = self.srv.url()

    def tearDown(self):
        self.srv.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_page_has_shim_after_hkp_js(self):
        code, html = get(self.u)
        html = html.decode('utf-8')
        self.assertEqual(code, 200)
        self.assertIn('__offline/offline.js', html)
        self.assertLess(html.index('js/hkp.js'), html.index('__offline/offline.js'))
        self.assertEqual(get(self.u + 'css/hkp.css')[0], 200)
        self.assertEqual(get(self.u + '__offline/offline.js')[0], 200)

    def test_not_found_and_no_escape(self):
        with self.assertRaises(urllib.error.HTTPError):
            get(self.u + 'nope.txt')
        with self.assertRaises(urllib.error.HTTPError):
            get(self.u + '../../hotkeys.json')

    def test_state_round_trip_with_bak(self):
        st = json.loads(get(self.u + 'api/state')[1])
        self.assertEqual(st['state']['keys']['KeyQ']['layers']['default']['label'], 'Old')
        new = json.dumps({'keys': {'KeyQ': {'layers': {'default': {'label': 'New'}}}}, 'settings': {}})
        code, r = post(self.u + 'api/state', new, st['token'])
        self.assertEqual((code, r['ok']), (200, True))
        self.assertEqual(json.load(open(self.state, encoding='utf-8'))['keys']['KeyQ']['layers']['default']['label'], 'New')
        self.assertEqual(json.load(open(self.state + '.bak', encoding='utf-8'))['keys']['KeyQ']['layers']['default']['label'], 'Old')
        self.assertFalse(os.path.exists(self.state + '.tmp'))
        # the new token lets the next save through
        code, r2 = post(self.u + 'api/state', new, r['token'])
        self.assertEqual(code, 200)

    def test_stale_token_refused(self):
        code, r = post(self.u + 'api/state', '{}', 'stale')
        self.assertEqual(code, 409)
        self.assertFalse(r['ok'])

    def test_refused_while_skyrim_runs(self):
        es.skyrim_running = lambda: True
        st = json.loads(get(self.u + 'api/state')[1])
        code, r = post(self.u + 'api/state', '{}', st['token'])
        self.assertEqual(code, 409)
        self.assertIn('Skyrim is running', r['error'])

    def test_broken_json_refused(self):
        st = json.loads(get(self.u + 'api/state')[1])
        code, r = post(self.u + 'api/state', '{broken', st['token'])
        self.assertEqual(code, 400)

    def test_gamekeys_and_fonts(self):
        self.assertEqual(json.loads(get(self.u + 'api/gamekeys')[1]), [[18, 'Activate']])
        self.assertEqual(json.loads(get(self.u + 'api/fonts')[1]), ['Segoe UI'])
        self.assertEqual(json.loads(get(self.u + 'api/installed')[1]), [])

    def test_installed_list_served(self):
        self.srv.update(es.Setup(page_files(), self.state, self.state, [], [], ['Skyrim', 'PEMS']))
        self.assertEqual(json.loads(get(self.u + 'api/installed')[1]), ['Skyrim', 'PEMS'])

    def test_first_save_into_overwrite(self):
        ov = os.path.join(self.tmp, 'overwrite', 'SKSE', 'Plugins', 'HotkeyPanel', 'hotkeys.json')
        self.srv.update(es.Setup(page_files(), '', ov, [], []))
        st = json.loads(get(self.u + 'api/state')[1])
        self.assertIsNone(st['state'])
        code, r = post(self.u + 'api/state', '{"keys":{}}', st['token'])
        self.assertEqual(code, 200)
        self.assertTrue(os.path.isfile(ov))


class Helpers(unittest.TestCase):
    def test_read_game_keys(self):
        tmp = tempfile.mkdtemp()
        p = os.path.join(tmp, 'controlmap.txt')
        with open(p, 'w') as f:
            f.write('// Main Gameplay\nForward\t0x11\t0xff\nScreenshot\t0xb7,0x9d\t0xff\n// Menu Mode\nAccept\t0x1c\t0xff\n')
        self.assertEqual(es.read_game_keys(['', p]), [[0x11, 'Forward'], [0xb7, 'Screenshot'], [0x9d, 'Screenshot']])
        shutil.rmtree(tmp)

    def test_app_window_command(self):
        cmd = es.app_window_command('edge.exe', 'http://127.0.0.1:5/', (10, 20, 1600, 900))
        self.assertEqual(cmd[:2], ['edge.exe', '--app=http://127.0.0.1:5/'])
        self.assertIn('--window-size=1600,900', cmd)
        self.assertIn('--window-position=10,20', cmd)
        self.assertFalse(any(a.startswith('--user-data-dir') for a in cmd))   # the user's own profile, no fresh one
        self.assertEqual(es.app_window_command('edge.exe', 'u'), ['edge.exe', '--app=u'])

    def test_installed_names(self):
        tmp = tempfile.mkdtemp()
        os.makedirs(os.path.join(tmp, 'a', 'SKSE', 'Plugins', 'sub'))
        for n in ('TFCam.dll', 'TFCam.ini', 'readme.txt'):
            open(os.path.join(tmp, 'a', 'SKSE', 'Plugins', n), 'w').close()
        open(os.path.join(tmp, 'a', 'SKSE', 'Plugins', 'sub', 'Deep.dll'), 'w').close()
        got = es.installed_names([os.path.join(tmp, 'a'), os.path.join(tmp, 'missing')], ['Skyrim.esm', 'PEMS.esp'])
        self.assertEqual(got, ['Skyrim', 'PEMS', 'TFCam'])   # top-level DLLs only, like the game's list
        self.assertEqual(es.installed_names([os.path.join(tmp, 'a')], []), [])   # no plugin list = hide nothing
        shutil.rmtree(tmp)

    def test_user_icons(self):
        tmp = tempfile.mkdtemp()
        icons = lambda mod: os.path.join(tmp, mod, 'SKSE', 'Plugins', 'HotkeyPanel', 'Icons')
        os.makedirs(os.path.join(icons('low'), 'My Combat'))
        os.makedirs(icons('high'))
        for mod, rel, data in (('low', 'My Combat/sword.png', b'low'), ('low', 'Shared.png', b'low'),
                               ('high', 'Shared.png', b'high'), ('low', 'notes.txt', b'x'), ('low', 'empty.png', b'')):
            with open(os.path.join(icons(mod), rel), 'wb') as f:
                f.write(data)
        files = es.user_icon_files([os.path.join(tmp, 'low'), os.path.join(tmp, 'high'), os.path.join(tmp, 'missing')])
        self.assertEqual(sorted(files), ['My Combat/sword.png', 'Shared.png'])   # pictures only, empty ones left out
        self.assertTrue(files['Shared.png'].startswith(os.path.join(tmp, 'high')))   # the later mod wins
        lst = es.user_icon_list(files)
        self.assertEqual(lst[0], {'id': 'u:My Combat/sword.png', 'name': 'sword', 'group': 'My Combat',
                                  'url': 'usericons/My%20Combat/sword.png'})
        self.assertEqual(lst[1]['group'], 'Your icons')
        srv = es.EditorServer(es.Setup(page_files(), os.path.join(tmp, 'hotkeys.json'), os.path.join(tmp, 'hotkeys.json'), [], [], [], files))
        try:
            self.assertEqual(json.loads(get(srv.url() + 'api/usericons')[1])[0]['id'], 'u:My Combat/sword.png')
            self.assertEqual(get(srv.url() + 'usericons/My%20Combat/sword.png'), (200, b'low'))
            self.assertEqual(get(srv.url() + 'usericons/Shared.png'), (200, b'high'))
            with self.assertRaises(urllib.error.HTTPError):
                get(srv.url() + 'usericons/notes.txt')
            with self.assertRaises(urllib.error.HTTPError):
                get(srv.url() + 'usericons/..%2F..%2Fhotkeys.json')
        finally:
            srv.stop()
            shutil.rmtree(tmp)


if __name__ == '__main__':
    unittest.main(verbosity=1)
