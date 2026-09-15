#pragma once

#include <cstdint>

// --Claude 2026-09-15: synthetic key presses for "click a key in the panel to
// actually fire that hotkey".
//
// The panel is a reminder overlay, so the keys it draws belong to OTHER mods. The
// only way to trigger one of those is to make the game believe the key was really
// pressed — nothing else reaches an arbitrary mod's hotkey handler.
namespace KeyPress {

    // Queue a full down -> held -> up edge sequence for a DirectInput scan code,
    // spread over several frames starting a few frames from now.
    //
    // The delay is not cosmetic. Two things have to have happened before the key
    // lands, and both take at least a frame:
    //   1. HideUI() posts kHide to the UI message queue - the menu is NOT closed
    //      synchronously, and most mods ignore hotkeys while a menu is open.
    //   2. InputHandler returns kStop for ALL input while the panel is visible,
    //      so a key fired too early is eaten by our own sink.
    //
    // Safe to call from any thread; the work is marshalled onto the main thread.
    void Fire(std::uint32_t a_dxScanCode);

}  // namespace KeyPress
