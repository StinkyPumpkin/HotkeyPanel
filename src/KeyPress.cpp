#include "KeyPress.h"
#include "InputHandler.h"

#include <RE/Skyrim.h>
#include <REL/Relocation.h>
#include <SKSE/SKSE.h>

#include <Windows.h>
#include <atomic>
#include <chrono>
#include <memory>
#include <string>
#include <thread>
#include <vector>

namespace HKPFocusRecovery { bool IsConsoleOwned(); }   // PrismaUIBridge.cpp

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

    // --Claude 2026-11-21 DIAGNOSTICS ONLY (1 of 3 fired keys never reached the game's input in a test; the cause is
    // to be found before any workaround): what Skyrim's input queue and our own input sink saw of a fired key.
    std::atomic<std::uint32_t> g_watchCode{ 0xFFFFFFFFu };
    std::atomic<long long>     g_watchUntilMs{ 0 };
    std::atomic<int>           g_seenPress{ 0 }, g_seenRelease{ 0 };

    long long NowMs() {
        return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now().time_since_epoch()).count();
    }
    bool GameInFront() {
        auto* w = RE::BSGraphics::Renderer::GetCurrentRenderWindow();
        return w && reinterpret_cast<HWND>(w->hWnd) == ::GetForegroundWindow();
    }

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
    //
    // --Claude 2026-10-01: a tablet press while another menu is open (SLUI, Tween, an MCM) waited
    // for gameplay that never came and was dropped after 4 s - SLUI opened from the tablet could
    // not be closed from it. Without a_gameplay only HKP's own pieces must be gone.
    bool InputIsLive(bool a_gameplay, bool a_waitOverlay) {
        auto* ui = RE::UI::GetSingleton();
        if (!ui) return false;
        if (ui->IsMenuOpen("HKP_Blocker")) return false;
        if (HKPFocusRecovery::IsConsoleOwned()) return false;
        if (!a_gameplay) return true;
        if (ui->GameIsPaused()) return false;
        if (ui->IsMenuOpen(RE::Console::MENU_NAME)) return false;
        if (ui->IsMenuOpen(RE::CursorMenu::MENU_NAME)) return false;
        // --Claude 2026-11-21 (PrismaUI check: 1 of 2 fired keys did nothing): PrismaUI's focus shell closes after
        // our blocker; a key sent before it is gone lands in menu mode
        if (ui->IsMenuOpen("PrismaUI_FocusMenu")) return false;
        // --Claude 2026-11-21 (in game 2 of 2 fired keys did nothing on Magelight): Magelight keeps its
        // "MagelightOverlay" menu up for about a second after a page lets go, and the game does not take a key sent
        // while it is open. Waited for while a_waitOverlay (the first 2.5 s), then ignored, in case a mod keeps it up.
        if (a_waitOverlay && ui->IsMenuOpen("MagelightOverlay")) return false;
        return true;
    }

    // -1 unknown / 0 no / 1 yes. Written on the main thread, read by the worker.
    std::atomic<int> g_liveProbe{ -1 };
    // the key map's top context when the last probe ran (logged with the fire: 0 = gameplay), and Skyrim's typing
    // flag (--Claude 2026-11-21: a flag left on after a closed text box made the game ignore a fired key)
    std::atomic<int> g_contextTop{ -1 };
    std::atomic<int> g_typing{ -1 };

    int ContextTop() {
        auto* cm = RE::ControlMap::GetSingleton();
        if (!cm) return -1;
        g_typing.store(cm->GetRuntimeData().textEntryCount, std::memory_order_relaxed);
        const auto& stack = cm->GetRuntimeData().contextPriorityStack;
        return stack.empty() ? -1 : static_cast<int>(stack.back());
    }

    constexpr int kProbeIntervalMs = 50;
    constexpr int kMaxGateMs       = 4000;
    constexpr int kMaxOverlayWaitMs = 2500;   // Magelight's fade-out menu (InputIsLive)

    void Worker(std::shared_ptr<std::vector<Edge>> a_script, bool a_gameplay, std::uint32_t a_code) {
        using namespace std::chrono_literals;

        // Gate: poll the real condition on the main thread until input is live - on two probes in a row
        // (--Claude 2026-11-21: on PrismaUI the menus close over several frames; one good probe fired too early).
        int waitedMs = 0, liveRuns = 0;
        bool live = false;
        while (waitedMs < kMaxGateMs) {
            g_liveProbe.store(-1, std::memory_order_relaxed);
            const bool waitOverlay = waitedMs < kMaxOverlayWaitMs;
            if (auto* task = SKSE::GetTaskInterface()) {
                task->AddTask([a_gameplay, waitOverlay]() {
                    g_liveProbe.store(InputIsLive(a_gameplay, waitOverlay) ? 1 : 0, std::memory_order_relaxed);
                    g_contextTop.store(ContextTop(), std::memory_order_relaxed);
                });
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(kProbeIntervalMs));
            waitedMs += kProbeIntervalMs;
            if (g_liveProbe.load(std::memory_order_relaxed) == 1) {
                if (++liveRuns >= 2) { live = true; break; }
            } else {
                liveRuns = 0;
            }
        }

        if (!live) {
            SKSE::log::warn("KeyPress: input still not live after {} ms, dropping the press", waitedMs);
            return;
        }
        const int typing = g_typing.load(std::memory_order_relaxed);
        SKSE::log::info("KeyPress: input live after {} ms (key map context {}, typing flag {}), firing{}", waitedMs,
                        g_contextTop.load(std::memory_order_relaxed), typing,
                        typing > 0 ? " - Skyrim thinks a text box is in use, so the game may ignore this key" : "");

        g_seenPress.store(0);
        g_seenRelease.store(0);
        g_watchUntilMs.store(NowMs() + 3000);
        g_watchCode.store(a_code);
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
                        // diagnostics: did the engine put a button event in this frame's input queue?
                        auto* q = RE::BSInputEventQueue::GetSingleton();
                        const std::uint32_t before = q ? q->buttonEventCount : 0u;
                        SetButtonState(dev, button, edge.dt, edge.wasDown, edge.isDown);
                        const std::uint32_t after = q ? q->buttonEventCount : 0u;
                        SKSE::log::info("KeyPress: {} of code {} given to the engine - button events in this frame's queue {} -> {}{}; game window {}",
                                        !edge.wasDown ? "press" : (edge.isDown ? "hold" : "release"), edge.code, before, after,
                                        after == before ? " (NOT added)" : "", GameInFront() ? "in front" : "NOT in front");
                    } else {
                        SKSE::log::warn("KeyPress: cannot resolve code {} to a device button", edge.code);
                    }
                });
            }
        }
        // diagnostics: what our own input sink saw of the key (it sits among the game's input sinks)
        std::this_thread::sleep_for(std::chrono::milliseconds(400));
        SKSE::log::info("KeyPress: code {} - our input sink saw {} press and {} release event(s){}", a_code,
                        g_seenPress.load(), g_seenRelease.load(),
                        g_seenPress.load() ? "" : " - the press never reached the game's input sinks");
        g_watchCode.store(0xFFFFFFFFu);
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

void KeyPress::Fire(const std::vector<std::uint32_t>& a_mods, std::uint32_t a_code, Tap a_tap,
                    bool a_waitForGameplay) {
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

    SKSE::log::info("KeyPress: queued code {} tap={} mods={} ({} edges) - waiting for {}",
                    a_code,
                    a_tap == Tap::kDouble ? "double" : (a_tap == Tap::kLong ? "long" : "single"),
                    a_mods.size(), script->size(),
                    a_waitForGameplay ? "input to be live" : "HKP's own menus only (menus stay open)");

    std::thread(Worker, script, a_waitForGameplay, a_code).detach();
}

// --Claude 2026-11-21 diagnostics: InputHandler hands every button event over; the one we fired is logged.
void KeyPress::NoteInput(const RE::ButtonEvent* a_button) {
    const auto watch = g_watchCode.load(std::memory_order_relaxed);
    if (!a_button || watch == 0xFFFFFFFFu || NowMs() > g_watchUntilMs.load(std::memory_order_relaxed)) return;
    const bool mouse = watch >= kMouseBase;
    if (a_button->device.get() != (mouse ? RE::INPUT_DEVICE::kMouse : RE::INPUT_DEVICE::kKeyboard)) return;
    if (a_button->GetIDCode() != (mouse ? watch - kMouseBase : watch)) return;
    if (a_button->IsDown()) {
        if (g_seenPress.fetch_add(1) == 0) SKSE::log::info("InputHandler: the fired code {} arrived as a press", watch);
    } else if (a_button->IsUp()) {
        if (g_seenRelease.fetch_add(1) == 0)
            SKSE::log::info("InputHandler: the fired code {} arrived as a release (held {:.3f} s)", watch, a_button->HeldDuration());
    }
}
