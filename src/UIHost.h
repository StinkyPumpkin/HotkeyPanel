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

#include <cstdint>
#include <filesystem>
#include <functional>
#include <string>

#include "PrismaUI_API.h"

// --Claude 2026-11-20: the web UI host the panel runs in. Magelight UI is preferred (MIT, can ship inside the
// download, newer Ultralight); PrismaUI is the fallback while both exist. Decided once at kPostLoad.
// Data/SKSE/Plugins/HotkeyPanel_PrismaUI.txt forces PrismaUI.
namespace UIHost
{
    using ViewId = std::uint64_t;                      // 0 = none
    using Listener = void (*)(const char* argument);   // window.<name>(arg) from the page
    using ReadyFn = void (*)(ViewId view);             // the page's DOM is ready (game thread on Magelight)
    using ExitFn = void (*)();                         // Magelight ended our UI mode itself (its key, a load, ...)

    bool Init();                                       // kPostLoad
    bool Ready();                                      // a host was found
    bool IsMagelight();
    const char* Name();                                // "Magelight UI 1.9.0" / "PrismaUI (v2 API)" / "none"

    // page = a file in PageRoot(). Created hidden. onExit (Magelight): our UI mode ended without our own Unfocus.
    // captureEscape (Magelight): Escape reaches the page as a key instead of ending UI mode.
    ViewId Create(const char* name, const char* page, ReadyFn onReady, ExitFn onExit, bool captureEscape);
    void Destroy(ViewId view);
    void Listen(ViewId view, const char* name, Listener cb);   // runs on the host's render thread: no RE:: work in it
    void Show(ViewId view, bool show);
    // Mouse and keys to the page. Magelight: UI mode, with other plugins' key polling left working (the toggle key
    // and the G-key bridge read the keyboard with GetAsyncKeyState).
    void Focus(ViewId view);
    void Unfocus(ViewId view);
    void Call(ViewId view, const char* script);        // run JS in the page (window.HKP.x(...))
    bool AnyFocus();                                   // any page of either host has the input (ours or another mod's)

    // Game-thread work from a listener: Magelight's PostGameTask; on PrismaUI inline (its listeners ran while the
    // game waited, as before).
    void Game(std::function<void()> fn);

    // The folder holding the panel's pages (Data/Magelight/HotkeyPanel/views or Data/PrismaUI/views/HotkeyPanel)
    std::filesystem::path PageRoot();

    // PrismaUI only (null on Magelight): the panel's PrismaUI focus recovery after close needs the raw API.
    PRISMA_UI_API::IVPrismaUI2* PrismaApi();
}
