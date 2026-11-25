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

#include "JsonStore.h"
#include <SKSE/SKSE.h>
#include <filesystem>
#include <fstream>
#include <mutex>
#include <sstream>

namespace fs = std::filesystem;

namespace JsonStore {

    std::string GetStatePath() {
        // Skyrim launches with CWD = game root. "Data/SKSE/Plugins/HotkeyPanel/"
        fs::path p = fs::current_path() / "Data" / "SKSE" / "Plugins" / "HotkeyPanel";
        std::error_code ec;
        fs::create_directories(p, ec);
        p /= "hotkeys.json";
        return p.string();
    }

    std::string Load() {
        try {
            fs::path p = GetStatePath();
            if (!fs::exists(p)) return "";
            std::ifstream f(p, std::ios::binary);
            if (!f) return "";
            std::stringstream ss;
            ss << f.rdbuf();
            return ss.str();
        } catch (const std::exception& e) {
            SKSE::log::error("JsonStore::Load failed: {}", e.what());
            return "";
        }
    }

    bool Save(const std::string& json) {
        // The in-game panel and the tablet remote save from different threads; both use the
        // same .tmp file.
        static std::mutex s_saveMx;
        std::lock_guard lock(s_saveMx);
        try {
            fs::path p = GetStatePath();
            fs::path tmp = p; tmp += ".tmp";
            fs::path bak = p; bak += ".bak";

            {
                std::ofstream f(tmp, std::ios::binary | std::ios::trunc);
                if (!f) return false;
                f.write(json.data(), static_cast<std::streamsize>(json.size()));
                if (!f) return false;
            }

            std::error_code ec;
            if (fs::exists(p)) {
                fs::remove(bak, ec);
                fs::rename(p, bak, ec);
            }
            fs::rename(tmp, p, ec);
            if (ec) {
                SKSE::log::error("JsonStore::Save rename failed: {}", ec.message());
                return false;
            }
            return true;
        } catch (const std::exception& e) {
            SKSE::log::error("JsonStore::Save failed: {}", e.what());
            return false;
        }
    }
}
