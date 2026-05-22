#include "JsonStore.h"
#include <SKSE/SKSE.h>
#include <filesystem>
#include <fstream>
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
