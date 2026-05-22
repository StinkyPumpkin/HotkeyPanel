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
class InputHandler : public RE::BSTEventSink<RE::InputEvent*> {
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

private:
    InputHandler() = default;
    ~InputHandler() override = default;

    // Returns true if a Skyrim menu is open that should suppress our toggle
    // (Inventory, Crafting, Dialogue, Loading, etc.).
    static bool IsBlockingMenuOpen();

    std::atomic<std::uint32_t> m_toggleKey{ 87 };   // F11 default
    std::atomic<bool> m_toggleEnabled{ true };
};
