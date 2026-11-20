#include "UIHost.h"

#include "MagelightUI_API.h"
#include "PrismaUI_API.h"

// --Claude 2026-11-20: the panel's web UI host layer (our own code).
namespace
{
    namespace ML = MAGELIGHT_API;

    const ML::MagelightApi4* g_ml = nullptr;
    ML::ModId g_mod = 0;
    PRISMA_UI_API::IVPrismaUI1* g_pr = nullptr;   // also kept beside Magelight: AnyFocus covers other mods' PrismaUI pages
    PRISMA_UI_API::IVPrismaUI2* g_pr2 = nullptr;
    bool g_magelight = false;
    std::string g_name = "none";

    struct ViewInfo {
        UIHost::ReadyFn ready = nullptr;
        UIHost::ExitFn exit = nullptr;
    };
    std::mutex g_mx;
    std::map<UIHost::ViewId, ViewInfo> g_views;
    UIHost::ViewId g_focused = 0;
    std::atomic<bool> g_releasing{ false };   // our own ReleaseUIMode is running: its UIModeExited is expected

    constexpr std::uint32_t kMinHost = 10500;   // 1.5.0: KeyboardEvent.code as in a browser

    void OnEvent(const ML::EventData* ev, void*)   // game thread (ModDesc.callbackThread = GameThread)
    {
        if (!ev) return;
        switch (ev->type) {
        case ML::Event::ViewDomReady:
        case ML::Event::ViewReloaded: {
            UIHost::ReadyFn fn = nullptr;
            {
                std::lock_guard lock(g_mx);
                auto it = g_views.find(ev->view);
                if (it != g_views.end()) fn = it->second.ready;
            }
            SKSE::log::info("UIHost: view {} {}", ev->view, ev->type == ML::Event::ViewDomReady ? "DOM ready" : "reloaded");
            if (fn) fn(ev->view);
            break;
        }
        case ML::Event::ViewLoadFailed:
            SKSE::log::error("UIHost: view {} failed to load: {}", ev->view, ev->detail ? ev->detail : "");
            break;
        case ML::Event::ConsoleMessage: {
            const char* m = ev->detail ? ev->detail : "";
            if (ev->x >= 2) SKSE::log::error("[JS] {}", m);
            else if (ev->x == 1) SKSE::log::warn("[JS] {}", m);
            else SKSE::log::info("[JS] {}", m);
            break;
        }
        case ML::Event::UIModeExited: {
            const bool ours = g_releasing.exchange(false);
            UIHost::ExitFn fn = nullptr;
            {
                std::lock_guard lock(g_mx);
                auto it = g_views.find(g_focused ? g_focused : ev->view);
                if (it != g_views.end()) fn = it->second.exit;
                g_focused = 0;
            }
            SKSE::log::info("UIHost: UI mode ended{}", ours ? " (our Unfocus)" : " by Magelight");
            if (!ours && fn) fn();
            break;
        }
        case ML::Event::UIModeRefused:
            SKSE::log::warn("UIHost: UI mode refused: {}", ev->detail ? ev->detail : "");
            break;
        case ML::Event::FocusDenied:
            SKSE::log::info("UIHost: another mod ({}) asked for UI mode while we hold it", ev->detail ? ev->detail : "");
            break;
        case ML::Event::RenderDead:
            SKSE::log::error("UIHost: Magelight's renderer stopped for this session: {}", ev->detail ? ev->detail : "");
            break;
        default:
            break;
        }
    }

    void OnLog(int level, const char* msg, void*)
    {
        if (level >= 2) SKSE::log::error("[Magelight] {}", msg ? msg : "");
        else if (level == 1) SKSE::log::warn("[Magelight] {}", msg ? msg : "");
    }

    void RunBoxed(void* user)
    {
        std::unique_ptr<std::function<void()>> fn(static_cast<std::function<void()>*>(user));
        if (fn && *fn) (*fn)();
    }

    void OnPrismaConsole(PrismaView, PRISMA_UI_API::ConsoleMessageLevel level, const char* msg)
    {
        using L = PRISMA_UI_API::ConsoleMessageLevel;
        switch (level) {
        case L::Error:   SKSE::log::error("[JS] {}", msg ? msg : ""); break;
        case L::Warning: SKSE::log::warn("[JS] {}", msg ? msg : ""); break;
        default:         SKSE::log::info("[JS] {}", msg ? msg : ""); break;
        }
    }

    std::string Version(std::uint32_t v) { return fmt::format("{}.{}.{}", v / 10000, (v / 100) % 100, v % 100); }
}

namespace UIHost
{
    bool Init()
    {
        g_pr2 = PRISMA_UI_API::RequestPluginAPI<PRISMA_UI_API::IVPrismaUI2>();
        g_pr = g_pr2 ? g_pr2 : PRISMA_UI_API::RequestPluginAPI<PRISMA_UI_API::IVPrismaUI1>();

        const bool forcePrisma = std::filesystem::exists("Data/SKSE/Plugins/HotkeyPanel_PrismaUI.txt");
        if (!forcePrisma) g_ml = ML::RequestApi4();
        if (g_ml) {
            ML::ModDesc d{};
            d.size = sizeof(d);
            d.modId = "HotkeyPanel";
            d.displayName = "Hotkey Panel";
            d.modVersion = 2;
            d.minHostVersion = kMinHost;
            d.callbackThread = ML::CallbackThread::GameThread;
            d.onEvent = OnEvent;
            d.onLog = OnLog;
            const auto r = g_ml->RegisterMod(&d, &g_mod);
            if (r == ML::Result::Ok) {
                g_magelight = true;
                g_name = "Magelight UI " + Version(g_ml->hostVersionNumber);
            } else {
                SKSE::log::warn("UIHost: Magelight UI {} refused the registration ({}) - trying PrismaUI", Version(g_ml->hostVersionNumber),
                                static_cast<int>(r));
                g_ml = nullptr;
            }
        }
        if (!g_magelight && g_pr) g_name = g_pr2 ? "PrismaUI (v2 API)" : "PrismaUI (v1 API)";
        SKSE::log::info("UIHost: {}{}{}", g_name, forcePrisma ? " (forced by HotkeyPanel_PrismaUI.txt)" : "",
                        g_magelight && g_pr ? " - PrismaUI is installed too (its pages count for AnyFocus)" : "");
        return Ready();
    }

    bool Ready() { return g_magelight || g_pr; }
    PRISMA_UI_API::IVPrismaUI2* PrismaApi() { return g_magelight ? nullptr : g_pr2; }
    bool IsMagelight() { return g_magelight; }
    const char* Name() { return g_name.c_str(); }

    std::filesystem::path PageRoot()
    {
        return g_magelight ? std::filesystem::path("Data/Magelight/HotkeyPanel/views") : std::filesystem::path("Data/PrismaUI/views/HotkeyPanel");
    }

    ViewId Create(const char* name, const char* page, ReadyFn onReady, ExitFn onExit, bool captureEscape)
    {
        if (g_magelight) {
            const auto path = (std::filesystem::current_path() / PageRoot() / page).string();
            ML::ViewDesc d{};
            d.size = sizeof(d);
            d.name = name;
            d.htmlPath = path.c_str();
            d.anchor = ML::Anchor::TopLeft;
            d.fullscreen = true;
            d.clickThrough = false;
            d.startVisible = false;
            d.layer = ML::Layer::Panel;
            d.uiScale = 0.0f;
            ML::ViewId v = 0;
            const auto r = g_ml->CreateViewEx(g_mod, &d, &v);
            if (r != ML::Result::Ok || !v) {
                SKSE::log::error("UIHost: Magelight refused the view {} ({}): {}", name, static_cast<int>(r), path);
                return 0;
            }
            {
                std::lock_guard lock(g_mx);
                g_views[v] = { onReady, onExit };
            }
            if (captureEscape && g_ml->hostVersionNumber >= 2800 && g_ml->SetEscapeCapture) g_ml->SetEscapeCapture(v, true);
            SKSE::log::info("UIHost: Magelight view {} '{}' -> {}", v, name, path);
            return v;
        }
        if (g_pr) {
            const std::string rel = std::string("HotkeyPanel/") + page;   // relative to Data/PrismaUI/views/
            const PrismaView v = g_pr->CreateView(rel.c_str(), onReady);
            if (v) {
                g_pr->Hide(v);
                if (g_pr2) g_pr2->RegisterConsoleCallback(v, OnPrismaConsole);
                std::lock_guard lock(g_mx);
                g_views[v] = { onReady, onExit };
            }
            SKSE::log::info("UIHost: PrismaUI view {} '{}' -> {}", v, name, rel);
            return v;
        }
        return 0;
    }

    void Destroy(ViewId view)
    {
        if (!view) return;
        if (g_magelight) { if (g_ml->DestroyView) g_ml->DestroyView(view); }
        else if (g_pr) g_pr->Destroy(view);
        std::lock_guard lock(g_mx);
        g_views.erase(view);
    }

    void Listen(ViewId view, const char* name, Listener cb)
    {
        if (!view) return;
        if (g_magelight) g_ml->RegisterJSListener(view, name, cb);
        else if (g_pr) g_pr->RegisterJSListener(view, name, cb);
    }

    void Show(ViewId view, bool show)
    {
        if (!view) return;
        if (g_magelight) g_ml->ShowView(view, show);
        else if (g_pr) show ? g_pr->Show(view) : g_pr->Hide(view);
    }

    void Focus(ViewId view)
    {
        if (!view) return;
        if (g_magelight) {
            {
                std::lock_guard lock(g_mx);
                g_focused = view;
            }
            const std::uint32_t flags = g_ml->hostVersionNumber >= 10800 ? ML::kUIModeFlagPassPolledKeys : ML::kUIModeFlagNone;
            const auto r = g_ml->RequestUIMode(view, flags);
            if (r != ML::Result::Ok) SKSE::log::warn("UIHost: RequestUIMode({}) = {}", view, static_cast<int>(r));
        } else if (g_pr) {
            g_pr->Focus(view, false, false);
        }
    }

    void Unfocus(ViewId view)
    {
        if (!view) return;
        if (g_magelight) {
            if (!g_ml->IsUIModeActive()) return;
            g_releasing = true;
            if (g_ml->ReleaseUIMode(g_mod) != ML::Result::Ok) g_releasing = false;   // not ours (or already gone)
        } else if (g_pr) {
            g_pr->Unfocus(view);
        }
    }

    void Call(ViewId view, const char* script)
    {
        if (!view || !script) return;
        if (g_magelight) g_ml->InvokeJS(view, script);
        else if (g_pr) g_pr->Invoke(view, script);
    }

    bool AnyFocus()
    {
        return (g_magelight && g_ml->IsUIModeActive()) || (g_pr && g_pr->HasAnyActiveFocus());
    }

    void Game(std::function<void()> fn)
    {
        if (!g_magelight) { fn(); return; }
        if (g_ml->hostVersionNumber >= 3001 && g_ml->PostGameTask) {
            auto* box = new std::function<void()>(std::move(fn));
            if (g_ml->PostGameTask(RunBoxed, box) != ML::Result::Ok) {
                SKSE::log::warn("UIHost: PostGameTask refused a task");
                delete box;
            }
            return;
        }
        SKSE::GetTaskInterface()->AddTask(std::move(fn));
    }
}
