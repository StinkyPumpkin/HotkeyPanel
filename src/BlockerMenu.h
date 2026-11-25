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

#include <RE/Skyrim.h>
#include <SKSE/SKSE.h>

// Headless Scaleform blocker menu — same pattern as FollowerUI/WhoreHorde
// and SLUI. Provides cursor + input-context separation so the PrismaUI
// overlay is clickable, WITHOUT hiding HUD or blocking Tab/Tween after close.
class BlockerMenu : public RE::IMenu {
public:
    static constexpr const char* MENU_NAME = "HKP_Blocker";

    BlockerMenu();
    ~BlockerMenu() override = default;

    static RE::IMenu* Creator() { return new BlockerMenu(); }
    static void Register();
    static void Open();
    static void Close();
    static bool IsOpen();
};
