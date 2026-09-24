#include "KeyPress.h"
#include "InputHandler.h"

#include <RE/Skyrim.h>
#include <REL/Relocation.h>
#include <SKSE/SKSE.h>

#include <atomic>
#include <chrono>
#include <memory>
#include <string>
#include <thread>
#include <vector>

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
    // DirectInput fails to carry. Driving the engine's own button state machine means
    // the ENGINE queues the ButtonEvent, so SKSE sinks, Papyrus RegisterForKey and
    // MCM capture all see a normal key.
    void SetButtonState(RE::BSInputDevice* a_dev, std::uint32_t a_button, float a_dt,
                        bool a_wasDown, bool a_isDown) {
        using Fn = void(RE::BSInputDevice*, std::uint32_t, float, bool, bool);
        static REL::Relocation<Fn*> func{ RELOCATION_ID(67441, 68748) };
        func(a_dev, a_button, a_dt, a_wasDown, a_isDown);
    }

    constexpr float         kFrameDt   = 0.016f;
    constexpr std::uint32_t kMouseBase = 256;   // panel codes 256..258 = mouse 1-3

    // One edge, with a REAL delay before it.
    //
    // --Claude 2026-09-15, second pass. The first version counted frames by chaining
    // SKSE AddTask calls, assuming one task = one frame. That is false: a task added
    // from inside a task is drained in the SAME pass, so the whole chain ran in one
    // frame. The log caught it red-handed - "queued" and "still not live after 120
    // frames, dropping" landed on the identical millisecond. Everything here is wall
    // clock now, slept on a worker thread; only the engine calls are marshalled back
    // onto the main thread.
    struct Edge {
        int           delayMs;
        std::uint32_t code;
        float         dt;
        bool          wasDown;
        bool          isDown;
    };

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

    // Input is only LIVE once the panel is fully torn down. Closing it often leaves
    // the Cursor Menu stuck, and HKPFocusRecovery then pulses the Console open/closed
    // to rebuild the mouse/menu input state (~200ms after the close, done by ~385ms).
    // A key fired inside that window IS delivered, but it arrives in menu mode where
    // every mod's hotkey handler ignores it.
    //
    // MAIN THREAD ONLY - called from inside an AddTask.
    bool InputIsLive() {
        auto* ui = RE::UI::GetSingleton();
        if (!ui) return false;
        if (ui->GameIsPaused()) return false;
        if (ui->IsMenuOpen(RE::Console::MENU_NAME)) return false;
        if (ui->IsMenuOpen(RE::CursorMenu::MENU_NAME)) return false;
        return true;
    }

    // -1 unknown / 0 no / 1 yes. Written on the main thread, read by the worker.
    std::atomic<int> g_liveProbe{ -1 };

    constexpr int kProbeIntervalMs = 50;
    constexpr int kMaxGateMs       = 4000;

    void Worker(std::shared_ptr<std::vector<Edge>> a_script) {
        using namespace std::chrono_literals;

        // Gate: poll the real condition on the main thread until input is live.
        int waitedMs = 0;
        bool live = false;
        while (waitedMs < kMaxGateMs) {
            g_liveProbe.store(-1, std::memory_order_relaxed);
            if (auto* task = SKSE::GetTaskInterface()) {
                task->AddTask([]() {
                    g_liveProbe.store(InputIsLive() ? 1 : 0, std::memory_order_relaxed);
                });
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(kProbeIntervalMs));
            waitedMs += kProbeIntervalMs;
            if (g_liveProbe.load(std::memory_order_relaxed) == 1) { live = true; break; }
        }

        if (!live) {
            SKSE::log::warn("KeyPress: input still not live after {} ms, dropping the press", waitedMs);
            return;
        }
        SKSE::log::info("KeyPress: input live after {} ms, firing", waitedMs);

        for (const auto& e : *a_script) {
            if (e.delayMs > 0) {
                std::this_thread::sleep_for(std::chrono::milliseconds(e.delayMs));
            }
            Edge edge = e;
            if (auto* task = SKSE::GetTaskInterface()) {
                task->AddTask([edge]() {
                    RE::BSInputDevice* dev = nullptr;
                    std::uint32_t      button = 0;
                    if (Resolve(edge.code, dev, button)) {
                        SetButtonState(dev, button, edge.dt, edge.wasDown, edge.isDown);
                    } else {
                        SKSE::log::warn("KeyPress: cannot resolve code {} to a device button", edge.code);
                    }
                });
            }
        }
    }

    // Append one press of a_code lasting a_holdMs, after a_leadMs of idle.
    void AppendPress(std::vector<Edge>& a_out, std::uint32_t a_code, int a_leadMs, int a_holdMs) {
        a_out.push_back({ a_leadMs, a_code, 0.0f, false, true });    // down edge
        a_out.push_back({ a_holdMs, a_code, kFrameDt, true, true }); // still held
        a_out.push_back({ 16, a_code, kFrameDt, true, false });      // up edge
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

    constexpr int kModSettleMs = 48;    // modifiers must be DOWN before the key edge
    constexpr int kHoldShortMs = 48;
    constexpr int kHoldLongMs  = 800;   // past every "long press" threshold
    constexpr int kDoubleGapMs = 80;

    auto script = std::make_shared<std::vector<Edge>>();

    for (const auto m : a_mods) {
        script->push_back({ 0, m, 0.0f, false, true });   // all down together
    }

    const int lead = a_mods.empty() ? 0 : kModSettleMs;
    switch (a_tap) {
    case Tap::kDouble:
        AppendPress(*script, a_code, lead, kHoldShortMs);
        AppendPress(*script, a_code, kDoubleGapMs, kHoldShortMs);
        break;
    case Tap::kLong:
        AppendPress(*script, a_code, lead, kHoldLongMs);
        break;
    case Tap::kSingle:
    default:
        AppendPress(*script, a_code, lead, kHoldShortMs);
        break;
    }

    bool firstUp = true;
    for (auto it = a_mods.rbegin(); it != a_mods.rend(); ++it) {
        script->push_back({ firstUp ? kModSettleMs : 0, *it, kFrameDt, true, false });
        firstUp = false;
    }

    SKSE::log::info("KeyPress: queued code {} tap={} mods={} ({} edges) - waiting for input to be live",
                    a_code,
                    a_tap == Tap::kDouble ? "double" : (a_tap == Tap::kLong ? "long" : "single"),
                    a_mods.size(), script->size());

    std::thread(Worker, script).detach();
}
