#include "PickMode.h"
#include "PrismaUIBridge.h"

#include <RE/Skyrim.h>
#include <SKSE/SKSE.h>

#include <atomic>
#include <chrono>
#include <memory>
#include <string>
#include <thread>
#include <Windows.h>

namespace {
    constexpr const char* kJournal = "Journal Menu";
    constexpr const char* kPanel   = "_root.ConfigPanelFader.configPanel";

    std::atomic<std::uint64_t> g_gen{ 0 };       // bumps when the Journal Menu closes
    std::atomic<bool>          g_injecting{ false };
    bool                       g_armed = true;   // main thread: one pick per remap session
    bool                       g_heldRemap = false;   // we switched MenuControls::remapMode off

    RE::GFxMovieView* JournalMovie() {
        auto* ui = RE::UI::GetSingleton();
        if (!ui) return nullptr;
        auto menu = ui->GetMenu(kJournal);
        return menu && menu->uiMovie ? menu->uiMovie.get() : nullptr;
    }

    bool GetBool(RE::GFxMovieView* a_mv, const std::string& a_path, bool& a_out) {
        RE::GFxValue v;
        if (!a_mv->GetVariable(&v, a_path.c_str()) || !v.IsBool()) return false;
        a_out = v.GetBool();
        return true;
    }

    double GetNumber(RE::GFxMovieView* a_mv, const std::string& a_path, double a_def) {
        RE::GFxValue v;
        if (!a_mv->GetVariable(&v, a_path.c_str()) || !v.IsNumber()) return a_def;
        return v.GetNumber();
    }

    std::string GetString(RE::GFxMovieView* a_mv, const std::string& a_path) {
        RE::GFxValue v;
        if (!a_mv->GetVariable(&v, a_path.c_str()) || !v.IsString()) return {};
        const char* s = v.GetString();
        return s ? s : "";
    }

    // "$SB_ModName" -> the loaded translation, through SkyUI's own Translator.
    std::string Translate(RE::GFxMovieView* a_mv, const std::string& a_text) {
        if (a_text.empty() || a_text[0] != '$') return a_text;
        RE::GFxValue tr;
        if (!a_mv->GetVariable(&tr, "_global.skyui.util.Translator") || !tr.IsObject()) return a_text;
        RE::GFxValue arg, out;
        arg.SetString(a_text.c_str());
        if (!tr.Invoke("translate", &out, &arg, 1) || !out.IsString() || !out.GetString()) return a_text;
        return out.GetString();
    }

    // SkyUI's config panel is waiting for a key (not the vanilla Controls remap).
    bool SkyUIRemapActive(RE::GFxMovieView* a_mv) {
        auto* mc = RE::MenuControls::GetSingleton();
        if (!mc || !mc->remapMode || !a_mv) return false;
        bool remap = false;
        return GetBool(a_mv, std::string(kPanel) + "._bRemapMode", remap) && remap;
    }

    std::string JsonStr(const std::string& a_in) {
        std::string out = "\"";
        for (const unsigned char c : a_in) {
            if (c == '"' || c == '\\') { out += '\\'; out += static_cast<char>(c); }
            else if (c < 0x20) { char buf[8]; std::snprintf(buf, sizeof(buf), "\\u%04x", c); out += buf; }
            else out += static_cast<char>(c);
        }
        return out + "\"";
    }

    // SkyUI's own flag for "a keymap option is waiting". It outlives SKSE's remapMode (which the
    // MCM picker switches off while it is up), so it is what arms the picker once per bind.
    bool SkyUIWaiting(RE::GFxMovieView* a_mv) {
        bool remap = false;
        return a_mv && GetBool(a_mv, std::string(kPanel) + "._bRemapMode", remap) && remap;
    }

    void ShowForMcm(RE::GFxMovieView* mv) {
        auto* bridge = PrismaUIBridge::GetSingleton();
        g_armed = false;
        const std::string panel = kPanel;
        const int idx = static_cast<int>(GetNumber(mv, panel + "._currentRemapOption", -1.0));
        const std::string entry = panel + "._optionsList.entryList." + std::to_string(idx);
        const std::string option = Translate(mv, GetString(mv, entry + ".text"));
        const int current = static_cast<int>(GetNumber(mv, entry + ".numValue", -1.0));
        std::string mod = Translate(mv, GetString(mv, panel + "._modList.selectedEntry.text"));
        if (mod.empty()) mod = GetString(mv, panel + "._titleText");

        SKSE::log::info("PickMode: '{}' asks for a key for '{}' (option {}, current key {}) - opening the panel",
                        mod, option, idx, current);
        const std::string json = "{\"mod\":" + JsonStr(mod) + ",\"option\":" + JsonStr(option) +
                                 ",\"current\":" + std::to_string(current) + "}";
        bridge->ShowPick(json);
    }

    // Main thread, ~15x a second while the Journal Menu is open.
    void Check(std::uint64_t a_gen) {
        if (a_gen != g_gen.load()) return;
        auto* bridge = PrismaUIBridge::GetSingleton();
        if (!bridge || !bridge->PickEnabled() || !bridge->IsDomReady()) return;

        auto* mv = JournalMovie();
        if (!SkyUIWaiting(mv)) { g_armed = true; return; }
        if (!g_armed || g_injecting.load() || bridge->IsVisible()) return;
        if (!SkyUIRemapActive(mv)) return;
        ShowForMcm(mv);
    }

    void Watch(std::uint64_t a_gen) {
        using namespace std::chrono_literals;
        while (a_gen == g_gen.load()) {
            std::this_thread::sleep_for(66ms);
            if (auto* tasks = SKSE::GetTaskInterface()) {
                tasks->AddTask([a_gen]() { Check(a_gen); });
            }
        }
    }

    // Build, dispatch and free one synthetic button event. Main thread.
    void Send(std::uint32_t a_code, bool a_down) {
        auto* mgr = RE::BSInputDeviceManager::GetSingleton();
        if (!mgr) return;
        const bool mouse = a_code >= 256;
        auto* evt = RE::ButtonEvent::Create(mouse ? RE::INPUT_DEVICE::kMouse : RE::INPUT_DEVICE::kKeyboard,
                                            "", mouse ? a_code - 256 : a_code,
                                            a_down ? 1.0f : 0.0f, a_down ? 0.0f : 0.05f);
        if (!evt) return;
        RE::InputEvent* head = evt;
        g_injecting.store(true);
        mgr->SendEvent(&head);
        g_injecting.store(false);
        evt->~ButtonEvent();
        RE::free(evt);
    }

    class JournalWatch final : public RE::BSTEventSink<RE::MenuOpenCloseEvent> {
    public:
        static JournalWatch* Get() { static JournalWatch w; return &w; }

        RE::BSEventNotifyControl ProcessEvent(const RE::MenuOpenCloseEvent* a_evt,
            RE::BSTEventSource<RE::MenuOpenCloseEvent>*) override {
            if (!a_evt || a_evt->menuName != kJournal) return RE::BSEventNotifyControl::kContinue;
            const auto gen = ++g_gen;
            if (a_evt->opening) {
                g_armed = true;
                std::thread(Watch, gen).detach();
            } else if (auto* bridge = PrismaUIBridge::GetSingleton(); bridge && bridge->IsPickActive()) {
                bridge->HideUI();   // the MCM it was picking for is gone
            }
            return RE::BSEventNotifyControl::kContinue;
        }
    };
}

void PickMode::Register() {
    if (auto* ui = RE::UI::GetSingleton()) {
        ui->AddEventSink<RE::MenuOpenCloseEvent>(JournalWatch::Get());
        SKSE::log::info("PickMode: watching the Journal Menu for MCM key binds");
    }
}

bool PickMode::IsInjecting() { return g_injecting.load(); }

void PickMode::InjectAfter(std::uint32_t a_code, int a_delayMs) {
    std::thread([a_code, a_delayMs]() {
        std::this_thread::sleep_for(std::chrono::milliseconds(a_delayMs));
        auto* tasks = SKSE::GetTaskInterface();
        if (!tasks) return;
        auto sentDown = std::make_shared<std::atomic<bool>>(false);
        tasks->AddTask([a_code, sentDown]() {
            if (!SkyUIRemapActive(JournalMovie())) {
                SKSE::log::warn("PickMode: the MCM stopped waiting for a key - key {} not sent", a_code);
                return;
            }
            SKSE::log::info("PickMode: sending key {} to the MCM", a_code);
            Send(a_code, true);
            sentDown->store(true);
        });
        // the matching key-up a few frames later, for sinks that track held keys
        std::this_thread::sleep_for(std::chrono::milliseconds(60));
        tasks->AddTask([a_code, sentDown]() { if (sentDown->load()) Send(a_code, false); });
    }).detach();
}

// ---------------------------------------------------------------------------------------------
// --Claude 2026-09-28: SKSE Menu Framework link (exports of our SMF fork, looked up by name).
namespace {
    struct SmfApi {
        bool (*isOpen)()                  = nullptr;
        void (*setOverlay)(bool)          = nullptr;
        void (*reserveKey)(std::uint32_t) = nullptr;
        void (*injectKey)(std::uint32_t)  = nullptr;
        bool resolved = false;
    };

    SmfApi& Smf() {
        static SmfApi api;
        if (!api.resolved) {
            api.resolved = true;
            if (HMODULE m = ::GetModuleHandleW(L"SKSEMenuFramework.dll")) {
                api.isOpen     = reinterpret_cast<bool (*)()>(::GetProcAddress(m, "IsAnyBlockingWindowOpened"));
                api.setOverlay = reinterpret_cast<void (*)(bool)>(::GetProcAddress(m, "SetExternalOverlay"));
                api.reserveKey = reinterpret_cast<void (*)(std::uint32_t)>(::GetProcAddress(m, "SetReservedKey"));
                api.injectKey  = reinterpret_cast<void (*)(std::uint32_t)>(::GetProcAddress(m, "InjectKey"));
            }
            SKSE::log::info("PickMode: SKSE Menu Framework {}; key picker for its pages {}",
                            api.isOpen ? "found" : "not found",
                            api.setOverlay && api.reserveKey && api.injectKey ? "available" : "UNAVAILABLE (needs the SMF fork)");
        }
        return api;
    }
}

bool PickMode::SmfWindowOpen() { auto& a = Smf(); return a.isOpen && a.isOpen(); }
bool PickMode::SmfPickAvailable() { auto& a = Smf(); return a.setOverlay && a.reserveKey && a.injectKey; }
void PickMode::SmfSetOverlay(bool a_on) { if (auto f = Smf().setOverlay) f(a_on); }
void PickMode::SmfReserveKey(std::uint32_t a_dik) { if (auto f = Smf().reserveKey) f(a_dik); }
void PickMode::SmfInject(std::uint32_t a_code) {
    if (auto f = Smf().injectKey) {
        SKSE::log::info("PickMode: sending key {} to the SKSE Menu Framework page", a_code);
        f(a_code);
    }
}

// ---------------------------------------------------------------------------------------------
// --Claude 2026-09-28 (field test fixes)
bool PickMode::McmWaitingForKey() { return SkyUIRemapActive(JournalMovie()); }

bool PickMode::OpenForWaitingMcm() {
    auto* bridge = PrismaUIBridge::GetSingleton();
    auto* mv = JournalMovie();
    if (!bridge || !bridge->IsDomReady() || bridge->IsVisible() || !SkyUIRemapActive(mv)) return false;
    SKSE::log::info("PickMode: toggle key pressed while an MCM waits for a key - opening the picker instead");
    ShowForMcm(mv);
    return true;
}

void PickMode::HoldMenuRemap(bool a_hold) {
    auto* mc = RE::MenuControls::GetSingleton();
    if (!mc) return;
    if (a_hold) {
        if (mc->remapMode) {
            mc->remapMode = false;
            g_heldRemap = true;
            SKSE::log::info("PickMode: menu input back on while the picker is up (cursor)");
        }
    } else if (g_heldRemap) {
        g_heldRemap = false;
        // only if SkyUI still waits - SKSE's handler clears it itself once it has its key
        if (SkyUIWaiting(JournalMovie())) mc->remapMode = true;
    }
}
