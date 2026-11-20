"""Hotkey Panel Editor - an MO2 plugin: edit the Hotkey Panel's key names, colours and profiles outside the game.

Tools > "Hotkey Panel - edit offline" opens the panel's own page in your web browser, with the files MO2 would give
the game (so add-ons such as the G-keys column show too), and saves every change straight into the hotkeys.json the
game reads. Saving is refused while Skyrim runs: the game owns that file then.
"""
import logging
import os
from typing import List

import mobase
from PyQt6.QtCore import QUrl
from PyQt6.QtGui import QDesktopServices, QIcon
from PyQt6.QtWidgets import QMessageBox

from . import editor_server as es

VERSION = (2, 0, 0)
STATE_REL = os.path.join('SKSE', 'Plugins', 'HotkeyPanel', 'hotkeys.json')
PAGE_DIRS = (os.path.join('Magelight', 'HotkeyPanel', 'views'), os.path.join('PrismaUI', 'views', 'HotkeyPanel'))
_log = logging.getLogger('HotkeyPanelEditor')


class HotkeyPanelEditor(mobase.IPluginTool):
    def __init__(self):
        super().__init__()
        self._organizer = None
        self._server = None

    def init(self, organizer: mobase.IOrganizer) -> bool:
        self._organizer = organizer
        return True

    def name(self) -> str:
        return 'Hotkey Panel Editor'

    def author(self) -> str:
        return 'StinkyPumpkin'

    def description(self) -> str:
        return 'Edit the Hotkey Panel (names, colours, profiles, settings) outside the game, in your web browser.'

    def version(self) -> mobase.VersionInfo:
        return mobase.VersionInfo(*VERSION, mobase.ReleaseType.FINAL)

    def settings(self) -> List[mobase.PluginSetting]:
        return []

    def displayName(self) -> str:
        return 'Hotkey Panel - edit offline'

    def tooltip(self) -> str:
        return self.description()

    def icon(self):
        return QIcon()

    # ---- the files MO2 would give the game ----
    def _active_mod_dirs(self):
        ml = self._organizer.modList()
        out = []
        for name in ml.allModsByProfilePriority():   # lowest priority first
            name = str(name)
            try:
                if not (int(ml.state(name)) & int(mobase.ModState.ACTIVE)):
                    continue
                mod = ml.getMod(name)
                if mod is not None and not mod.isSeparator():
                    out.append(mod.absolutePath())
            except Exception:
                continue
        out.append(self._organizer.overwritePath())   # overwrite wins over every mod
        return out

    def _page_files(self):
        dirs = self._active_mod_dirs()
        for page in PAGE_DIRS:   # Magelight first, PrismaUI as the fallback (the host the DLL prefers)
            files = {}
            for base in dirs:
                root = os.path.join(base, page)
                if not os.path.isdir(root):
                    continue
                for cur, _, names in os.walk(root):
                    for n in names:
                        real = os.path.join(cur, n)
                        rel = os.path.relpath(real, root).replace('\\', '/')
                        files[rel] = real
                        files[rel.lower()] = real
            if 'index.html' in files:
                return files
        return {}

    def _setup(self):
        org = self._organizer
        read = org.resolvePath(STATE_REL.replace('\\', '/')) or ''
        write = read or os.path.join(org.overwritePath(), STATE_REL)
        keys_paths = [os.path.join(es.documents_dir(), 'My Games', 'Skyrim Special Edition', 'ControlMap_Custom.txt'),
                      org.resolvePath('Interface/Controls/PC/controlmap.txt') or '']
        return es.Setup(self._page_files(), read, write, es.read_game_keys(keys_paths), es.installed_fonts())

    def display(self):
        try:
            setup = self._setup()
            if 'index.html' not in setup.files:
                QMessageBox.warning(None, 'Hotkey Panel Editor',
                                    'The Hotkey Panel page was not found in the enabled mods.\n'
                                    'Enable Hotkey Panel in the left pane, then try again.')
                return
            if self._server is None:
                self._server = es.EditorServer(setup)
            else:
                self._server.update(setup)
            QDesktopServices.openUrl(QUrl(self._server.url()))
        except Exception as e:
            _log.exception('Hotkey Panel Editor: could not open')
            QMessageBox.warning(None, 'Hotkey Panel Editor', 'Could not open the editor:\n%s' % e)


def createPlugin():
    return HotkeyPanelEditor()
