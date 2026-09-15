#pragma once

#include <cstdint>
#include <vector>

// --Claude 2026-09-15: synthetic key presses for "hold a key in the panel to
// actually fire that hotkey".
//
// The panel is a reminder overlay, so the keys it draws belong to OTHER mods. The
// only way to trigger one of those is to make the game believe the key was really
// pressed — nothing else reaches an arbitrary mod's hotkey handler.
namespace KeyPress {

    // Mirrors the panel's TAP_MODES in hkp.js. The panel can label a key
    // differently per tap mode, so firing has to reproduce the one on screen.
    enum class Tap {
        kSingle,   // one press
        kDouble,   // two quick presses
        kLong      // one long press
    };

    // Queue a full input sequence, starting a few frames from now:
    //
    //     modifiers down -> key (per tap mode) -> modifiers up
    //
    // a_mods are the layer's modifier keys (may be empty); a_code is the key itself.
    // Codes are unified panel codes: < 256 is a keyboard DirectInput scancode,
    // 256..258 are mouse buttons 1-3 (fired on the mouse device as index code-256).
    //
    // The leading delay is not cosmetic. Two things must happen first, both of which
    // take at least a frame:
    //   1. HideUI() posts kHide to the UI message queue — the menu is NOT closed
    //      synchronously, and most mods ignore hotkeys while a menu is open.
    //   2. InputHandler returns kStop for ALL input while the panel is visible, so
    //      anything fired too early is eaten by our own sink.
    //
    // Safe to call from any thread; the work is marshalled onto the main thread.
    void Fire(const std::vector<std::uint32_t>& a_mods, std::uint32_t a_code, Tap a_tap);

    // Parse the panel's layer id ("default", "ControlLeft+ShiftLeft",
    // "double:default", "long:AltLeft") into modifiers + tap mode. Returns false
    // only on an empty id; an unrecognised modifier name is skipped and reported.
    bool ParseLayer(const std::string& a_layerId, std::vector<std::uint32_t>& a_outMods, Tap& a_outTap);

}  // namespace KeyPress
