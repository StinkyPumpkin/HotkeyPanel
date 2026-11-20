"""Builds the Nexus / GitHub release zips into release/ (nothing in the MO2 mod folders is touched).

  Hotkey Panel <version>.zip                  - FOMOD: the panel (always) + the G-keys add-on (a Yes / No question)
  Hotkey Panel Offline Editor <version>.zip   - the MO2 plugin, a manual download (copy into MO2's plugins folder)

Run after build.bat (both DLLs must be built):  python tools/make_release.py
"""
import hashlib, os, re, shutil, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, 'build', 'ng', 'release')
VIEWS = os.path.join(ROOT, 'dist', 'PrismaUI', 'views', 'HotkeyPanel')
ICONS = os.path.join(ROOT, 'dist', 'Icons')
GKEYS_JS = os.path.join(ROOT, 'addon-gkeys', 'PrismaUI', 'views', 'HotkeyPanel', 'js', 'gkeys.js')
EDITOR = os.path.join(ROOT, 'mo2-plugin', 'HotkeyPanelEditor')
OUT = os.path.join(ROOT, 'release')
NAME = 'Hotkey Panel'
WEBSITE = 'https://github.com/StinkyPumpkin/HotkeyPanel'
# the two places the page lives in the game: Magelight UI (required) and PrismaUI (fallback)
PAGE_DIRS = (('Magelight', 'HotkeyPanel', 'views'), ('PrismaUI', 'views', 'HotkeyPanel'))

INFO_XML = '''<?xml version="1.0" encoding="utf-8"?>
<fomod>
  <Name>{name}</Name>
  <Author>StinkyPumpkin</Author>
  <Version MachineVersion="{ver}">{ver}</Version>
  <Website>{web}</Website>
  <Description>A keyboard and mouse overlay with every hotkey of every mod: names, colours, icons, profiles, a tablet remote.</Description>
  <Groups>
    <element>User Interface</element>
  </Groups>
</fomod>
'''

MODULE_XML = r'''<?xml version="1.0" encoding="utf-8"?>
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://qconsulting.ca/fo3/ModConfig5.0.xsd">
  <moduleName>{name}</moduleName>
  <moduleImage path="fomod\images\banner.png" />
  <requiredInstallFiles>
    <folder source="core" destination="" priority="0" />
  </requiredInstallFiles>
  <installSteps order="Explicit">
    <installStep name="G-keys">
      <optionalFileGroups order="Explicit">
        <group name="Does your keyboard have G-keys (extra macro keys)?" type="SelectExactlyOne">
          <plugins order="Explicit">
            <plugin name="No">
              <description>Hotkey Panel only. Nothing else is needed.</description>
              <image path="fomod\images\banner.png" />
              <typeDescriptor>
                <type name="Recommended" />
              </typeDescriptor>
            </plugin>
            <plugin name="Yes - G-keys add-on">
              <description>For G-keys set to send F13-F24 in the keyboard's own software (Logitech G HUB, Corsair iCUE, Razer Synapse and others).
- GKeysInputBridge.dll: F13-F24 become real keys in Skyrim, so any mod can bind them (Skyrim itself stops at F12).
- A G-key column on the panel: G1-G6 = F19-F24. Another set-up: edit js\gkeys.js (Magelight\HotkeyPanel\views and PrismaUI\views\HotkeyPanel).</description>
              <image path="fomod\images\banner.png" />
              <files>
                <folder source="gkeys" destination="" priority="1" />
              </files>
              <typeDescriptor>
                <type name="Optional" />
              </typeDescriptor>
            </plugin>
          </plugins>
        </group>
      </optionalFileGroups>
    </installStep>
  </installSteps>
</config>
'''

EDITOR_TXT = '''Hotkey Panel Offline Editor {ver} - Mod Organizer 2 plugin

Edit your Hotkey Panel (names, colours, icons, borders, profiles) with Skyrim closed.

Needs: Mod Organizer 2 (2.5 or newer), Microsoft Edge or Google Chrome, Hotkey Panel enabled in MO2.

Install:
1. Close Mod Organizer 2.
2. Copy the HotkeyPanelEditor folder into MO2's plugins folder (next to ModOrganizer.exe: plugins\\HotkeyPanelEditor).
3. Start MO2. Tools (puzzle piece) > Hotkey Panel - edit offline.

The editor opens in a window of its own and saves straight to hotkeys.json (only while Skyrim is closed).
Settings > Plugins > Hotkey Panel Editor > browser_tab = true opens a normal browser tab instead.
'''


def version():
    m = re.search(r'project\(\s*\S+\s+VERSION\s+([\d.]+)', open(os.path.join(ROOT, 'CMakeLists.txt'), encoding='utf-8').read())
    return m.group(1)


def copy_tree(src, dst, skip=()):
    for base, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if d not in ('__pycache__',)]
        rel = os.path.relpath(base, src)
        for f in files:
            if f in skip or f.endswith('.pyc'):
                continue
            os.makedirs(os.path.join(dst, rel), exist_ok=True)
            shutil.copy2(os.path.join(base, f), os.path.join(dst, rel, f))


def make_zip(folder, zip_path):
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for base, _, files in os.walk(folder):
            for f in sorted(files):
                real = os.path.join(base, f)
                z.write(real, os.path.relpath(real, folder).replace(os.sep, '/'))


def check(folder):
    """Plain names only (no --Claude), no stray files, no adult words in any path."""
    bad = []
    for base, _, files in os.walk(folder):
        for f in files:
            rel = os.path.relpath(os.path.join(base, f), folder)
            low = rel.lower()
            if '--claude' in low or low.endswith(('.pyc', '.log', '.bak', '.tmp')):
                bad.append('stray: ' + rel)
            if re.search(r'nsfw|whore|strip|nude|sexlab|lewd|dav_', low):
                bad.append('adult word in a file name: ' + rel)
    return bad


def main():
    ver = version()
    dlls = {n: os.path.join(BUILD, n) for n in ('HotkeyPanelPrisma.dll', 'GKeysInputBridge.dll')}
    missing = [n for n, p in dlls.items() if not os.path.isfile(p)]
    if missing:
        sys.exit('build first (build.bat): ' + ', '.join(missing))
    stage = os.path.join(OUT, 'stage')
    shutil.rmtree(stage, ignore_errors=True)
    main_dir, ed_dir = os.path.join(stage, 'main'), os.path.join(stage, 'editor')

    # --- the FOMOD package ---
    core = os.path.join(main_dir, 'core')
    os.makedirs(os.path.join(core, 'SKSE', 'Plugins'))
    shutil.copy2(dlls['HotkeyPanelPrisma.dll'], os.path.join(core, 'SKSE', 'Plugins'))
    for parts in PAGE_DIRS:
        copy_tree(VIEWS, os.path.join(core, *parts))
    copy_tree(ICONS, os.path.join(core, 'Icons'))
    shutil.copy2(os.path.join(ROOT, 'README.md'), os.path.join(core, NAME + 'README.md'))
    gk = os.path.join(main_dir, 'gkeys')
    os.makedirs(os.path.join(gk, 'SKSE', 'Plugins'))
    shutil.copy2(dlls['GKeysInputBridge.dll'], os.path.join(gk, 'SKSE', 'Plugins'))
    for parts in PAGE_DIRS:
        os.makedirs(os.path.join(gk, *parts, 'js'))
        shutil.copy2(GKEYS_JS, os.path.join(gk, *parts, 'js', 'gkeys.js'))
    fom = os.path.join(main_dir, 'fomod')
    os.makedirs(os.path.join(fom, 'images'))
    shutil.copy2(os.path.join(ROOT, 'branding', 'hotkey_panel_banner.png'), os.path.join(fom, 'images', 'banner.png'))
    with open(os.path.join(fom, 'info.xml'), 'w', encoding='utf-8', newline='\r\n') as f:
        f.write(INFO_XML.format(name=NAME, ver=ver, web=WEBSITE))
    with open(os.path.join(fom, 'ModuleConfig.xml'), 'w', encoding='utf-8', newline='\r\n') as f:
        f.write(MODULE_XML.format(name=NAME))

    # --- the offline editor (manual download) ---
    copy_tree(EDITOR, os.path.join(ed_dir, 'HotkeyPanelEditor'))
    with open(os.path.join(ed_dir, 'Hotkey Panel Offline Editor - install.txt'), 'w', encoding='utf-8', newline='\r\n') as f:
        f.write(EDITOR_TXT.format(ver=ver))

    bad = check(main_dir) + check(ed_dir)
    if bad:
        sys.exit('NOT packed:\n  ' + '\n  '.join(bad))
    zips = [(main_dir, os.path.join(OUT, '%s %s.zip' % (NAME, ver))),
            (ed_dir, os.path.join(OUT, '%s Offline Editor %s.zip' % (NAME, ver)))]
    for folder, path in zips:
        make_zip(folder, path)
        with zipfile.ZipFile(path) as z:
            names = z.namelist()
        md5 = hashlib.md5(open(path, 'rb').read()).hexdigest()[:8]
        print('%s  %d files  %.2f MB  md5 %s' % (os.path.basename(path), len(names), os.path.getsize(path) / 1048576, md5))
    shutil.rmtree(stage, ignore_errors=True)


if __name__ == '__main__':
    main()
