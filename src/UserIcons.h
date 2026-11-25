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

#include <filesystem>
#include <string>

// --Claude 2026-11-20: the user's own key pictures - PNG, JPG, SVG, WEBP or GIF files in Data/Icons, a folder
// named Icons at the top of a mod (with MO2: best a mod of their own, so an update of the panel never takes
// them away). Folders inside become groups in the panel's icon picker. Files are only read, never changed.
namespace UserIcons
{
    std::filesystem::path Dir();

    // A fingerprint of the folder (names, sizes, times): the panel only gets the pictures again when it changed.
    std::string Signature();

    // The list for the panel: [{"id":"u:<path>","name","group","url"}], <path> relative with forward slashes.
    // dataUrls: each picture rides inside the list as a data: URL (the in-game page - its host may not read
    // files outside the page's own folder); otherwise url = "usericons/<path>" (the tablet server serves those).
    // `count` / `bytes` (optional) get what went in.
    std::string BuildJson(bool dataUrls, int* count = nullptr, std::size_t* bytes = nullptr);

    // One picture by its relative path (forward slashes), only inside the folder and only picture files.
    bool Read(const std::string& rel, std::string& data, std::string& mime);
}
