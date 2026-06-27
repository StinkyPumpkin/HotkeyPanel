#include "InputHandler.h"
#include "PrismaUIBridge.h"

InputHandler* InputHandler::GetSingleton() {
    static InputHandler singleton;
    return &singleton;
}

void InputHandler::Register() {
    if (auto* dm = RE::BSInputDeviceManager::GetSingleton()) {
        dm->AddEventSink(this);
        SKSE::log::info("InputHandler: registered input event sink (toggle key=F11/87 default)");
    }
}

void InputHandler::SetToggleKey(std::uint32_t dxScanCode, bool enabled) {
    if (dxScanCode != 0) m_toggleKey.store(dxScanCode);
    m_toggleEnabled.store(enabled);
    SKSE::log::info("InputHandler: toggle key set to {} (enabled={})",
                    m_toggleKey.load(), enabled);
}

bool InputHandler::IsBlockingMenuOpen() {
    auto* ui = RE::UI::GetSingleton();
    if (!ui) return false;

    // Another Prisma view (PEM, FollowerUI, etc.) already has focus — don't steal it
    auto* bridge = PrismaUIBridge::GetSingleton();
    if (bridge && bridge->IsAnyPrismaViewFocused()) return true;

    static constexpr const char* kBlocking[] = {
        "InventoryMenu", "MagicMenu", "FavoritesMenu", "MapMenu",
        "Dialogue Menu", "Crafting Menu", "BarterMenu", "ContainerMenu",
        "GiftMenu", "TweenMenu", "Loading Menu", "Console",
        "MessageBoxMenu", "RaceSex Menu", "Main Menu",
    };
    for (auto* m : kBlocking) {
        if (ui->IsMenuOpen(m)) return true;
    }
    return false;
}

RE::BSEventNotifyControl InputHandler::ProcessEvent(
    RE::InputEvent* const* a_event,
    RE::BSTEventSource<RE::InputEvent*>*)
{
    if (!a_event) return RE::BSEventNotifyControl::kContinue;

    auto* bridge = PrismaUIBridge::GetSingleton();
    if (!bridge) return RE::BSEventNotifyControl::kContinue;

    // Panel VISIBLE: FollowerUI pattern — return kStop so input doesn't
    // propagate to downstream sinks.  BlockerMenu's kGameplay context lets
    // the DX overlay still receive input, but ControlMap-bound engine
    // actions don't fire because the event chain is stopped here.
    if (bridge->IsVisible()) {
        const auto toggleCode = m_toggleKey.load();
        constexpr std::uint32_t kEscape = 1;
        constexpr std::uint32_t kTab = 15;

        for (auto* evt = *a_event; evt; evt = evt->next) {
            auto* button = evt->AsButtonEvent();
            if (!button || !button->IsDown()) continue;
            if (button->device.get() != RE::INPUT_DEVICE::kKeyboard) continue;

            const auto code = button->GetIDCode();
            if (code == kEscape || code == kTab || code == toggleCode) {
                bridge->HideUI();
                break;
            }
        }
        return RE::BSEventNotifyControl::kStop;
    }

    // ----------------------------------------------------------------
    // Panel HIDDEN: watch for toggle key.
    // ----------------------------------------------------------------
    if (!m_toggleEnabled.load()) return RE::BSEventNotifyControl::kContinue;
    if (IsBlockingMenuOpen()) return RE::BSEventNotifyControl::kContinue;

    const auto wantKey = m_toggleKey.load();
    for (auto* evt = *a_event; evt; evt = evt->next) {
        auto* button = evt->AsButtonEvent();
        if (!button || !button->IsDown()) continue;
        if (button->device.get() != RE::INPUT_DEVICE::kKeyboard) continue;
        if (button->GetIDCode() == wantKey) {
            SKSE::log::info("InputHandler: toggle key {} pressed -> ShowUI", wantKey);
            bridge->ShowUI();
            return RE::BSEventNotifyControl::kStop;
        }
    }

    return RE::BSEventNotifyControl::kContinue;
}

// ----------------------------------------------------------------
// Key name -> DXScanCode (subset matching the UI keyboard layout)
// ----------------------------------------------------------------
std::uint32_t InputHandler::KeyNameToDXScanCode(const std::string& n) {
    // Function row
    if (n == "F1")  return 59;
    if (n == "F2")  return 60;
    if (n == "F3")  return 61;
    if (n == "F4")  return 62;
    if (n == "F5")  return 63;
    if (n == "F6")  return 64;
    if (n == "F7")  return 65;
    if (n == "F8")  return 66;
    if (n == "F9")  return 67;
    if (n == "F10") return 68;
    if (n == "F11") return 87;
    if (n == "F12") return 88;
    // Number row
    if (n == "Digit1") return 2;
    if (n == "Digit2") return 3;
    if (n == "Digit3") return 4;
    if (n == "Digit4") return 5;
    if (n == "Digit5") return 6;
    if (n == "Digit6") return 7;
    if (n == "Digit7") return 8;
    if (n == "Digit8") return 9;
    if (n == "Digit9") return 10;
    if (n == "Digit0") return 11;
    if (n == "Minus")  return 12;
    if (n == "Equal")  return 13;
    if (n == "Backspace") return 14;
    // Letters
    if (n == "KeyQ") return 16;
    if (n == "KeyW") return 17;
    if (n == "KeyE") return 18;
    if (n == "KeyR") return 19;
    if (n == "KeyT") return 20;
    if (n == "KeyY") return 21;
    if (n == "KeyU") return 22;
    if (n == "KeyI") return 23;
    if (n == "KeyO") return 24;
    if (n == "KeyP") return 25;
    if (n == "KeyA") return 30;
    if (n == "KeyS") return 31;
    if (n == "KeyD") return 32;
    if (n == "KeyF") return 33;
    if (n == "KeyG") return 34;
    if (n == "KeyH") return 35;
    if (n == "KeyJ") return 36;
    if (n == "KeyK") return 37;
    if (n == "KeyL") return 38;
    if (n == "KeyZ") return 44;
    if (n == "KeyX") return 45;
    if (n == "KeyC") return 46;
    if (n == "KeyV") return 47;
    if (n == "KeyB") return 48;
    if (n == "KeyN") return 49;
    if (n == "KeyM") return 50;
    // Nav / edit
    if (n == "Tab")      return 15;
    if (n == "CapsLock") return 58;
    if (n == "Enter")    return 28;
    if (n == "Space")    return 57;
    if (n == "Escape")   return 1;
    if (n == "Insert")   return 210;
    if (n == "Delete")   return 211;
    if (n == "Home")     return 199;
    if (n == "End")      return 207;
    if (n == "PageUp")   return 201;
    if (n == "PageDown") return 209;
    // Numpad
    if (n == "Numpad0") return 82;
    if (n == "Numpad1") return 79;
    if (n == "Numpad2") return 80;
    if (n == "Numpad3") return 81;
    if (n == "Numpad4") return 75;
    if (n == "Numpad5") return 76;
    if (n == "Numpad6") return 77;
    if (n == "Numpad7") return 71;
    if (n == "Numpad8") return 72;
    if (n == "Numpad9") return 73;
    // Mouse buttons
    if (n == "Mouse1") return 256;
    if (n == "Mouse2") return 257;
    if (n == "Mouse3") return 258;
    if (n == "MouseWheelUp")   return 264;
    if (n == "MouseWheelDown") return 265;
    return 0;
}
