#pragma once

#include <cstdint>

// --Claude 2026-09-28: MCM key picker.
//
// When an MCM (classic SkyUI or MCM Helper - both draw through SkyUI's config panel) asks
// "press a key", the Hotkey Panel opens over it instead. Clicking a key on the panel (on any
// layer) binds that key in the mod, after a small dialog to name and colour it; pressing a
// real key binds it straight away, exactly as before; ESC closes the panel and leaves
// SkyUI's own prompt up.
//
// How SkyUI captures a key: ConfigPanel.initRemapMode() calls skse.StartRemapMode(this).
// SKSE sets MenuControls::remapMode, adds a one-shot input sink, and on the next key-down
// (it only looks at the FIRST event of a batch) calls ConfigPanel.EndRemapMode(keyCode)
// and removes itself. We watch for that flag while the Journal Menu is open, and deliver
// the picked key as a real ButtonEvent through the same input event source, so SKSE's own
// handler takes it - SkyUI's conflict dialogs, MCM Unlocked's announce and the mod's
// OnOptionKeyMapChange all run exactly as for a pressed key.
namespace PickMode {
    void Register();                       // kDataLoaded: Journal Menu watcher

    // Main thread. Deliver a unified panel code (<256 keyboard DIK, 256+ mouse button)
    // to SKSE's remap handler, a_delayMs after now (the panel must be closed first).
    void InjectAfter(std::uint32_t a_code, int a_delayMs);

    bool IsInjecting();                    // our own synthetic event is being dispatched

    // --Claude 2026-09-28 (field test): an MCM is waiting for a key right now.
    bool McmWaitingForKey();
    // Open the picker for that MCM (the toggle key pressed while it waits). False if none waits.
    bool OpenForWaitingMcm();
    // While the MCM picker is up: SKSE's remap mode switches the game's menu input off, which
    // also stops the menu cursor the panel is clicked with. Hold it off while the panel is up,
    // put it back when the panel closes (before the picked key is sent).
    void HoldMenuRemap(bool a_hold);

    // --Claude 2026-09-28 SKSE Menu Framework pages. SMF gives each mod its own private "press a key"
    // capture, so nothing tells us a page is waiting: the user presses the panel's toggle key while an
    // SMF window is open and the panel opens as a manual picker. Needs our SMF fork's exports
    // (SetExternalOverlay / SetReservedKey / InjectKey); without them the toggle behaves as before.
    bool SmfWindowOpen();                  // an SMF window that pauses the game is open
    bool SmfPickAvailable();               // our SMF fork is loaded
    void SmfSetOverlay(bool a_on);         // SMF passes all input to the game/panel, mods see none
    void SmfReserveKey(std::uint32_t a_dik);   // the panel's toggle key never reaches SMF mods
    void SmfInject(std::uint32_t a_code);  // hand the picked key to the mods like a pressed key
}
