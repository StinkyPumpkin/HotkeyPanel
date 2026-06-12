#include "PrismaUIBridge.h"
#include "JsonStore.h"
#include "InputHandler.h"
#include <format>

static PrismaUIBridge* g_bridge = nullptr;

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
    // Let PrismaUI manage its OWN focus menu shell (disableFocusMenu=false).
    // PrismaUI's internal menu handles pause + cursor + input capture in a way
    // the engine fully understands — Esc doesn't leak to the vanilla pause
    // menu, and mouse-look re-engages cleanly on unfocus. Same pattern as
    // FollowerUI/WhoreHorde.
    //
    // We used to push our own BlockerMenu here and pass disableFocusMenu=true,
    // but that left two engine-state bugs: (1) Esc opened the vanilla pause
    // menu on top of ours; (2) mouse-pan stopped working after close until
    // another mod reset the camera. Both vanished once PrismaUI took over
    // the menu-shell duties.
    //
    // InputHandler still returns kStop while m_view is visible — that blocks
    // other mods' RegisterForKey handlers and prevents game keybinds from
    // firing while the panel is open.
    m_api->Show(m_view);
    m_api->Focus(m_view, m_pauseOnShow);

    InvokeJS("HKP.show()");
    SKSE::log::info("PrismaUIBridge: UI shown (pause={})", m_pauseOnShow);
}

void PrismaUIBridge::HideUI() {
    if (!m_ready || !m_api || !IsVisible()) return;
    InvokeJS("HKP.hide()");
    m_api->Unfocus(m_view);
    m_api->Hide(m_view);
    // No BlockerMenu::Close() — we no longer open it. PrismaUI's Unfocus
    // tears down its own internal menu shell, which restores mouse-look and
    // gameplay controls cleanly.

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
