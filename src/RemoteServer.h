#pragma once

#include <functional>
#include <string>

// --Claude 2026-09-30: the panel on a tablet or phone.
//
// The DLL serves the SAME PrismaUI view (Data/PrismaUI/views/HotkeyPanel) over plain HTTP on
// the home network. When it hands out index.html it adds remote/remote.js, which turns the
// panel's bridge calls (window.hkpTriggerKey, window.hkpSaveState, ...) into requests to this
// server. A tap on a labelled key then goes through exactly the path an in-game click takes.
//
// This file is compiled WITHOUT the CommonLib PCH: httplib pulls in winsock2.h, which has to
// come before anything includes windows.h. Nothing here touches the game - every hook is
// called on a server thread and must marshal onto the main thread itself.
namespace RemoteServer {

    struct Hooks {
        std::function<void(const std::string&)> press;      // "keyId|layerId" - fire it in game
        std::function<void(const std::string&)> saveState;  // a tablet saved the panel state
        std::function<void(const std::string&)> move;       // "source|dik" - Move Key
        std::function<void(const std::string&)> status;     // status JSON for the Settings row
    };

    // Set once, before the first Configure.
    void SetHooks(Hooks a_hooks);

    // Start, stop or move to another port. Returns at once: the work runs on its own thread and
    // ends with hooks.status. Asking for what is already running just re-reports the status.
    void Configure(bool a_enabled, int a_port);

    // The game side saved (or loaded) hotkeys.json - tablets pick it up on their next poll.
    void PublishState(const std::string& a_json);

    // Skyrim's own gameplay key binds (the same list the panel gets as HKP.setGameKeys).
    void SetGameKeys(const std::string& a_json);

}  // namespace RemoteServer
