#pragma once
#include <string>

namespace JsonStore {
    // Read the persisted state file. Returns "" if missing.
    std::string Load();
    // Write state to disk atomically (writes to .tmp then renames).
    bool Save(const std::string& json);
    // Absolute path we write to (Data/SKSE/Plugins/HotkeyPanel/hotkeys.json).
    std::string GetStatePath();
}
