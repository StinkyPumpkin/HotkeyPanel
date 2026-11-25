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
#include <atomic>
#include <cstdint>
#include <string>

// Input event sink that owns the entire hotkey lifecycle now that the ESP is
// gone:
//   * When the panel is HIDDEN  → watches for the configured toggle key and
//                                 opens the panel (after blocklist check).
//   * When the panel is VISIBLE → consumes ALL input (returns kStop) and
//                                 closes the panel on Tab / Esc.
//
// Settings come from the UI via hkpSetToggleKey listener in PrismaUIBridge,
// which calls SetToggleKey() on this singleton.
class InputHandler : public RE::BSTEventSink<RE::InputEvent*>,
                     public RE::BSTEventSink<SKSE::ModCallbackEvent> {
public:
    static InputHandler* GetSingleton();
    void Register();

    // Update the global toggle key + enabled flag. Called from PrismaUIBridge
    // whenever the JS dispatches hkpSetToggleKey, and once on UI load so the
    // DLL learns the user's persisted key.
    // a_shift: the key name had a "Shift+" prefix, so the toggle needs Shift held.
    void SetToggleKey(std::uint32_t dxScanCode, bool enabled, bool a_shift = false);
    std::uint32_t GetToggleKey() const { return m_toggleEnabled.load() && !m_externalOff.load() ? m_toggleKey.load() : 0; }
    // --Claude 11-11: another mod's radial menu opens the panel and frees its key (HotkeyPanel_SetHotkeyEnabled)
    void SetExternalOff(bool a_off) { m_externalOff.store(a_off); }

    // Map a UI keyname string ("F11", "KeyQ", "Numpad5", ...) to a Skyrim
    // DXScanCode. Returns 0 for unknown.
    static std::uint32_t KeyNameToDXScanCode(const std::string& name);

protected:
    RE::BSEventNotifyControl ProcessEvent(
        RE::InputEvent* const* a_event,
        RE::BSTEventSource<RE::InputEvent*>* a_eventSource) override;

    // --Claude: universal G-Key Service subscriber. GKeysInputBridge broadcasts
    // "GKeyDown" (numArg = DIK 100-118) on each F13-F24 edge; when it matches our
    // toggle key we open/close. Replaces the old per-mod GetKeyState poll.
    RE::BSEventNotifyControl ProcessEvent(
        const SKSE::ModCallbackEvent* a_event,
        RE::BSTEventSource<SKSE::ModCallbackEvent>* a_eventSource) override;

private:
    InputHandler() = default;
    ~InputHandler() override = default;

    // Returns true if a Skyrim menu is open that should suppress our toggle
    // (Inventory, Crafting, Dialogue, Loading, etc.).
    static bool IsBlockingMenuOpen();

    // F13-F24 synthetic codes are 100-110/118 (== their DIK). Used to gate the
    // ButtonEvent path OFF for G-keys (the G-Key Service handles them) so the
    // injected ButtonEvent and the GKeyDown event don't both toggle.
    static bool IsGKey(std::uint32_t code) { return (code >= 100 && code <= 110) || code == 118; }

    // --Claude 2026-10-12: a "Shift+" toggle (e.g. Shift+G6) only fires with Shift held,
    // which leaves the bare key to another mod (G6 = FollowerUI).
    bool ToggleModifierOk() const;

    // --Claude 2026-11-20 (on PrismaUI Shift+F24 did not close the panel): Shift as the game's own key events
    // report it. GetAsyncKeyState can answer "up" inside the game while Shift is held (wiki gotcha), so it is only
    // the fallback. The time of the last Shift down / held event; 0 after its release.
    std::atomic<long long> m_shiftSeenMs{ 0 };
    bool ShiftHeldByEvents() const;

    std::atomic<std::uint32_t> m_toggleKey{ 87 };   // F11 default
    std::atomic<bool> m_toggleEnabled{ true };
    std::atomic<bool> m_externalOff{ false };   // --Claude 11-11: another mod opens the panel (its key is freed)
    std::atomic<bool> m_toggleShift{ false };
};
