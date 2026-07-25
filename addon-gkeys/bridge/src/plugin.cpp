// GKeysInputBridge — makes keyboard F13-F24 (e.g. Logitech G-keys remapped via
// G HUB) visible to EVERY Skyrim mod as ordinary key events.
//
// WHY: Skyrim's BSWin32KeyboardDevice only creates ButtonEvents for scancodes
// pre-registered in its deviceButtons map, and that roster stops at F12 (0x58).
// F13-F24 presses never become InputEvents, so no SKSE sink, no Papyrus
// RegisterForKey and no MCM key-capture can see them — even though the keys
// carry valid DirectInput scancodes (F13-F23 = 0x64-0x6E, F24 = 0x76) and
// GetAsyncKeyState sees them fine. (Mechanism confirmed by reading
// Risas-All-In-One-Menu src/main.cpp, which polls raw DI state /
// GetAsyncKeyState for exactly this reason, and carries the same VK<->DIK
// table because MapVirtualKey returns 0 for most of these keys.)
//
// HOW: hook the input-event dispatch call site (wheeler's proven pattern:
// write_call<5> at RELOCATION_ID(67315, 68617) + 0x7B — a CALL-SITE hook,
// never a prologue write_branch). Each dispatch we poll the 12 VK codes,
// edge-detect, and splice a static pool of synthetic ButtonEvents (idCode =
// the DIK continuation codes 100-110 and 118) onto the tail of the event
// chain before forwarding to the original dispatcher. Downstream, every
// mod's event sink, SKSE's Papyrus key events (OnKeyDown keyCode 100..118)
// and MCM key-capture receive them as if the engine had made them. MCMs
// show a BLANK NAME for these codes (the game has no name-table entry for
// them) but they bind and fire correctly.
//
// Gates: events are suppressed (held keys released) while the game window is
// not foreground and while text entry is active (typing tools that emit F13+
// must not trigger hotkeys mid-textbox).
//
// UNIVERSAL G-KEY SERVICE (2026-07-25): in addition to the ButtonEvent injection
// above (which serves MCMs / mods we can't modify), each edge broadcasts a mod event
// -- "GKeyDown"/"GKeyUp", numArg = the DIK code (100-118 for F13-F24). OUR UI mods
// subscribe to that instead of relying on the injected ButtonEvent (which loses a
// dispatch-ordering race in gameplay). Subscriber: GetModCallbackEventSource()->
// AddEventSink; on GKeyDown, if (uint)numArg == its toggleKey (stored as the DIK) ->
// toggle; and its ButtonEvent path must SKIP idCode 100-118 so it doesn't double-fire.
// The broadcast is deferred one task tick (see FireGKeyEvent) to stay off the fragile
// injection stack. NOTE: only press/release edges are sent (no hold duration), so a
// subscriber's hold/double-press ToggleMode can't apply to a G-key -- single-press only.

#include <Windows.h>
#include <chrono>
#include <spdlog/sinks/basic_file_sink.h>

namespace {

struct FKeyDef {
    int           vk;
    std::uint32_t dik;
};

// VK_F13..VK_F24 = 0x7C..0x87. DIK continuation: F13-F23 = 0x64-0x6E, F24 = 0x76.
// MapVirtualKey CANNOT derive these (returns 0 for F16+) — the table is mandatory.
constexpr FKeyDef kFKeys[12] = {
    { 0x7C, 0x64 }, { 0x7D, 0x65 }, { 0x7E, 0x66 },  // F13 F14 F15
    { 0x7F, 0x67 }, { 0x80, 0x68 }, { 0x81, 0x69 },  // F16 F17 F18
    { 0x82, 0x6A }, { 0x83, 0x6B }, { 0x84, 0x6C },  // F19 F20 F21
    { 0x85, 0x6D }, { 0x86, 0x6E }, { 0x87, 0x76 },  // F22 F23 F24
};

RE::ButtonEvent*                      g_pool[12] = {};
bool                                  g_down[12] = {};
std::chrono::steady_clock::time_point g_pressAt[12];

// Splice bookkeeping (dispatch is single-threaded — statics are fine)
RE::InputEvent*  g_attachTail = nullptr;   // native tail we appended to (null if chain was empty)
RE::InputEvent** g_headPtr    = nullptr;   // where we wrote the head when the chain was empty
RE::InputEvent*  g_injHead    = nullptr;   // first injected event this dispatch

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

void EnsurePool()
{
    if (g_pool[0]) return;
    for (int i = 0; i < 12; ++i) {
        g_pool[i] = RE::ButtonEvent::Create(
            RE::INPUT_DEVICE::kKeyboard, RE::BSFixedString(""), kFKeys[i].dik, 0.0f, 0.0f);
    }
    SKSE::log::info("GKeysInputBridge: event pool created (F13-F24 -> DIK 100-110,118)");
}

// --Claude 2026-07-25: UNIVERSAL G-KEY SERVICE. Besides injecting ButtonEvents (for
// MCMs / third-party mods we can't modify), broadcast a mod event on each G-key edge
// so OUR UI mods subscribe reliably. A ModCallbackEvent (unlike the injected
// ButtonEvent) has no input-dispatch ordering race - the injection failing to reach a
// consumer in gameplay is the whole bug we've been fighting. numArg = the DIK code
// (100-118 for F13-F24) - exactly what SMF/HotkeyPanel/FollowerUI already store as
// their toggle key, so a subscriber compares `numArg == toggleKey` with NO mapping.
//   API contract:  event "GKeyDown"/"GKeyUp", strArg "", numArg = DIK (100..118).
//   C++ subscriber: GetModCallbackEventSource()->AddEventSink; on GKeyDown, if
//                   (uint32_t)numArg == myToggleKey -> toggle.
//   Papyrus:        RegisterForModEvent("GKeyDown","OnGKeyDown"); Event OnGKeyDown(
//                   string s, float dik).
void FireGKeyEvent(const char* name, std::uint32_t dik)
{
    // DEFER one main-thread task tick. Firing SendEvent synchronously from inside the
    // injection loop (before the original dispatch runs) would invoke every subscriber
    // on this stack; a subscriber that opens a menu / touches ControlMap could re-enter
    // the hooked dispatch and clobber the non-reentrant splice statics (g_injHead/g_pool).
    // A one-frame delay on a menu toggle is imperceptible. `name` is a string literal
    // (static storage) so capturing the pointer is safe.
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

struct DispatchHook {
    static void thunk(RE::BSTEventSource<RE::InputEvent*>* a_dispatcher, RE::InputEvent** a_evns)
    {
        if (a_evns) Inject(a_evns);
        func(a_dispatcher, a_evns);
        if (a_evns) Unlink(a_evns);
    }
    static inline REL::Relocation<decltype(thunk)> func;

    static void Inject(RE::InputEvent** a_evns)
    {
        EnsurePool();
        g_attachTail = nullptr;
        g_headPtr    = nullptr;
        g_injHead    = nullptr;

        const bool gateOK = GameWindowForeground() && !TextEntryActive();
        const auto now    = std::chrono::steady_clock::now();

        RE::InputEvent* injTail = nullptr;
        for (int i = 0; i < 12; ++i) {
            auto* ev = g_pool[i];
            if (!ev) continue;

            // --Claude 2026-07-24: poll GetKeyState (thread-message state) OR'd with
            // GetAsyncKeyState. Risas AIO MinHooks GetAsyncKeyState process-wide and
            // returns 0 to other callers for keys it manages (it reads SMF's ini at
            // startup, so the SMF toggle key gets nulled in gameplay and only works
            // while a menu lifts its block — "closes but won't reopen"). GetKeyState
            // is a separate user32 export it doesn't hook; the dispatch thunk runs on
            // the main thread, which pumps the game window's messages, so it's fresh.
            const bool phys = gateOK &&
                (((::GetKeyState(kFKeys[i].vk) | ::GetAsyncKeyState(kFKeys[i].vk)) & 0x8000) != 0);
            float      value, held;
            if (phys && !g_down[i]) {                 // press edge
                g_down[i]    = true;
                g_pressAt[i] = now;
                value = 1.0f; held = 0.0f;
                FireGKeyEvent("GKeyDown", kFKeys[i].dik);   // --Claude: universal API broadcast
                // --Claude diagnostics: name every G-key edge with which API saw it —
                // makes "the key did nothing" a one-line log read.
                SKSE::log::info("GKeys: F{} DOWN (KeyState={} Async={})", 13 + (i == 11 ? 11 : i),
                                (::GetKeyState(kFKeys[i].vk) & 0x8000) != 0,
                                (::GetAsyncKeyState(kFKeys[i].vk) & 0x8000) != 0);
            } else if (phys && g_down[i]) {           // still held — native keyboards emit every frame
                value = 1.0f;
                held  = std::chrono::duration<float>(now - g_pressAt[i]).count();
            } else if (!phys && g_down[i]) {          // release edge (incl. gate loss)
                g_down[i] = false;
                value = 0.0f;
                held  = std::chrono::duration<float>(now - g_pressAt[i]).count();
                FireGKeyEvent("GKeyUp", kFKeys[i].dik);     // --Claude: universal API broadcast
            } else {
                continue;
            }

            ev->value        = value;
            ev->heldDownSecs = held;
            ev->next         = nullptr;
            if (!g_injHead) g_injHead = ev;
            if (injTail) injTail->next = ev;
            injTail = ev;
        }
        if (!g_injHead) return;

        if (*a_evns == nullptr) {
            g_headPtr = a_evns;
            *a_evns   = g_injHead;
        } else {
            auto* tail = *a_evns;
            while (tail->next) tail = tail->next;
            g_attachTail = tail;
            tail->next   = g_injHead;
        }
    }

    static void Unlink(RE::InputEvent** a_evns)
    {
        // Detach our pool events so the queue's per-frame reset never owns them.
        if (!g_injHead) return;
        if (g_attachTail) {
            g_attachTail->next = nullptr;
        } else if (g_headPtr && *g_headPtr == g_injHead) {
            *g_headPtr = nullptr;
        }
        for (auto* ev : g_pool) {
            if (ev) ev->next = nullptr;
        }
        g_attachTail = nullptr;
        g_headPtr    = nullptr;
        g_injHead    = nullptr;
    }
};

void InitializeLogging()
{
    auto path = SKSE::log::log_directory();
    if (!path) return;
    *path /= "GKeysInputBridge.log";
    auto sink = std::make_shared<spdlog::sinks::basic_file_sink_mt>(path->string(), true);
    auto log  = std::make_shared<spdlog::logger>("global log", std::move(sink));
    log->set_level(spdlog::level::info);
    log->flush_on(spdlog::level::info);
    spdlog::set_default_logger(std::move(log));
    spdlog::set_pattern("[%H:%M:%S.%e] [%l] %v");
}

}  // namespace

namespace {

void InstallHook()
{
    SKSE::AllocTrampoline(14);
    auto&                           trampoline = SKSE::GetTrampoline();
    REL::Relocation<std::uintptr_t> caller{ RELOCATION_ID(67315, 68617) };
    DispatchHook::func = trampoline.write_call<5>(caller.address() + 0x7B, DispatchHook::thunk);
    SKSE::log::info("GKeysInputBridge: input dispatch hooked (F13-F24 -> synthetic ButtonEvents)");
}

}  // namespace

SKSEPluginLoad(const SKSE::LoadInterface* skse)
{
    InitializeLogging();
    SKSE::log::info("GKeysInputBridge loading...");
    SKSE::Init(skse);

    // --Claude ORDERING FIX: SKSE Menu Framework 3 hooks the SAME call site
    // (its ProcessInputQueueHook) at plugin-load time, and DLLs load
    // alphabetically — G(KeysInputBridge) before S(KSEMenuFramework) — so a
    // load-time install here gets WRAPPED by SMF3: its thunk would run first
    // and tap the chain BEFORE our injection, starving every AddInputEvent
    // subscriber (iHUD's hotkey listener, PEM's press-to-bind capture) of the
    // G-keys while plain sinks (MCM/SkyUI) saw them fine. Deferring the
    // install to a task queued at kDataLoaded runs it one main-loop tick
    // AFTER every plugin's load-time installs — we become the OUTERMOST
    // wrapper, injecting before SMF3's tap so everyone sees the keys.
    SKSE::GetMessagingInterface()->RegisterListener([](SKSE::MessagingInterface::Message* msg) {
        if (msg->type == SKSE::MessagingInterface::kDataLoaded) {
            if (auto* tasks = SKSE::GetTaskInterface()) {
                tasks->AddTask([]() { InstallHook(); });
            } else {
                InstallHook();
            }
        }
    });
    return true;
}
