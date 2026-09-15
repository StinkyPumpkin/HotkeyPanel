#include "KeyPress.h"

#include <RE/Skyrim.h>
#include <REL/Relocation.h>
#include <SKSE/SKSE.h>

namespace {

    // BSInputDevice::SetButtonState, reached through our own relocation.
    //
    // Linking CommonLib's BSInputDevice.cpp pulls in virtuals it never defines
    // (LNK2019), so we call the engine function directly - the same entry point and
    // the same reasoning as GKeysInputBridge, which is our proven precedent for
    // making a key the hardware never sent look native to every consumer.
    //
    // Why this and not SendInput/keybd_event: those go through Windows, and Skyrim's
    // keyboard device reads DirectInput state. G HUB's SendInput-injected keys are
    // exactly what DirectInput fails to carry (that is the whole reason the G-key
    // bridge exists). Driving the engine's own button state machine means the ENGINE
    // queues the ButtonEvent, so SKSE sinks, Papyrus RegisterForKey and MCM capture
    // all see a normal key.
    void SetButtonState(RE::BSInputDevice* a_dev, std::uint32_t a_dik, float a_dt,
                        bool a_wasDown, bool a_isDown) {
        using Fn = void(RE::BSInputDevice*, std::uint32_t, float, bool, bool);
        static REL::Relocation<Fn*> func{ RELOCATION_ID(67441, 68748) };
        func(a_dev, a_dik, a_dt, a_wasDown, a_isDown);
    }

    RE::BSInputDevice* Keyboard() {
        auto* mgr = RE::BSInputDeviceManager::GetSingleton();
        return mgr ? mgr->GetKeyboard() : nullptr;
    }

    // Frame budget. Each AddTask runs on the next game frame, so the phase counter
    // doubles as a frame counter.
    constexpr int kCloseFrames = 3;   // let HideUI's kHide actually pop the menu
    constexpr int kHoldFrames  = 2;   // a press with no dwell can be missed
    constexpr float kFrameDt   = 0.016f;

    void Step(std::uint32_t a_dik, int a_phase);

    void Next(std::uint32_t a_dik, int a_phase) {
        if (auto* task = SKSE::GetTaskInterface()) {
            task->AddTask([a_dik, a_phase]() { Step(a_dik, a_phase); });
        }
    }

    void Step(std::uint32_t a_dik, int a_phase) {
        auto* kb = Keyboard();
        if (!kb) {
            SKSE::log::warn("KeyPress: no keyboard device, dropping DIK {}", a_dik);
            return;
        }

        // Waiting for the panel to be gone.
        if (a_phase < kCloseFrames) {
            Next(a_dik, a_phase + 1);
            return;
        }

        // Down edge.
        if (a_phase == kCloseFrames) {
            SetButtonState(kb, a_dik, 0.0f, false, true);
            SKSE::log::info("KeyPress: DIK {} down", a_dik);
            Next(a_dik, a_phase + 1);
            return;
        }

        // Hold - some handlers gate on heldDownSecs advancing rather than the edge.
        if (a_phase < kCloseFrames + kHoldFrames) {
            SetButtonState(kb, a_dik, kFrameDt, true, true);
            Next(a_dik, a_phase + 1);
            return;
        }

        // Up edge.
        SetButtonState(kb, a_dik, kFrameDt, true, false);
        SKSE::log::info("KeyPress: DIK {} up", a_dik);
    }

}  // namespace

void KeyPress::Fire(std::uint32_t a_dxScanCode) {
    if (!a_dxScanCode) {
        return;
    }
    SKSE::log::info("KeyPress: queued DIK {}", a_dxScanCode);
    Next(a_dxScanCode, 0);
}
