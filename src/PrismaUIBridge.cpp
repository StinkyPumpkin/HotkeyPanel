#include "PrismaUIBridge.h"
#include "JsonStore.h"
#include "InputHandler.h"
#include "BlockerMenu.h"
#include <format>
#include <set>
#include <mutex>
#include <thread>
#include <chrono>
#include <functional>
#include <Windows.h>

static PrismaUIBridge* g_bridge = nullptr;

// --Claude focus recovery (ported from PEM, origin: archived sexlab-p-prism): after
// closing the panel, verify PrismaUI actually released focus AND its FocusMenu, retry
// via public API only, and if the focus/cursor state is still stuck, pulse the Console
// open->closed once — a menu cycle forces the engine to rebuild its cursor/menu input
// state. This automates the user's manual fix ("opening and closing the tween menu
// fixes it") for: mouse pointer stays on screen after closing the panel.
namespace HKPFocusRecovery {
namespace {
    using namespace std::chrono_literals;
    constexpr const char* kFocusMenu = "PrismaUI_FocusMenu";

    std::mutex g_lock;
    PRISMA_UI_API::IVPrismaUI2* g_api = nullptr;
    PrismaView g_view = 0;
    std::atomic<std::uint64_t> g_gen{0};
    std::atomic<bool> g_consoleOwned{false};

    // Minimal delayed-to-main-thread scheduler (detached worker; jobs hop via AddTask)
    class Scheduler {
    public:
        static Scheduler& Get() { static Scheduler s; return s; }
        void After(std::chrono::milliseconds delay, std::function<void()> task) {
            std::thread([delay, task = std::move(task)]() {
                std::this_thread::sleep_for(delay);
                if (auto* tasks = SKSE::GetTaskInterface()) tasks->AddTask(task);
            }).detach();
        }
    };

    bool Current(std::uint64_t gen, PRISMA_UI_API::IVPrismaUI2*& api, PrismaView& view) {
        std::scoped_lock lk(g_lock);
        if (g_gen.load() != gen || !g_api || !g_view) return false;
        api = g_api; view = g_view;
        return true;
    }

    bool MenuOpen(const char* name) {
        auto* ui = RE::UI::GetSingleton();
        return ui && ui->IsMenuOpen(name);
    }

    void QueueMenu(const char* name, RE::UI_MESSAGE_TYPE type) {
        if (auto* q = RE::UIMessageQueue::GetSingleton()) q->AddMessage(name, type, nullptr);
    }

    void CloseOwnedConsole() {
        if (g_consoleOwned.exchange(false)) {
            SKSE::log::info("HKPFocusRecovery: closing recovery console");
            QueueMenu("Console", RE::UI_MESSAGE_TYPE::kHide);
        }
    }

    void ConsolePulse(std::uint64_t gen) {
        PRISMA_UI_API::IVPrismaUI2* api; PrismaView view;
        if (!Current(gen, api, view)) return;
        if (MenuOpen("Console")) return;               // user's own console — leave it
        bool expected = false;
        if (!g_consoleOwned.compare_exchange_strong(expected, true)) return;
        SKSE::log::warn("HKPFocusRecovery: console pulse (rebuild mouse/menu input state)");
        QueueMenu("Console", RE::UI_MESSAGE_TYPE::kShow);
        // real time between show and hide is REQUIRED (prism: same-frame never works)
        Scheduler::Get().After(180ms, [gen]() { CloseOwnedConsole(); });
    }

    void VerifyCleanup(std::uint64_t gen, int attempt, bool needsPulse) {
        PRISMA_UI_API::IVPrismaUI2* api; PrismaView view;
        if (!Current(gen, api, view)) { CloseOwnedConsole(); return; }

        const bool ownFocus  = api->HasFocus(view);
        const bool anyFocus  = api->HasAnyActiveFocus();
        const bool focusMenu = MenuOpen(kFocusMenu);
        // --Claude HKP addition: the reported symptom is the CURSOR staying on screen
        // with focus already clean — Cursor Menu still open this long after teardown
        // (blocker closed, no Prisma focus) means the cursor state is stuck too.
        const bool cursorStuck = !anyFocus && !focusMenu &&
                                 MenuOpen("Cursor Menu");  // RE::CursorMenu::MENU_NAME (string_view in this CommonLib)

        if (!ownFocus && anyFocus) {
            ConsolePulse(gen);  // another Prisma mod holds focus — pulse makes it yield
            return;
        }
        if (ownFocus && attempt < 3) {
            SKSE::log::warn("HKPFocusRecovery: still focused after close - retry Unfocus ({})", attempt + 1);
            api->Unfocus(view);
        }
        if (focusMenu) {
            SKSE::log::warn("HKPFocusRecovery: stale FocusMenu - ForceHide ({})", attempt + 1);
            QueueMenu(kFocusMenu, RE::UI_MESSAGE_TYPE::kForceHide);
        }
        if ((ownFocus || focusMenu) && attempt < 3) {
            Scheduler::Get().After(80ms, [gen, attempt]() { VerifyCleanup(gen, attempt + 1, true); });
            return;
        }
        if (cursorStuck) SKSE::log::warn("HKPFocusRecovery: Cursor Menu stuck after close");
        if (needsPulse || ownFocus || focusMenu || cursorStuck) ConsolePulse(gen);
    }

    void CheckUnfocus(std::uint64_t gen, int attempt) {
        PRISMA_UI_API::IVPrismaUI2* api; PrismaView view;
        if (!Current(gen, api, view) || !api->IsValid(view)) return;

        if (api->HasFocus(view) && attempt < 5) {
            SKSE::log::warn("HKPFocusRecovery: waiting for Unfocus ({}/5)", attempt + 1);
            api->Unfocus(view);
            Scheduler::Get().After(70ms, [gen, attempt]() { CheckUnfocus(gen, attempt + 1); });
            return;
        }
        const bool stale = MenuOpen(kFocusMenu) || api->HasFocus(view);
        if (stale) QueueMenu(kFocusMenu, RE::UI_MESSAGE_TYPE::kHide);
        Scheduler::Get().After(90ms, [gen, stale]() { VerifyCleanup(gen, 0, stale); });
    }
}  // namespace

void Arm(PRISMA_UI_API::IVPrismaUI2* api, PrismaView view) {
    if (!api || !view) return;
    const auto gen = ++g_gen;
    { std::scoped_lock lk(g_lock); g_api = api; g_view = view; }
    Scheduler::Get().After(90ms, [gen]() { CheckUnfocus(gen, 0); });
}

void Cancel() {
    ++g_gen;
    CloseOwnedConsole();
}

bool IsConsoleOwned() { return g_consoleOwned.load(); }
}  // namespace HKPFocusRecovery

// --Claude font selector (ported from PEM): enumerate installed system font
// families via GDI and return them as a JSON string array. Runs once at DOM
// ready. WideCharToMultiByte(CP_UTF8) output is always valid UTF-8, so the
// Ultralight invoke can't be dropped for encoding.
static std::string BuildFontListJson()
{
    std::set<std::wstring> families;
    LOGFONTW lf{};
    lf.lfCharSet = DEFAULT_CHARSET;
    HDC hdc = ::GetDC(nullptr);
    if (hdc) {
        ::EnumFontFamiliesExW(hdc, &lf,
            [](const LOGFONTW* lpelfe, const TEXTMETRICW*, DWORD, LPARAM lparam) -> int {
                auto* out = reinterpret_cast<std::set<std::wstring>*>(lparam);
                if (lpelfe && lpelfe->lfFaceName[0] != L'@')
                    out->insert(lpelfe->lfFaceName);
                return 1;
            },
            reinterpret_cast<LPARAM>(&families), 0);
        ::ReleaseDC(nullptr, hdc);
    }

    std::string json = "[";
    bool first = true;
    for (const auto& w : families) {
        int n = ::WideCharToMultiByte(CP_UTF8, 0, w.c_str(), -1, nullptr, 0, nullptr, nullptr);
        if (n <= 1) continue;
        std::string u8(static_cast<size_t>(n) - 1, '\0');
        ::WideCharToMultiByte(CP_UTF8, 0, w.c_str(), -1, u8.data(), n, nullptr, nullptr);
        std::string esc;
        esc.reserve(u8.size() + 2);
        for (char c : u8) {
            if (c == '\\' || c == '"') esc += '\\';
            esc += c;
        }
        if (!first) json += ",";
        first = false;
        json += "\"" + esc + "\"";
    }
    json += "]";
    return json;
}

// --Claude console guard (pattern proven in PEM, origin: archived sexlab-p-prism
// MenuVisibilitySink): the input sink's kStop SHOULD swallow tilde, but sink order is
// registration order — the game's own menu-input handling can run first and open the
// Console over the panel anyway. This closes it the instant it opens while the panel
// is visible. NO ControlMap manipulation — that route crashes (controlmap gotcha).
class HKPConsoleGuard final : public RE::BSTEventSink<RE::MenuOpenCloseEvent> {
public:
    static HKPConsoleGuard* GetSingleton() {
        static HKPConsoleGuard guard;
        return &guard;
    }
    RE::BSEventNotifyControl ProcessEvent(const RE::MenuOpenCloseEvent* a_event,
        RE::BSTEventSource<RE::MenuOpenCloseEvent>*) override {
        if (a_event && a_event->opening && a_event->menuName == "Console") {
            if (HKPFocusRecovery::IsConsoleOwned()) return RE::BSEventNotifyControl::kContinue;
            auto* bridge = PrismaUIBridge::GetSingleton();
            if (bridge && bridge->IsVisible()) {
                if (auto* queue = RE::UIMessageQueue::GetSingleton()) {
                    queue->AddMessage("Console", RE::UI_MESSAGE_TYPE::kHide, nullptr);
                    SKSE::log::info("HKPConsoleGuard: Console closed (opened over the panel)");
                }
            }
        }
        return RE::BSEventNotifyControl::kContinue;
    }
};

void PrismaUIBridge::RegisterConsoleGuard() {
    if (auto* ui = RE::UI::GetSingleton()) {
        ui->AddEventSink<RE::MenuOpenCloseEvent>(HKPConsoleGuard::GetSingleton());
        SKSE::log::info("HKPConsoleGuard: registered");
    }
}

PrismaUIBridge* PrismaUIBridge::GetSingleton() {
    static PrismaUIBridge singleton;
    return &singleton;
}

bool PrismaUIBridge::Initialize() {
    if (m_ready) return true;
    SKSE::log::info("PrismaUIBridge: Initializing...");

    m_api = PRISMA_UI_API::RequestPluginAPI<PRISMA_UI_API::IVPrismaUI2>();
    if (!m_api) {
        auto v1 = PRISMA_UI_API::RequestPluginAPI<PRISMA_UI_API::IVPrismaUI1>();
        if (!v1) {
            SKSE::log::error("PrismaUIBridge: PrismaUI not found! Is PrismaUI.dll installed?");
            return false;
        }
        m_api = static_cast<PRISMA_UI_API::IVPrismaUI2*>(v1);
        SKSE::log::info("PrismaUIBridge: Using PrismaUI API v1");
    } else {
        SKSE::log::info("PrismaUIBridge: Using PrismaUI API v2");
    }

    g_bridge = this;

    m_view = m_api->CreateView("HotkeyPanel/index.html",
        [](PrismaView) {
            SKSE::log::info("PrismaUIBridge: DOM ready!");
            if (g_bridge) {
                g_bridge->m_domReady = true;
                g_bridge->RegisterJSListeners();
                g_bridge->PushInitialState();
                g_bridge->InvokeJS("HKP.setFonts(" + BuildFontListJson() + ")");
            }
        });

    if (!m_view) {
        SKSE::log::error("PrismaUIBridge: Failed to create Prisma view!");
        return false;
    }

    m_api->Hide(m_view);
    m_ready = true;
    SKSE::log::info("PrismaUIBridge: Initialized successfully!");
    return true;
}

void PrismaUIBridge::Shutdown() {
    if (m_api && m_view) {
        m_api->Destroy(m_view);
        m_view = 0;
    }
    m_ready = false;
    m_domReady = false;
    g_bridge = nullptr;
}

void PrismaUIBridge::RegisterJSListeners() {
    if (!m_api || !m_view) return;

    // UI ready notification (currently unused but available for retry paths)
    m_api->RegisterJSListener(m_view, "hkpReady", [](const char* data) {
        SKSE::log::info("UI: hkpReady");
    });

    // JS → DLL: persist full state JSON
    m_api->RegisterJSListener(m_view, "hkpSaveState", [](const char* data) {
        if (!data) return;
        std::string json(data);
        SKSE::log::info("UI: hkpSaveState ({} bytes)", json.size());
        JsonStore::Save(json);
    });

    // JS → DLL: user closed the UI from inside the panel (X button, etc.)
    m_api->RegisterJSListener(m_view, "hkpCloseUI", [](const char*) {
        SKSE::log::info("UI: hkpCloseUI");
        if (g_bridge) g_bridge->HideUI();
    });

    // JS → DLL: settings push. Fired once on loadState (so we learn the
    // persisted toggle key) and whenever the user changes it in Settings.
    // Format: "enabled|keyName"   e.g. "1|F11", "0|", "1|KeyQ"
    m_api->RegisterJSListener(m_view, "hkpSetToggleKey", [](const char* data) {
        std::string s(data ? data : "");
        SKSE::log::info("UI: hkpSetToggleKey '{}'", s);
        auto pipe = s.find('|');
        if (pipe == std::string::npos) return;
        const bool enabled = (s.substr(0, pipe) == "1");
        const std::string keyName = s.substr(pipe + 1);
        const auto code = InputHandler::KeyNameToDXScanCode(keyName);
        InputHandler::GetSingleton()->SetToggleKey(code, enabled);
    });

    // JS → DLL: pause-on-show preference. No UI for this yet but kept for
    // forward compat — JS may dispatch it via dispatchToBridge('hkpSetPause').
    m_api->RegisterJSListener(m_view, "hkpSetPause", [](const char* data) {
        std::string s(data ? data : "");
        SKSE::log::info("UI: hkpSetPause '{}'", s);
        if (g_bridge) g_bridge->m_pauseOnShow = (s == "1");
    });

    // JS → DLL: "1" while any text box has focus (edit-name modal, profile modal,
    // inline mouse inputs), "0" when it blurs. Gates the close keys in InputHandler.
    m_api->RegisterJSListener(m_view, "hkpTextInput", [](const char* data) {
        if (g_bridge) g_bridge->SetTextInputActive(data && data[0] == '1');
    });

    SKSE::log::info("PrismaUIBridge: JS listeners registered");
}

void PrismaUIBridge::PushInitialState() {
    if (m_initialStateSent.exchange(true)) return;
    std::string json = JsonStore::Load();
    if (json.empty()) {
        // First run — let the UI use its built-in DEFAULT_STATE
        SKSE::log::info("PrismaUIBridge: No saved state, UI will start with defaults");
        return;
    }
    SendState(json);
}

void PrismaUIBridge::InvokeJS(const std::string& script) {
    if (!m_api || !m_view || !m_domReady) return;
    m_api->Invoke(m_view, script.c_str());
}

void PrismaUIBridge::ShowUI() {
    if (!m_ready || !m_api) return;
    if (!m_api->IsHidden(m_view)) return;

    // --Claude 2026-07-23: aligned to the MANDATED FollowerUI/PEM pattern
    // (feedback-prismaui-blockermenu): blocker (kPausesGame) open FIRST, then Show,
    // then Focus(view, false) — pause comes from the blocker (Focus-pause deadlocks
    // the JS close callback) and PrismaUI's own FocusMenu stays ENABLED. That focus
    // shell is what handles ESC at the ENGINE level; suppressing it (the old
    // disableFocusMenu=true) let ESC fall through to the vanilla pause action
    // ("close also brings up the esc menu") and left the cursor stuck after close.
    //
    // FAILED APPROACHES (kept for the historical record):
    //   - enabledControls snapshot+restore   — locked Alt-Start cell
    //   - ignoreKeyboardMouse (doodlum)      — blocks mouse, breaks alt-tab
    //   - AllowTextInput + in-place zero     — engine state corrupted, Tab/Tween blocked
    HKPFocusRecovery::Cancel();
    BlockerMenu::Open();

    m_api->Show(m_view);
    m_api->Focus(m_view, false);

    InvokeJS("HKP.show()");
    SKSE::log::info("PrismaUIBridge: UI shown (blocker pauses, Prisma FocusMenu active)");
}

void PrismaUIBridge::HideUI() {
    if (!m_ready || !m_api || !IsVisible()) return;
    m_textInput.store(false);  // never leave the text-input gate armed after close
    InvokeJS("HKP.hide()");
    m_api->Unfocus(m_view);
    m_api->Hide(m_view);

    if (BlockerMenu::IsOpen()) BlockerMenu::Close();

    // --Claude: verify PrismaUI actually let go (focus, FocusMenu, cursor);
    // self-heals the "mouse pointer still on screen after close" report.
    HKPFocusRecovery::Arm(m_api, m_view);

    // --Claude 2026-07-25: same fix as TFCam - a paused cursor menu can strand
    // ThirdPersonState with freeRotationEnabled=false, so after close the mouse yaw
    // steers the ACTOR instead of orbiting the camera (wrong under True Directional
    // Movement). Re-assert one tick after the menu-close settles.
    if (auto* tasks = SKSE::GetTaskInterface()) {
        tasks->AddTask([]() {
            auto* cam = RE::PlayerCamera::GetSingleton();
            if (!cam) return;
            auto& third = cam->cameraStates[RE::CameraState::kThirdPerson];
            if (third && cam->currentState.get() == third.get()) {
                auto* tps = static_cast<RE::ThirdPersonState*>(third.get());
                if (!tps->freeRotationEnabled) {
                    tps->freeRotationEnabled = true;
                    SKSE::log::info("HKP: third-person free rotation was OFF after close - re-enabled");
                }
            }
        });
    }

    SKSE::log::info("PrismaUIBridge: UI hidden");
}

void PrismaUIBridge::ToggleUI() {
    if (!m_ready || !m_api) return;
    if (IsVisible()) HideUI(); else ShowUI();
}

bool PrismaUIBridge::IsVisible() const {
    if (!m_ready || !m_api) return false;
    return !m_api->IsHidden(m_view);
}

bool PrismaUIBridge::IsAnyPrismaViewFocused() const {
    if (!m_ready || !m_api) return false;
    return m_api->HasAnyActiveFocus();
}

void PrismaUIBridge::SendState(const std::string& json) {
    // Pass JSON as a JS string literal via base64 would be safer, but PEM
    // precedent just passes JSON directly as an object. We wrap in a try/parse.
    // Escape quotes + backslashes + newlines for safe JS literal.
    std::string esc;
    esc.reserve(json.size() + 16);
    for (char c : json) {
        switch (c) {
            case '\\': esc += "\\\\"; break;
            case '\'': esc += "\\'"; break;
            case '\n': esc += "\\n"; break;
            case '\r': esc += "\\r"; break;
            case '\t': esc += "\\t"; break;
            default:   esc += c; break;
        }
    }
    InvokeJS(std::format("HKP.loadState('{}')", esc));
}
