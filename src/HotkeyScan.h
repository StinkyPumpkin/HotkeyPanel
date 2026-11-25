// Hotkey Panel - in-game hotkey reference panel
// Copyright (C) 2026 StinkyPumpkin
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without
// even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
// General Public License for more details.
//
// You should have received a copy of the GNU General Public License along with this program. If
// not, see <https://www.gnu.org/licenses/>.

#pragma once

#include <functional>
#include <string>

// --Claude 2026-10-01: finds other mods' hotkeys in their config FILES, so the panel can show
// them without the mod announcing anything:
//   * MCM Helper menus: the keymaps in MCM/Config/<mod>/config.json, values from
//     MCM/Settings/<mod>.ini (else the menu's own settings.ini defaults) and
//     MCM/Settings/keybinds.json (keymaps with no ini setting).
//   * ini / json settings under SKSE/Plugins (and MCM/Settings of menus with no loose config)
//     whose NAME says hotkey ("iToggleKey", "hideHotkeyDX", "Alternate action hotkey"...).
// Classic SkyUI MCMs keep their keys in the save only; those still arrive through MCM
// Unlocked's HKP_SetHotkey announce. Reads files only, never runs a menu or edits a file.
namespace HotkeyScan
{
    // Scans on a worker thread and hands `done` the result JSON (on that thread):
    //   {"files":N,"ms":N,"entries":[{"src","dik","mods":[dik..],"owner","label","where","mcm","ctx"}]}
    // False when a scan is already running.
    bool Start(std::function<void(std::string)> done);
}
