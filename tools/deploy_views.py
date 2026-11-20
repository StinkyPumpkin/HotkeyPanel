"""Copy the panel's page (dist/PrismaUI/views/HotkeyPanel) into the MO2 mod folder for both web UI hosts:
    <mods>/Hotkey Panel--Claude/Magelight/HotkeyPanel/views/   (Magelight UI, preferred)
    <mods>/Hotkey Panel--Claude/PrismaUI/views/HotkeyPanel/    (PrismaUI fallback)
and the G-keys add-on's js/gkeys.js override into the add-on folder the same two ways.
Refuses while Skyrim runs (MO2's virtual file system must not see mod-folder writes mid-game).
Usage: python tools/deploy_views.py [mods folder]   (default: %SKYRIM_MODS_FOLDER%)
"""
import hashlib, os, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'dist', 'PrismaUI', 'views', 'HotkeyPanel')
ADDON_JS = os.path.join(ROOT, 'addon-gkeys', 'PrismaUI', 'views', 'HotkeyPanel', 'js', 'gkeys.js')


def skyrim_running():
    out = subprocess.run(['tasklist', '/fi', 'imagename eq SkyrimSE.exe'], capture_output=True, text=True).stdout
    return 'SkyrimSE.exe' in out


def md5(p):
    return hashlib.md5(open(p, 'rb').read()).hexdigest()[:8]


def copy_tree(src, dst):
    for base, _, files in os.walk(src):
        rel = os.path.relpath(base, src)
        os.makedirs(os.path.join(dst, rel), exist_ok=True)
        for f in files:
            shutil.copy2(os.path.join(base, f), os.path.join(dst, rel, f))


def main():
    mods = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('SKYRIM_MODS_FOLDER', '')
    if not mods or not os.path.isdir(mods):
        sys.exit('no mods folder (pass it, or set SKYRIM_MODS_FOLDER)')
    if skyrim_running():
        sys.exit('Skyrim is running - not deployed')
    mod = os.path.join(mods, 'Hotkey Panel--Claude')
    targets = [os.path.join(mod, 'Magelight', 'HotkeyPanel', 'views'), os.path.join(mod, 'PrismaUI', 'views', 'HotkeyPanel')]
    for t in targets:
        copy_tree(SRC, t)
        print('views ->', t)
    addon = os.path.join(mods, 'HKP GKeys Addon--Claude')
    if os.path.isdir(addon) and os.path.isfile(ADDON_JS):
        for sub in (('Magelight', 'HotkeyPanel', 'views', 'js'), ('PrismaUI', 'views', 'HotkeyPanel', 'js')):
            d = os.path.join(addon, *sub)
            os.makedirs(d, exist_ok=True)
            shutil.copy2(ADDON_JS, os.path.join(d, 'gkeys.js'))
            print('gkeys.js ->', d)
    for f in ('index.html', os.path.join('css', 'hkp.css'), os.path.join('js', 'hkp.js')):
        print(f, md5(os.path.join(SRC, f)), [md5(os.path.join(t, f)) for t in targets])


if __name__ == '__main__':
    main()
