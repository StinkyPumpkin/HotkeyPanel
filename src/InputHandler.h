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
    void SetToggleKey(std::uint32_t dxScanCode, bool enabled);

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

    std::atomic<std::uint32_t> m_toggleKey{ 87 };   // F11 default
    std::atomic<bool> m_toggleEnabled{ true };
};
