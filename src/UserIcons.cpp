#include "UserIcons.h"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <fstream>
#include <map>
#include <mutex>
#include <sstream>
#include <system_error>
#include <vector>

#include <Windows.h>
#include <wincodec.h>
#include <wrl/client.h>
#pragma comment(lib, "windowscodecs.lib")
#pragma comment(lib, "ole32.lib")

namespace fs = std::filesystem;

namespace
{
    // --Claude 2026-11-20: a picture bigger than 256 px on a side is sent
    // shrunk to 256 (same shape, PNG), so a 1024 px picture costs the panel a sixteenth. The file itself is never
    // changed. Windows' own picture codecs (WIC) do it; SVG (drawn, any size is sharp) goes as it is.
    constexpr UINT kSide = 256;
    constexpr std::uintmax_t kMaxSource = 16u * 1024 * 1024;   // a bigger file is skipped
    constexpr std::uintmax_t kMaxFile = 2u * 1024 * 1024;      // sent as it is (not shrunk): at most this big
    constexpr std::size_t kMaxFiles = 400;
    constexpr std::uintmax_t kMaxTotal = 24u * 1024 * 1024;   // all pictures together, in game
    constexpr int kMaxDepth = 3;

    std::string Lower(std::string s)
    {
        std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
        return s;
    }

    const char* MimeOf(const fs::path& a_path)
    {
        const std::string e = Lower(a_path.extension().string());
        if (e == ".png") return "image/png";
        if (e == ".jpg" || e == ".jpeg") return "image/jpeg";
        if (e == ".svg") return "image/svg+xml";
        if (e == ".webp") return "image/webp";
        if (e == ".gif") return "image/gif";
        return nullptr;
    }

    std::string Utf8(const fs::path& a_path)
    {
        const auto u = a_path.generic_u8string();
        return std::string(reinterpret_cast<const char*>(u.data()), u.size());
    }

    fs::path FromUtf8(const std::string& a_s)
    {
        return fs::path(std::u8string(reinterpret_cast<const char8_t*>(a_s.data()), a_s.size()));
    }

    std::string JsonStr(const std::string& a_s)
    {
        std::string q = "\"";
        for (const unsigned char c : a_s) {
            if (c == '"' || c == '\\') { q += '\\'; q += static_cast<char>(c); }
            else if (c < 0x20) { char buf[8]; std::snprintf(buf, sizeof(buf), "\\u%04x", c); q += buf; }
            else q += static_cast<char>(c);
        }
        return q + "\"";
    }

    std::string Base64(const std::string& a_in)
    {
        static const char* k = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        std::string out;
        out.reserve((a_in.size() + 2) / 3 * 4);
        std::size_t i = 0;
        for (; i + 2 < a_in.size(); i += 3) {
            const unsigned n = (static_cast<unsigned char>(a_in[i]) << 16) | (static_cast<unsigned char>(a_in[i + 1]) << 8) |
                               static_cast<unsigned char>(a_in[i + 2]);
            out += k[(n >> 18) & 63]; out += k[(n >> 12) & 63]; out += k[(n >> 6) & 63]; out += k[n & 63];
        }
        if (i < a_in.size()) {
            unsigned n = static_cast<unsigned char>(a_in[i]) << 16;
            if (i + 1 < a_in.size()) n |= static_cast<unsigned char>(a_in[i + 1]) << 8;
            out += k[(n >> 18) & 63]; out += k[(n >> 12) & 63];
            out += i + 1 < a_in.size() ? k[(n >> 6) & 63] : '=';
            out += '=';
        }
        return out;
    }

    // a URL path: letters, digits and - _ . ~ / stay, everything else (spaces, UTF-8) is %XX
    std::string UrlPath(const std::string& a_rel)
    {
        static const char* hex = "0123456789ABCDEF";
        std::string out;
        for (const unsigned char c : a_rel) {
            if (std::isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~' || c == '/') out += static_cast<char>(c);
            else { out += '%'; out += hex[c >> 4]; out += hex[c & 15]; }
        }
        return out;
    }

    bool ReadAll(const fs::path& a_path, std::string& a_out)
    {
        std::ifstream f(a_path, std::ios::binary);
        if (!f) return false;
        std::ostringstream ss;
        ss << f.rdbuf();
        a_out = ss.str();
        return true;
    }

    enum class Shrunk { kDone, kFits, kFailed };

    // The picture at most kSide x kSide (same shape), as PNG bytes. kFits = already small enough, kFailed = Windows
    // has no codec for it (SVG, a WEBP without the codec) or the file is broken.
    Shrunk ShrinkPicture(const fs::path& a_path, std::string& a_png)
    {
        using Microsoft::WRL::ComPtr;
        const HRESULT co = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
        struct CoGuard { bool on; ~CoGuard() { if (on) CoUninitialize(); } } guard{ SUCCEEDED(co) };
        ComPtr<IWICImagingFactory> f;
        if (FAILED(CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&f)))) return Shrunk::kFailed;
        ComPtr<IWICBitmapDecoder> dec;
        if (FAILED(f->CreateDecoderFromFilename(a_path.c_str(), nullptr, GENERIC_READ, WICDecodeMetadataCacheOnDemand, &dec)))
            return Shrunk::kFailed;
        ComPtr<IWICBitmapFrameDecode> frame;
        UINT w = 0, h = 0;
        if (FAILED(dec->GetFrame(0, &frame)) || FAILED(frame->GetSize(&w, &h)) || !w || !h) return Shrunk::kFailed;
        if (w <= kSide && h <= kSide) return Shrunk::kFits;
        const UINT nw = w >= h ? kSide : std::max<UINT>(1, static_cast<UINT>(static_cast<unsigned long long>(w) * kSide / h));
        const UINT nh = h >= w ? kSide : std::max<UINT>(1, static_cast<UINT>(static_cast<unsigned long long>(h) * kSide / w));
        ComPtr<IWICFormatConverter> conv;
        ComPtr<IWICBitmapScaler> scaler;
        if (FAILED(f->CreateFormatConverter(&conv)) ||
            FAILED(conv->Initialize(frame.Get(), GUID_WICPixelFormat32bppPBGRA, WICBitmapDitherTypeNone, nullptr, 0, WICBitmapPaletteTypeCustom)) ||
            FAILED(f->CreateBitmapScaler(&scaler)) ||
            FAILED(scaler->Initialize(conv.Get(), nw, nh, WICBitmapInterpolationModeHighQualityCubic)))
            return Shrunk::kFailed;
        ComPtr<IWICFormatConverter> out;   // back to straight alpha for the PNG
        if (FAILED(f->CreateFormatConverter(&out)) ||
            FAILED(out->Initialize(scaler.Get(), GUID_WICPixelFormat32bppBGRA, WICBitmapDitherTypeNone, nullptr, 0, WICBitmapPaletteTypeCustom)))
            return Shrunk::kFailed;
        ComPtr<IStream> stream;
        ComPtr<IWICBitmapEncoder> enc;
        ComPtr<IWICBitmapFrameEncode> fe;
        ComPtr<IPropertyBag2> props;
        WICPixelFormatGUID pf = GUID_WICPixelFormat32bppBGRA;
        if (FAILED(CreateStreamOnHGlobal(nullptr, TRUE, &stream)) ||
            FAILED(f->CreateEncoder(GUID_ContainerFormatPng, nullptr, &enc)) ||
            FAILED(enc->Initialize(stream.Get(), WICBitmapEncoderNoCache)) ||
            FAILED(enc->CreateNewFrame(&fe, &props)) || FAILED(fe->Initialize(props.Get())) ||
            FAILED(fe->SetSize(nw, nh)) || FAILED(fe->SetPixelFormat(&pf)) ||
            FAILED(fe->WriteSource(out.Get(), nullptr)) || FAILED(fe->Commit()) || FAILED(enc->Commit()))
            return Shrunk::kFailed;
        HGLOBAL mem = nullptr;
        if (FAILED(GetHGlobalFromStream(stream.Get(), &mem)) || !mem) return Shrunk::kFailed;
        STATSTG st{};
        if (FAILED(stream->Stat(&st, STATFLAG_NONAME))) return Shrunk::kFailed;
        const auto* p = static_cast<const char*>(GlobalLock(mem));
        if (!p) return Shrunk::kFailed;
        a_png.assign(p, static_cast<std::size_t>(st.cbSize.QuadPart));
        GlobalUnlock(mem);
        return Shrunk::kDone;
    }

    struct Item
    {
        std::string rel;      // "Combat/sword.png"
        fs::path    path;
        std::uintmax_t size;
        long long   time;
    };

    // What gets sent for a picture (shrunk when big), kept until the file changes: the tablet asks for each picture
    // again on every page load, and the game rebuilds its list when anything in the folder changes.
    struct Loaded { std::uintmax_t size; long long time; std::string data; std::string mime; };
    std::mutex g_cacheMx;
    std::map<std::string, Loaded> g_cache;

    bool Load(const Item& a_item, std::string& a_data, std::string& a_mime)
    {
        {
            std::lock_guard lk(g_cacheMx);
            const auto it = g_cache.find(a_item.rel);
            if (it != g_cache.end() && it->second.size == a_item.size && it->second.time == a_item.time) {
                a_data = it->second.data;
                a_mime = it->second.mime;
                return true;
            }
        }
        const char* mime = MimeOf(a_item.path);
        if (!mime) return false;
        std::string data;
        const Shrunk s = std::string_view(mime) == "image/svg+xml" ? Shrunk::kFailed : ShrinkPicture(a_item.path, data);
        if (s == Shrunk::kDone) {
            mime = "image/png";
        } else {
            if (a_item.size > kMaxFile) {
                SKSE::log::warn("UserIcons: {} skipped - over 2 MB and Windows could not shrink it", a_item.rel);
                return false;
            }
            if (!ReadAll(a_item.path, data)) return false;
        }
        a_data = data;
        a_mime = mime;
        std::lock_guard lk(g_cacheMx);
        g_cache[a_item.rel] = { a_item.size, a_item.time, std::move(data), mime };
        return true;
    }

    std::vector<Item> List()
    {
        std::vector<Item> out;
        std::error_code ec;
        const fs::path dir = UserIcons::Dir();
        if (!fs::is_directory(dir, ec)) return out;
        fs::recursive_directory_iterator it(dir, fs::directory_options::skip_permission_denied, ec), end;
        for (; !ec && it != end; it.increment(ec)) {
            if (it.depth() >= kMaxDepth) it.disable_recursion_pending();
            std::error_code e2;
            if (!it->is_regular_file(e2) || !MimeOf(it->path())) continue;
            const auto size = it->file_size(e2);
            if (e2) continue;
            if (size == 0 || size > kMaxSource) {
                if (size > kMaxSource) SKSE::log::warn("UserIcons: {} skipped - bigger than 16 MB", Utf8(it->path().filename()));
                continue;
            }
            const auto rel = it->path().lexically_relative(dir);   // no disk lookups (MO2's VFS)
            if (rel.empty()) continue;
            const auto t = it->last_write_time(e2);
            out.push_back({ Utf8(rel), it->path(), size, e2 ? 0LL : static_cast<long long>(t.time_since_epoch().count()) });
            if (out.size() >= kMaxFiles) {
                SKSE::log::warn("UserIcons: more than {} pictures - the rest are left out", kMaxFiles);
                break;
            }
        }
        std::sort(out.begin(), out.end(), [](const Item& a, const Item& b) { return Lower(a.rel) < Lower(b.rel); });
        return out;
    }
}

fs::path UserIcons::Dir()
{
    // Skyrim runs with CWD = game root; under MO2 the VFS shows every mod's files in Data/.
    // a folder named Icons at the top of a mod, so it is easy to find
    return fs::current_path() / "Data" / "Icons";
}

std::string UserIcons::Signature()
{
    std::string sig;
    for (const auto& i : List()) sig += i.rel + '|' + std::to_string(i.size) + '|' + std::to_string(i.time) + '\n';
    return sig;
}

std::string UserIcons::BuildJson(bool a_dataUrls, int* a_count, std::size_t* a_bytes)
{
    std::string json = "[";
    int n = 0;
    std::uintmax_t total = 0;
    for (const auto& i : List()) {
        std::string url;
        if (a_dataUrls) {
            std::string data, mime;
            if (!Load(i, data, mime)) continue;
            if (total + data.size() > kMaxTotal) {
                SKSE::log::warn("UserIcons: over 24 MB of pictures - {} and the rest are left out", i.rel);
                break;
            }
            total += data.size();
            url = "data:" + mime + ";base64," + Base64(data);
        } else {
            url = "usericons/" + UrlPath(i.rel);
        }
        const auto slash = i.rel.rfind('/');
        const std::string group = slash == std::string::npos ? "Your icons" : i.rel.substr(0, slash);
        const std::string name = Utf8(FromUtf8(i.rel).stem());
        if (n++) json += ',';
        json += "{\"id\":" + JsonStr("u:" + i.rel) + ",\"name\":" + JsonStr(name) + ",\"group\":" + JsonStr(group) +
                ",\"url\":" + JsonStr(url) + "}";
    }
    json += "]";
    if (a_count) *a_count = n;
    if (a_bytes) *a_bytes = json.size();
    return json;
}

bool UserIcons::Read(const std::string& a_rel, std::string& a_data, std::string& a_mime)
{
    if (a_rel.empty() || a_rel.size() > 512 || a_rel.front() == '/' || a_rel.find('\\') != std::string::npos ||
        a_rel.find(':') != std::string::npos)
        return false;
    for (std::size_t p = 0; p <= a_rel.size();) {   // no ".." part anywhere
        const auto q = std::min(a_rel.find('/', p), a_rel.size());
        if (a_rel.compare(p, q - p, "..") == 0 || q == p) return false;
        p = q + 1;
    }
    const fs::path path = Dir() / FromUtf8(a_rel);
    std::error_code ec;
    if (!MimeOf(path) || !fs::is_regular_file(path, ec)) return false;
    const auto size = fs::file_size(path, ec);
    if (ec || size == 0 || size > kMaxSource) return false;
    const auto t = fs::last_write_time(path, ec);
    const Item item{ a_rel, path, size, ec ? 0LL : static_cast<long long>(t.time_since_epoch().count()) };
    return Load(item, a_data, a_mime);   // shrunk like the game's copy
}
