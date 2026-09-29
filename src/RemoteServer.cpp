// Built WITHOUT the CommonLib PCH (see CMakeLists.txt): httplib must include winsock2.h
// before anything else includes windows.h. See RemoteServer.h for the big picture.
#include "RemoteServer.h"

// CommonLib builds everything for Windows 7 (_WIN32_WINNT=0x0601) and httplib refuses anything
// below Windows 10. Skyrim AE needs Windows 10 anyway; only this file sees the change.
#undef _WIN32_WINNT
#define _WIN32_WINNT 0x0A00
#undef WINVER
#define WINVER 0x0A00

// httplib caps a form-encoded body at 8 KB and a saved panel is bigger; a client that sends it
// without a text/plain content type (curl does) would get 413.
#define CPPHTTPLIB_FORM_URL_ENCODED_PAYLOAD_MAX_LENGTH (4 * 1024 * 1024)

#include <httplib.h>
#include <spdlog/spdlog.h>

#include <algorithm>
#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <mutex>
#include <sstream>
#include <thread>
#include <vector>

namespace fs = std::filesystem;

namespace {

    constexpr int kDefaultPort = 8950;
    constexpr int kPollSeconds = 15;   // a tablet's state request waits this long for a change

    RemoteServer::Hooks g_hooks;

    // ---- the panel state tablets see ----------------------------------------------------
    // g_state is hotkeys.json as last saved by either side; g_version bumps on every change and
    // g_origin says who made it ("game", or the id a tablet page picked for itself), so a
    // tablet can tell its own save coming back from a change made somewhere else.
    std::mutex              g_stateMx;
    std::condition_variable g_stateCv;
    std::string             g_state;
    std::string             g_origin   = "game";
    long long               g_version  = 0;
    std::string             g_gameKeys = "[]";
    bool                    g_stopping = false;   // wakes waiting requests so a stop never hangs

    // ---- server lifecycle ------------------------------------------------------------------
    // Configure only records what is wanted; Apply (on its own thread, under g_lifeMx) makes it
    // so. Two quick Configure calls can run their Apply threads in either order and both end
    // on the latest wish.
    std::mutex       g_wantMx;
    bool             g_wantOn   = false;
    int              g_wantPort = kDefaultPort;

    std::mutex       g_lifeMx;
    // Both heap objects on purpose and never freed at game exit: a still-joinable std::thread
    // destroyed by the exit-time static destructors calls std::terminate (a crash on quit).
    httplib::Server* g_server = nullptr;
    std::thread*     g_listenThread = nullptr;
    int              g_port = 0;

    // Only the home network may drive the game. 127/8 is allowed so the page can be tried on
    // the PC itself; 169.254/16 covers two devices wired together without a router.
    bool IsLanAddress(const std::string& a_addr) {
        std::string addr = a_addr;
        if (addr.rfind("::ffff:", 0) == 0) addr = addr.substr(7);
        in_addr in{};
        if (inet_pton(AF_INET, addr.c_str(), &in) != 1) return false;
        const auto* b = reinterpret_cast<const unsigned char*>(&in);
        return b[0] == 10 || b[0] == 127 ||
               (b[0] == 172 && b[1] >= 16 && b[1] <= 31) ||
               (b[0] == 192 && b[1] == 168) ||
               (b[0] == 169 && b[1] == 254);
    }

    // The addresses a tablet can reach this PC on, for the Settings row.
    std::vector<std::string> LanAddresses() {
        std::vector<std::string> out;
        char host[256] = {};
        if (gethostname(host, sizeof(host)) != 0) return out;
        addrinfo hints{};
        hints.ai_family = AF_INET;
        hints.ai_socktype = SOCK_STREAM;
        addrinfo* res = nullptr;
        if (getaddrinfo(host, nullptr, &hints, &res) != 0) return out;
        for (auto* p = res; p; p = p->ai_next) {
            char buf[INET_ADDRSTRLEN] = {};
            const auto* sin = reinterpret_cast<const sockaddr_in*>(p->ai_addr);
            if (!inet_ntop(AF_INET, &sin->sin_addr, buf, sizeof(buf))) continue;
            const std::string ip = buf;
            if (ip.rfind("127.", 0) == 0 || !IsLanAddress(ip)) continue;
            if (std::find(out.begin(), out.end(), ip) == out.end()) out.push_back(ip);
        }
        freeaddrinfo(res);
        return out;
    }

    std::string JsonString(const std::string& a_s) {
        std::string q = "\"";
        for (const unsigned char c : a_s) {
            if (c == '"' || c == '\\') { q += '\\'; q += static_cast<char>(c); }
            else if (c < 0x20) { char buf[8]; std::snprintf(buf, sizeof(buf), "\\u%04x", c); q += buf; }
            else q += static_cast<char>(c);
        }
        return q + "\"";
    }

    std::string StatusOff(int a_port, const std::string& a_error = {}) {
        std::string s = "{\"running\":false,\"port\":" + std::to_string(a_port);
        if (!a_error.empty()) s += ",\"error\":" + JsonString(a_error);
        return s + "}";
    }

    std::string StatusRunning(int a_port) {
        std::string urls;
        for (const auto& ip : LanAddresses()) {
            if (!urls.empty()) urls += ",";
            urls += JsonString("http://" + ip + ":" + std::to_string(a_port));
        }
        return "{\"running\":true,\"port\":" + std::to_string(a_port) + ",\"urls\":[" + urls + "]}";
    }

    // Caller holds g_stateMx.
    std::string EnvelopeLocked() {
        return "{\"v\":" + std::to_string(g_version) +
               ",\"origin\":" + JsonString(g_origin) +
               ",\"state\":" + (g_state.empty() ? std::string("null") : g_state) + "}";
    }

    // A tablet names itself with a random id; keep it to something harmless.
    std::string CleanOrigin(const std::string& a_s) {
        std::string out;
        for (const char c : a_s) {
            if (out.size() >= 24) break;
            if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) out += c;
        }
        return out.empty() ? std::string("remote") : out;
    }

    // "KeyB|long:ControlLeft+ShiftLeft" - key ids and layer ids only ever use these.
    bool IsKeyPayload(const std::string& a_s) {
        if (a_s.empty() || a_s.size() > 200) return false;
        for (const char c : a_s) {
            const bool ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
                            c == '_' || c == ':' || c == '+' || c == '|';
            if (!ok) return false;
        }
        return true;
    }

    // "source|dik": a source id carries mod and page names, so anything printable.
    bool IsMovePayload(const std::string& a_s) {
        if (a_s.empty() || a_s.size() > 512 || a_s.find('|') == std::string::npos) return false;
        for (const unsigned char c : a_s) {
            if (c < 0x20) return false;
        }
        return true;
    }

    fs::path ViewsDir() {
        // Skyrim runs with CWD = game root, and under MO2 the VFS resolves Data/ for us.
        return fs::current_path() / "Data" / "PrismaUI" / "views" / "HotkeyPanel";
    }

    bool ReadFile(const fs::path& a_path, std::string& a_out) {
        std::ifstream f(a_path, std::ios::binary);
        if (!f) return false;
        std::ostringstream ss;
        ss << f.rdbuf();
        a_out = ss.str();
        return true;
    }

    const char* MimeFor(const std::string& a_name) {
        const auto dot = a_name.rfind('.');
        const std::string ext = dot == std::string::npos ? "" : a_name.substr(dot + 1);
        if (ext == "css")  return "text/css; charset=utf-8";
        if (ext == "js")   return "application/javascript; charset=utf-8";
        if (ext == "png")  return "image/png";
        if (ext == "jpg" || ext == "jpeg") return "image/jpeg";
        if (ext == "svg")  return "image/svg+xml";
        if (ext == "json") return "application/json";
        if (ext == "html") return "text/html; charset=utf-8";
        return "application/octet-stream";
    }

    // index.html as the game uses it, plus what a touch screen needs and remote.js - which has
    // to run BEFORE hkp.js, so it goes in front of the first script tag.
    void ServeIndex(const httplib::Request&, httplib::Response& a_res) {
        std::string html;
        if (!ReadFile(ViewsDir() / "index.html", html)) {
            a_res.status = 500;
            a_res.set_content("Hotkey Panel: Data/PrismaUI/views/HotkeyPanel/index.html not found", "text/plain");
            return;
        }
        static const std::string kHead =
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover\">\n"
            "<meta name=\"mobile-web-app-capable\" content=\"yes\">\n"
            "<meta name=\"theme-color\" content=\"#0a0a0c\">\n"
            "<link rel=\"icon\" href=\"data:,\">\n"
            "<link rel=\"stylesheet\" href=\"remote/remote.css\">\n";
        if (const auto p = html.find("</head>"); p != std::string::npos) html.insert(p, kHead);
        if (const auto p = html.find("<script"); p != std::string::npos)
            html.insert(p, "<script src=\"remote/remote.js\"></script>\n");
        a_res.set_header("Cache-Control", "no-cache");
        a_res.set_content(html, "text/html; charset=utf-8");
    }

    void ServeViewFile(const httplib::Request& a_req, httplib::Response& a_res) {
        const std::string dir = a_req.matches[1].str();
        const std::string name = a_req.matches[2].str();
        std::string data;
        if (!ReadFile(ViewsDir() / dir / name, data)) {
            a_res.status = 404;
            return;
        }
        a_res.set_header("Cache-Control", "no-cache");
        a_res.set_content(data, MimeFor(name));
    }

    // GET /api/state?since=N - the state, as soon as it is newer than N (or 204 after a while).
    void GetState(const httplib::Request& a_req, httplib::Response& a_res) {
        long long since = -1;
        if (a_req.has_param("since")) since = std::atoll(a_req.get_param_value("since").c_str());
        std::unique_lock lk(g_stateMx);
        if (since == g_version) {
            g_stateCv.wait_for(lk, std::chrono::seconds(kPollSeconds),
                               [since] { return g_version != since || g_stopping; });
        }
        a_res.set_header("Cache-Control", "no-store");
        if (since == g_version) {
            a_res.status = 204;
            return;
        }
        a_res.set_content(EnvelopeLocked(), "application/json");
    }

    // POST /api/state?base=N&origin=ID - a tablet edited the panel. Refused (409, with the
    // current state) when the game changed it since that tablet last looked, so an old copy
    // can never overwrite something newer.
    void PostState(const httplib::Request& a_req, httplib::Response& a_res) {
        const std::string& body = a_req.body;
        if (body.empty() || body.front() != '{') {
            a_res.status = 400;
            return;
        }
        const long long base = a_req.has_param("base") ? std::atoll(a_req.get_param_value("base").c_str()) : -2;
        const std::string origin = CleanOrigin(a_req.get_param_value("origin"));
        long long v = 0;
        {
            std::lock_guard lk(g_stateMx);
            if (base != g_version) {
                a_res.status = 409;
                a_res.set_content(EnvelopeLocked(), "application/json");
                spdlog::info("Remote: {} saved an old copy (v{} < v{}) - sent it the current one",
                             a_req.remote_addr, base, g_version);
                return;
            }
            g_state = body;
            g_origin = origin;
            v = ++g_version;
        }
        g_stateCv.notify_all();
        spdlog::info("Remote: {} saved the panel ({} bytes, v{})", a_req.remote_addr, body.size(), v);
        if (g_hooks.saveState) g_hooks.saveState(body);
        a_res.set_content("{\"v\":" + std::to_string(v) + "}", "application/json");
    }

    void AddRoutes(httplib::Server& a_srv) {
        a_srv.set_payload_max_length(4 * 1024 * 1024);

        a_srv.set_pre_routing_handler([](const httplib::Request& a_req, httplib::Response& a_res) {
            if (IsLanAddress(a_req.remote_addr)) return httplib::Server::HandlerResponse::Unhandled;
            spdlog::warn("Remote: refused {} - not on the local network", a_req.remote_addr);
            a_res.status = 403;
            a_res.set_content("Hotkey Panel only answers devices on the local network.", "text/plain");
            return httplib::Server::HandlerResponse::Handled;
        });

        a_srv.Get("/", ServeIndex);
        a_srv.Get("/index.html", ServeIndex);
        // One folder deep, one plain file name: nothing outside the view folder is reachable.
        a_srv.Get(R"(/(css|js|img|remote)/([A-Za-z0-9_\-]+\.[A-Za-z0-9]+))", ServeViewFile);

        a_srv.Get("/api/state", GetState);
        a_srv.Post("/api/state", PostState);

        a_srv.Post("/api/press", [](const httplib::Request& a_req, httplib::Response& a_res) {
            if (!IsKeyPayload(a_req.body)) {
                a_res.status = 400;
                return;
            }
            spdlog::info("Remote: {} pressed '{}'", a_req.remote_addr, a_req.body);
            if (g_hooks.press) g_hooks.press(a_req.body);
            a_res.set_content("ok", "text/plain");
        });

        a_srv.Post("/api/move", [](const httplib::Request& a_req, httplib::Response& a_res) {
            if (!IsMovePayload(a_req.body)) {
                a_res.status = 400;
                return;
            }
            spdlog::info("Remote: {} moved '{}'", a_req.remote_addr, a_req.body);
            if (g_hooks.move) g_hooks.move(a_req.body);
            a_res.set_content("ok", "text/plain");
        });

        a_srv.Get("/api/gamekeys", [](const httplib::Request&, httplib::Response& a_res) {
            std::string keys;
            {
                std::lock_guard lk(g_stateMx);
                keys = g_gameKeys;
            }
            a_res.set_header("Cache-Control", "no-store");
            a_res.set_content(keys, "application/json");
        });
    }

    // Caller holds g_lifeMx.
    void StopLocked() {
        if (!g_server) return;
        {
            std::lock_guard lk(g_stateMx);
            g_stopping = true;
        }
        g_stateCv.notify_all();
        g_server->stop();
        if (g_listenThread) {
            g_listenThread->join();
            delete g_listenThread;
            g_listenThread = nullptr;
        }
        delete g_server;
        g_server = nullptr;
        {
            std::lock_guard lk(g_stateMx);
            g_stopping = false;
        }
        spdlog::info("Remote: stopped (port {})", g_port);
    }

    // Caller holds g_lifeMx. Returns the status JSON.
    std::string StartLocked(int a_port) {
        auto* srv = new httplib::Server();
        AddRoutes(*srv);
        if (!srv->bind_to_port("0.0.0.0", a_port)) {
            delete srv;
            spdlog::warn("Remote: cannot listen on port {} - in use by another program?", a_port);
            return StatusOff(a_port, "Port " + std::to_string(a_port) + " is in use - pick another");
        }
        g_server = srv;
        g_port = a_port;
        g_listenThread = new std::thread([srv]() { srv->listen_after_bind(); });
        const std::string status = StatusRunning(a_port);
        spdlog::info("Remote: listening on port {} {}", a_port, status);
        return status;
    }

    void Apply() {
        std::lock_guard life(g_lifeMx);
        bool on;
        int  port;
        {
            std::lock_guard lk(g_wantMx);
            on = g_wantOn;
            port = g_wantPort;
        }
        if (g_server && (!on || port != g_port)) StopLocked();

        std::string status;
        if (!on)            status = StatusOff(port);
        else if (!g_server) status = StartLocked(port);
        else                status = StatusRunning(port);   // already up - addresses may have changed

        if (g_hooks.status) g_hooks.status(status);
    }

}  // namespace

void RemoteServer::SetHooks(Hooks a_hooks) {
    g_hooks = std::move(a_hooks);
}

void RemoteServer::Configure(bool a_enabled, int a_port) {
    if (a_port < 1024 || a_port > 65535) a_port = kDefaultPort;
    {
        std::lock_guard lk(g_wantMx);
        g_wantOn = a_enabled;
        g_wantPort = a_port;
    }
    std::thread(Apply).detach();
}

void RemoteServer::PublishState(const std::string& a_json) {
    {
        std::lock_guard lk(g_stateMx);
        if (a_json == g_state) return;
        g_state = a_json;
        g_origin = "game";
        ++g_version;
    }
    g_stateCv.notify_all();
}

void RemoteServer::SetGameKeys(const std::string& a_json) {
    std::lock_guard lk(g_stateMx);
    g_gameKeys = a_json.empty() ? std::string("[]") : a_json;
}
