#include "KeyPress.h"
#include "InputHandler.h"

#include <RE/Skyrim.h>
#include <REL/Relocation.h>
#include <SKSE/SKSE.h>

#include <memory>
#include <string>

namespace {

    // BSInputDevice::SetButtonState, reached through our own relocation.
    //
    // Linking CommonLib's BSInputDevice.cpp pulls in virtuals it never defines
    // (LNK2019), so we call the engine function directly - the same entry point and
    // the same reasoning as GKeysInputBridge, our proven precedent for making a key
    // the hardware never sent look native to every consumer.
    //
    // Why this and not SendInput/keybd_event: those go through Windows, and Skyrim's
    // input devices read DirectInput state. SendInput-injected keys are exactly what
    // DirectInput fails to carry - that is why the G-key bridge exists at all.
    // Driving the engine's own button state machine means the ENGINE queues the
    // ButtonEvent, so SKSE sinks, Papyrus RegisterForKey and MCM capture all see a
    // normal key.
    void SetButtonState(RE::BSInputDevice* a_dev, std::uint32_t a_button, float a_dt,
                        bool a_wasDown, bool a_isDown) {
        using Fn = void(RE::BSInputDevice*, std::uint32_t, float, bool, bool);
        static REL::Relocation<Fn*> func{ RELOCATION_ID(67441, 68748) };
        func(a_dev, a_button, a_dt, a_wasDown, a_isDown);
    }

    constexpr float        kFrameDt     = 0.016f;
    constexpr std::uint32_t kMouseBase  = 256;   // panel codes 256..258 = mouse 1-3

    // One scheduled edge. dt/wasDown/isDown are exactly what SetButtonState wants;
    // waitFrames is how many frames to idle BEFORE applying it.
    struct Edge {
        int           waitFrames;
        std::uint32_t code;      // unified panel code
        float         dt;
        bool          wasDown;
        bool          isDown;
    };

    // Resolve a unified panel code to its device + device-local button index.
    // Mouse wheel codes (264/265) are axes, not buttons, and are refused.
    bool Resolve(std::uint32_t a_code, RE::BSInputDevice*& a_outDev, std::uint32_t& a_outButton) {
        auto* mgr = RE::BSInputDeviceManager::GetSingleton();
        if (!mgr) return false;
        if (a_code >= kMouseBase) {
            if (a_code > kMouseBase + 7) return false;   // wheel / out of range
            a_outDev = mgr->GetMouse();
            a_outButton = a_code - kMouseBase;
        } else {
            a_outDev = mgr->GetKeyboard();
            a_outButton = a_code;
        }
        return a_outDev != nullptr;
    }

    void RunFrom(std::shared_ptr<std::vector<Edge>> a_script, std::size_t a_index, int a_waited);

    void Schedule(std::shared_ptr<std::vector<Edge>> a_script, std::size_t a_index, int a_waited) {
        if (auto* task = SKSE::GetTaskInterface()) {
            task->AddTask([a_script, a_index, a_waited]() { RunFrom(a_script, a_index, a_waited); });
        }
    }

    // Walks the script one frame at a time. Each AddTask lands on the next game
    // frame, so the "waited" counter is a frame counter.
    void RunFrom(std::shared_ptr<std::vector<Edge>> a_script, std::size_t a_index, int a_waited) {
        if (!a_script || a_index >= a_script->size()) return;
        const Edge& e = (*a_script)[a_index];

        if (a_waited < e.waitFrames) {
            Schedule(a_script, a_index, a_waited + 1);
            return;
        }

        RE::BSInputDevice* dev = nullptr;
        std::uint32_t      button = 0;
        if (Resolve(e.code, dev, button)) {
            SetButtonState(dev, button, e.dt, e.wasDown, e.isDown);
        } else {
            SKSE::log::warn("KeyPress: cannot resolve code {} to a device button", e.code);
        }

        Schedule(a_script, a_index + 1, 0);
    }

    // Append one press of a_code lasting a_holdFrames, after a_leadFrames of idle.
    void AppendPress(std::vector<Edge>& a_out, std::uint32_t a_code, int a_leadFrames, int a_holdFrames) {
        a_out.push_back({ a_leadFrames, a_code, 0.0f, false, true });          // down edge
        for (int i = 0; i < a_holdFrames; ++i) {
            a_out.push_back({ 1, a_code, kFrameDt, true, true });              // held
        }
        a_out.push_back({ 1, a_code, kFrameDt, true, false });                 // up edge
    }

}  // namespace

bool KeyPress::ParseLayer(const std::string& a_layerId, std::vector<std::uint32_t>& a_outMods, Tap& a_outTap) {
    a_outMods.clear();
    a_outTap = Tap::kSingle;
    if (a_layerId.empty()) return false;

    // "<tap>:<modBase>" or just "<modBase>"; modBase is "default" or names joined by '+'.
    std::string modBase = a_layerId;
    const auto colon = a_layerId.find(':');
    if (colon != std::string::npos) {
        const std::string tap = a_layerId.substr(0, colon);
        modBase = a_layerId.substr(colon + 1);
        if (tap == "double")    a_outTap = Tap::kDouble;
        else if (tap == "long") a_outTap = Tap::kLong;
    }

    if (modBase == "default") return true;

    std::size_t start = 0;
    while (start <= modBase.size()) {
        const auto plus = modBase.find('+', start);
        const std::string name = modBase.substr(start, plus == std::string::npos ? std::string::npos : plus - start);
        if (!name.empty()) {
            const auto code = InputHandler::KeyNameToDXScanCode(name);
            if (code) a_outMods.push_back(code);
            else SKSE::log::warn("KeyPress: layer modifier '{}' has no scan code, skipping", name);
        }
        if (plus == std::string::npos) break;
        start = plus + 1;
    }
    return true;
}

void KeyPress::Fire(const std::vector<std::uint32_t>& a_mods, std::uint32_t a_code, Tap a_tap) {
    if (!a_code) return;

    // Frame budget.
    constexpr int kCloseFrames = 3;    // let HideUI's kHide actually pop the menu
    constexpr int kModSettle   = 2;    // modifiers must be down BEFORE the key edge
    constexpr int kHoldSingle  = 2;    // a press with no dwell can be missed
    constexpr int kHoldLong    = 50;   // ~0.8 s - past every "long press" threshold
    constexpr int kDoubleGap   = 4;    // short enough to read as a double tap

    auto script = std::make_shared<std::vector<Edge>>();

    // Modifiers down first, all on the same frame after the close delay.
    bool first = true;
    for (const auto m : a_mods) {
        script->push_back({ first ? kCloseFrames : 0, m, 0.0f, false, true });
        first = false;
    }

    const int lead = a_mods.empty() ? kCloseFrames : kModSettle;
    switch (a_tap) {
    case Tap::kDouble:
        AppendPress(*script, a_code, lead, kHoldSingle);
        AppendPress(*script, a_code, kDoubleGap, kHoldSingle);
        break;
    case Tap::kLong:
        AppendPress(*script, a_code, lead, kHoldLong);
        break;
    case Tap::kSingle:
    default:
        AppendPress(*script, a_code, lead, kHoldSingle);
        break;
    }

    // Modifiers up, in reverse, a couple of frames after the key released.
    first = true;
    for (auto it = a_mods.rbegin(); it != a_mods.rend(); ++it) {
        script->push_back({ first ? kModSettle : 0, *it, kFrameDt, true, false });
        first = false;
    }

    SKSE::log::info("KeyPress: queued code {} tap={} mods={} ({} edges)",
                    a_code,
                    a_tap == Tap::kDouble ? "double" : (a_tap == Tap::kLong ? "long" : "single"),
                    a_mods.size(), script->size());

    Schedule(script, 0, 0);
}
