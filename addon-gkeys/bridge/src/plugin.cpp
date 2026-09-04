// GKeysInputBridge — makes keyboard F13-F24 (e.g. Logitech G-keys remapped via
// G HUB) visible to EVERY Skyrim mod as ordinary, ENGINE-GENERATED key events.
//
// WHY: Skyrim's BSWin32KeyboardDevice only creates ButtonEvents for scancodes
// registered in its deviceButtons map, and that roster stops at F12 (0x58).
// F13-F24 presses never become InputEvents, so no SKSE sink, no Papyrus
// RegisterForKey and no MCM key-capture can see them — even though the keys
// carry valid DirectInput scancodes (F13-F23 = 0x64-0x6E, F24 = 0x76) and
// GetKeyState / GetAsyncKeyState see them fine.
//
// HOW (v2, 2026-09-04): hook BSWin32KeyboardDevice::Process (vtable slot 2 —
// the same hook Risa's All-In-One Menu uses to press its parked F-keys) and:
//   1. register F13-F24 as real InputButtons in deviceButtons/buttonNameIDMap
//      once, so a key DirectInput reports is emitted by the engine itself;
//   2. after the original Process ran, poll the 12 VKs; if the engine did NOT
//      see the key in its DirectInput state (curState) but Windows says it is
//      down (G HUB injects via SendInput, which DirectInput may not carry),
//      call BSInputDevice::SetButtonState(dik, ...) with the engine's own
//      press / hold / release state machine. The ENGINE then queues the
//      ButtonEvent in this frame's input queue like any hardware key.
// Every consumer — the dispatch call-site hooks (Risa, SMF, wheeler), every
// BSTEventSink<InputEvent*>, Papyrus OnKeyDown (100..118), MCM key capture —
// receives a native event. No chain splicing, no call-site ordering race
// (the v1 splice at RELOCATION_ID(67315,68617)+0x7B was never reliably seen
// by same-call-site consumers in gameplay — see the F19/SMF saga in the wiki).
//
// Gates: keys are released while the game window is not foreground and while
// text entry is active (typing tools that emit F13+ must not trigger hotkeys
// mid-textbox).
//
// UNIVERSAL G-KEY SERVICE (kept from 2026-07-25): each edge also broadcasts a
// mod event — "GKeyDown"/"GKeyUp", numArg = the DIK code (100-118 for F13-F24).
// Subscriber: GetModCallbackEventSource()->AddEventSink; on GKeyDown, if
// (uint)numArg == its toggleKey (stored as the DIK) -> toggle. Papyrus:
// RegisterForModEvent("GKeyDown","OnGKeyDown"); Event OnGKeyDown(string s, float dik).
// The broadcast is deferred one task tick (see FireGKeyEvent). Only edges are
// sent (no hold duration) — single-press only for subscribers.

#include <Windows.h>
#include <ShlObj.h>
#include <chrono>
#include <filesystem>
#include <optional>
#include <spdlog/sinks/basic_file_sink.h>

namespace {

struct FKeyDef {
    int           vk;
    std::uint32_t dik;
    const char*   name;
};

// VK_F13..VK_F24 = 0x7C..0x87. DIK continuation: F13-F23 = 0x64-0x6E, F24 = 0x76.
// MapVirtualKey CANNOT derive these (returns 0 for F16+) — the table is mandatory.
constexpr FKeyDef kFKeys[12] = {
    { 0x7C, 0x64, "F13" }, { 0x7D, 0x65, "F14" }, { 0x7E, 0x66, "F15" },
    { 0x7F, 0x67, "F16" }, { 0x80, 0x68, "F17" }, { 0x81, 0x69, "F18" },
    { 0x82, 0x6A, "F19" }, { 0x83, 0x6B, "F20" }, { 0x84, 0x6C, "F21" },
    { 0x85, 0x6D, "F22" }, { 0x86, 0x6E, "F23" }, { 0x87, 0x76, "F24" },
};

bool                                  g_down[12]        = {};   // we consider the key held
bool                                  g_engineOwned[12] = {};   // the engine saw it in DirectInput state itself
bool                                  g_asyncPress[12]  = {};   // GetAsyncKeyState saw the press (then it alone decides the release)
bool                                  g_stuckLogged[12] = {};
std::chrono::steady_clock::time_point g_pressAt[12];

bool TextEntryActive()
{
    auto* cm = RE::ControlMap::GetSingleton();
    return cm && cm->textEntryCount > 0;
}

bool GameWindowForeground()
{
    HWND active = ::GetActiveWindow();
    return active != nullptr && active == ::GetForegroundWindow();
}

// --Claude 2026-07-25: UNIVERSAL G-KEY SERVICE broadcast (see header).
void FireGKeyEvent(const char* name, std::uint32_t dik)
{
    // DEFER one main-thread task tick so a subscriber that opens a menu / touches
    // ControlMap never re-enters the keyboard-device Process we are running inside.
    if (auto* tasks = SKSE::GetTaskInterface()) {
        tasks->AddTask([name, dik]() {
            if (auto* src = SKSE::GetModCallbackEventSource()) {
                SKSE::ModCallbackEvent evt{ RE::BSFixedString(name), RE::BSFixedString(""),
                                            static_cast<float>(dik), nullptr };
                src->SendEvent(&evt);
            }
        });
    }
}

// Engine BSInputDevice::SetButtonState, called through our own relocation: linking
// CommonLib's BSInputDevice.cpp pulls in virtuals it never defines (LNK2019).
void SetButtonState(RE::BSInputDevice* dev, std::uint32_t dik, float dt, bool wasDown, bool isDown)
{
    using Fn = void(RE::BSInputDevice*, std::uint32_t, float, bool, bool);
    static REL::Relocation<Fn*> func{ RELOCATION_ID(67441, 68748) };
    func(dev, dik, dt, wasDown, isDown);
}

struct KeyboardProcessHook {
    using Fn = void(RE::BSWin32KeyboardDevice*, float);
    static inline Fn* func = nullptr;

    // Register F13-F24 as engine buttons once. If DirectInput reports the key,
    // the engine's own Process then emits its ButtonEvents with no help from us.
    static void EnsureButtons(RE::BSWin32KeyboardDevice* kb)
    {
        static bool done = false;
        if (done || !kb) return;
        done = true;
        int found = 0, added = 0;
        for (const auto& k : kFKeys) {
            if (kb->deviceButtons.find(k.dik) != kb->deviceButtons.end()) {
                ++found;
                continue;
            }
            auto* button = new RE::BSInputDevice::InputButton{};
            button->name         = RE::BSFixedString(k.name);
            button->heldDownSecs = 0.0f;
            button->keycode      = k.dik;
            using ButtonsVT = std::remove_reference_t<decltype(kb->deviceButtons)>::value_type;
            using NamesVT   = std::remove_reference_t<decltype(kb->buttonNameIDMap)>::value_type;
            kb->deviceButtons.insert(ButtonsVT{ k.dik, button });
            kb->buttonNameIDMap.insert(NamesVT{ button->name, k.dik });
            ++added;
        }
        SKSE::log::info("GKeysInputBridge: keyboard buttons F13-F24: {} already registered by the engine, {} added by us",
                        found, added);
    }

    static void thunk(RE::BSWin32KeyboardDevice* kb, float dt)
    {
        EnsureButtons(kb);
        func(kb, dt);
        if (!kb) return;

        const bool gateOK = GameWindowForeground() && !TextEntryActive();
        const auto now    = std::chrono::steady_clock::now();

        for (int i = 0; i < 12; ++i) {
            const auto& k      = kFKeys[i];
            const bool  diDown = (kb->curState[k.dik] & 0x80) != 0;   // engine saw it this frame
            // Two Windows views of the key. GetAsyncKeyState = physical/injected state right
            // now (Risa's AIO MinHooks it, but its hook only alters answers for specific caller
            // modules, never ours — verified in its v4.9 source). GetKeyState = this thread's
            // message-queue view; it can STICK "down" when an overlay's window filter swallows
            // the key-up message (2026-09-04 field log: F20 never re-armed after toggling
            // Risa's launcher until another key was pressed). So: either API may open a press,
            // but once GetAsyncKeyState has seen the press it ALONE decides the release.
            const bool ksDown = (::GetKeyState(k.vk) & 0x8000) != 0;
            const bool asDown = (::GetAsyncKeyState(k.vk) & 0x8000) != 0;
            const bool phys   = gateOK && (ksDown || asDown);

            if (!g_down[i]) {
                if (!diDown && !phys) continue;
                // press edge
                g_down[i]        = true;
                g_engineOwned[i] = diDown;
                g_asyncPress[i]  = asDown;
                g_stuckLogged[i] = false;
                g_pressAt[i]     = now;
                if (!diDown) SetButtonState(kb, k.dik, 0.0f, false, true);
                FireGKeyEvent("GKeyDown", k.dik);
                SKSE::log::info("GKeys: {} DOWN ({}; KeyState={} Async={})", k.name,
                                diDown ? "engine-native" : "emulated via SetButtonState", ksDown, asDown);
                continue;
            }

            // held or released
            bool stillDown;
            if (g_engineOwned[i])      stillDown = diDown;
            else if (g_asyncPress[i])  stillDown = gateOK && asDown;
            else {                     // press only ever seen by GetKeyState: OR until async confirms
                if (asDown) g_asyncPress[i] = true;
                stillDown = phys;
            }
            if (stillDown) {
                if (!g_engineOwned[i]) SetButtonState(kb, k.dik, dt, true, true);
                if (!g_stuckLogged[i] &&
                    std::chrono::duration<float>(now - g_pressAt[i]).count() > 1.5f) {
                    g_stuckLogged[i] = true;
                    SKSE::log::warn("GKeys: {} held >1.5s (di={} KeyState={} Async={} asyncPress={}) — stuck key?",
                                    k.name, diDown, ksDown, asDown, g_asyncPress[i]);
                }
                continue;
            }
            g_down[i] = false;
            if (!g_engineOwned[i]) SetButtonState(kb, k.dik, dt, true, false);
            SKSE::log::info("GKeys: {} UP after {:.3f}s (KeyState={} Async={})", k.name,
                            std::chrono::duration<float>(now - g_pressAt[i]).count(), ksDown, asDown);
            g_engineOwned[i] = false;
            g_asyncPress[i]  = false;
            FireGKeyEvent("GKeyUp", k.dik);
        }
    }

    static bool Install()
    {
        auto* manager = RE::BSInputDeviceManager::GetSingleton();
        auto* kb      = manager ? manager->GetKeyboard() : nullptr;
        if (!kb) {
            SKSE::log::error("GKeysInputBridge: no keyboard device — hook NOT installed");
            return false;
        }
        auto** vtable = *reinterpret_cast<void***>(kb);
        if (vtable[2] == reinterpret_cast<void*>(&thunk)) return true;
        func = reinterpret_cast<Fn*>(vtable[2]);
        REL::safe_write(reinterpret_cast<std::uintptr_t>(&vtable[2]),
                        reinterpret_cast<std::uintptr_t>(&thunk));
        SKSE::log::info("GKeysInputBridge: BSWin32KeyboardDevice::Process hooked (previous=0x{:X}) — F13-F24 -> engine ButtonEvents",
                        reinterpret_cast<std::uintptr_t>(func));
        return true;
    }
};

void InitializeLogging()
{
    // --Claude 2026-09-03: SKSE::log::log_directory() resolved to "My Games\\Skyrim.INI\\SKSE" on
    // this 1.6.1170 install (known CommonLib-NG quirk, see wiki gotcha). Resolve Documents
    // ourselves so the log lands beside every other plugin's.
    std::optional<std::filesystem::path> path;
    {
        PWSTR docs = nullptr;
        if (SUCCEEDED(::SHGetKnownFolderPath(FOLDERID_Documents, KF_FLAG_DEFAULT, nullptr, &docs)) && docs) {
            path = std::filesystem::path(docs) / "My Games" / "Skyrim Special Edition" / "SKSE";
            ::CoTaskMemFree(docs);
        }
    }
    if (!path) path = SKSE::log::log_directory();
    if (!path) return;
    std::error_code ec;
    std::filesystem::create_directories(*path, ec);
    *path /= "GKeysInputBridge.log";
    auto sink = std::make_shared<spdlog::sinks::basic_file_sink_mt>(path->string(), true);
    auto log  = std::make_shared<spdlog::logger>("global log", std::move(sink));
    log->set_level(spdlog::level::info);
    log->flush_on(spdlog::level::info);
    spdlog::set_default_logger(std::move(log));
    spdlog::set_pattern("[%H:%M:%S.%e] [%l] %v");
}

}  // namespace

SKSEPluginLoad(const SKSE::LoadInterface* skse)
{
    InitializeLogging();
    SKSE::log::info("GKeysInputBridge v2 loading...");
    SKSE::Init(skse);

    // Install one main-loop tick AFTER every plugin's kDataLoaded handler ran: RisaUI
    // writes the same vtable slot directly in its kDataLoaded handler, so deferring
    // makes us the outer wrapper (ours -> Risa's -> engine) and neither side
    // clobbers the other. The keyboard device only exists once the input manager
    // is up, which is also guaranteed by then.
    SKSE::GetMessagingInterface()->RegisterListener([](SKSE::MessagingInterface::Message* msg) {
        if (msg->type == SKSE::MessagingInterface::kDataLoaded) {
            if (auto* tasks = SKSE::GetTaskInterface()) {
                tasks->AddTask([]() { KeyboardProcessHook::Install(); });
            } else {
                KeyboardProcessHook::Install();
            }
        }
    });
    return true;
}
