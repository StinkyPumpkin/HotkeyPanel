#include "HotkeyScan.h"

#include <algorithm>
#include <atomic>
#include <cctype>
#include <charconv>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <map>
#include <optional>
#include <set>
#include <string>
#include <string_view>
#include <thread>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace fs = std::filesystem;

namespace HotkeyScan
{
    namespace
    {
        constexpr std::uintmax_t kMaxFileSize = 1024 * 1024;
        std::atomic<bool>        g_running{ false };

        // ------------------------------------------------------------------ text helpers

        std::string Lower(std::string_view s)
        {
            std::string r(s);
            for (auto& c : r) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
            return r;
        }

        std::string Trim(std::string_view s)
        {
            std::size_t b = 0, e = s.size();
            while (b < e && std::isspace(static_cast<unsigned char>(s[b]))) ++b;
            while (e > b && std::isspace(static_cast<unsigned char>(s[e - 1]))) --e;
            return std::string(s.substr(b, e - b));
        }

        bool Has(std::string_view hay, std::string_view needle) { return hay.find(needle) != std::string_view::npos; }

        bool IsAlnum(char c) { return std::isalnum(static_cast<unsigned char>(c)) != 0; }
        bool IsUpper(char c) { return std::isupper(static_cast<unsigned char>(c)) != 0; }
        bool IsLowerC(char c) { return std::islower(static_cast<unsigned char>(c)) != 0; }
        bool IsDigit(char c) { return std::isdigit(static_cast<unsigned char>(c)) != 0; }

        // "uToggleUIKey" -> Toggle, UI, Key;  "hideHotkeyDX" -> hide, Hotkey, DX;  "iSH_CallKey" -> SH, Call, Key
        std::vector<std::string> Words(std::string_view s)
        {
            std::vector<std::string> out;
            std::string               cur;
            const auto                flush = [&] { if (!cur.empty()) out.push_back(std::move(cur)); cur.clear(); };
            for (std::size_t i = 0; i < s.size(); ++i) {
                const char c = s[i];
                if (!IsAlnum(c)) { flush(); continue; }
                if (!cur.empty()) {
                    const char p = cur.back();
                    const bool next_lower = i + 1 < s.size() && IsLowerC(s[i + 1]);
                    if ((IsLowerC(p) && IsUpper(c)) || (IsUpper(p) && IsUpper(c) && next_lower) ||
                        (IsDigit(p) != IsDigit(c)))
                        flush();
                }
                cur += c;
            }
            flush();
            return out;
        }

        // ------------------------------------------------------------------ minimal JSON reader

        struct JVal
        {
            enum class T { Null, Bool, Num, Str, Arr, Obj } t = T::Null;
            double                                    num = 0;
            std::string                               str;
            std::vector<JVal>                         arr;
            std::vector<std::pair<std::string, JVal>> obj;

            const JVal* Get(std::string_view k) const
            {
                for (const auto& [n, v] : obj)
                    if (n == k) return &v;
                return nullptr;
            }
            std::string Str(std::string_view k) const
            {
                const auto* v = Get(k);
                return v && v->t == T::Str ? v->str : std::string{};
            }
            std::optional<long long> Int() const
            {
                if (t != T::Num || std::floor(num) != num || std::fabs(num) > 1e12) return std::nullopt;
                return static_cast<long long>(num);
            }
        };

        class JParser
        {
        public:
            explicit JParser(std::string_view s) : _s(s)
            {
                if (_s.starts_with("\xEF\xBB\xBF")) _i = 3;
            }

            bool Parse(JVal& out)
            {
                try {
                    out = Value(0);
                    return true;
                } catch (...) {
                    return false;
                }
            }

        private:
            std::string_view _s;
            std::size_t      _i = 0;

            [[noreturn]] static void Fail() { throw std::runtime_error("json"); }

            char Peek()
            {
                while (_i < _s.size() && std::isspace(static_cast<unsigned char>(_s[_i]))) ++_i;
                return _i < _s.size() ? _s[_i] : '\0';
            }
            void Expect(char c)
            {
                if (Peek() != c) Fail();
                ++_i;
            }

            static void PutUtf8(std::string& out, std::uint32_t cp)
            {
                if (cp < 0x80) out += static_cast<char>(cp);
                else if (cp < 0x800) { out += static_cast<char>(0xC0 | (cp >> 6)); out += static_cast<char>(0x80 | (cp & 0x3F)); }
                else if (cp < 0x10000) {
                    out += static_cast<char>(0xE0 | (cp >> 12));
                    out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
                    out += static_cast<char>(0x80 | (cp & 0x3F));
                } else {
                    out += static_cast<char>(0xF0 | (cp >> 18));
                    out += static_cast<char>(0x80 | ((cp >> 12) & 0x3F));
                    out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
                    out += static_cast<char>(0x80 | (cp & 0x3F));
                }
            }

            std::uint32_t Hex4()
            {
                if (_i + 4 > _s.size()) Fail();
                std::uint32_t v = 0;
                const auto [p, ec] = std::from_chars(_s.data() + _i, _s.data() + _i + 4, v, 16);
                if (ec != std::errc{} || p != _s.data() + _i + 4) Fail();
                _i += 4;
                return v;
            }

            std::string String()
            {
                Expect('"');
                std::string r;
                while (true) {
                    if (_i >= _s.size()) Fail();
                    const char c = _s[_i++];
                    if (c == '"') break;
                    if (c != '\\') { r += c; continue; }
                    if (_i >= _s.size()) Fail();
                    const char e = _s[_i++];
                    switch (e) {
                    case 'n': r += '\n'; break;
                    case 't': r += '\t'; break;
                    case 'r': r += '\r'; break;
                    case 'b': r += '\b'; break;
                    case 'f': r += '\f'; break;
                    case 'u':
                        {
                            std::uint32_t cp = Hex4();
                            if (cp >= 0xD800 && cp <= 0xDBFF && _i + 6 <= _s.size() && _s[_i] == '\\' && _s[_i + 1] == 'u') {
                                _i += 2;
                                const auto lo = Hex4();
                                cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
                            }
                            PutUtf8(r, cp);
                            break;
                        }
                    default: r += e; break;   // \" \\ \/
                    }
                }
                return r;
            }

            JVal Value(int depth)
            {
                if (depth > 64) Fail();
                JVal       v;
                const char c = Peek();
                if (c == '{') {
                    ++_i;
                    v.t = JVal::T::Obj;
                    if (Peek() == '}') { ++_i; return v; }
                    while (true) {
                        auto key = String();
                        Expect(':');
                        v.obj.emplace_back(std::move(key), Value(depth + 1));
                        if (Peek() == ',') { ++_i; continue; }
                        Expect('}');
                        return v;
                    }
                }
                if (c == '[') {
                    ++_i;
                    v.t = JVal::T::Arr;
                    if (Peek() == ']') { ++_i; return v; }
                    while (true) {
                        v.arr.push_back(Value(depth + 1));
                        if (Peek() == ',') { ++_i; continue; }
                        Expect(']');
                        return v;
                    }
                }
                if (c == '"') {
                    v.t   = JVal::T::Str;
                    v.str = String();
                    return v;
                }
                if (_s.substr(_i).starts_with("true")) { _i += 4; v.t = JVal::T::Bool; v.num = 1; return v; }
                if (_s.substr(_i).starts_with("false")) { _i += 5; v.t = JVal::T::Bool; return v; }
                if (_s.substr(_i).starts_with("null")) { _i += 4; return v; }
                const auto start = _i;
                while (_i < _s.size() && std::strchr("+-0123456789.eE", _s[_i]) && _s[_i]) ++_i;
                if (_i == start) Fail();
                const auto [p, ec] = std::from_chars(_s.data() + start, _s.data() + _i, v.num);
                if (ec != std::errc{}) Fail();
                v.t = JVal::T::Num;
                return v;
            }
        };

        std::optional<std::string> ReadSmallFile(const fs::path& p)
        {
            std::error_code ec;
            const auto      size = fs::file_size(p, ec);
            if (ec || size > kMaxFileSize) return std::nullopt;
            std::ifstream in(p, std::ios::binary);
            if (!in) return std::nullopt;
            return std::string(std::istreambuf_iterator<char>(in), {});
        }

        bool ReadJson(const fs::path& p, JVal& out)
        {
            const auto text = ReadSmallFile(p);
            return text && JParser(*text).Parse(out);
        }

        // ------------------------------------------------------------------ key codes

        // Names some mods write instead of a code (SKSE Menu Framework: ToggleKey = F19).
        // Compared without case, spaces, '_' and '-'.
        const std::unordered_map<std::string, std::uint32_t>& KeyNames()
        {
            static const auto map = [] {
                std::unordered_map<std::string, std::uint32_t> m;
                const auto put = [&](std::initializer_list<const char*> names, std::uint32_t dik) {
                    for (const auto* n : names) m.emplace(n, dik);
                };
                const char* letters = "qwertyuiop";
                for (int i = 0; i < 10; ++i) m.emplace(std::string(1, letters[i]), 16 + i);
                letters = "asdfghjkl";
                for (int i = 0; i < 9; ++i) m.emplace(std::string(1, letters[i]), 30 + i);
                letters = "zxcvbnm";
                for (int i = 0; i < 7; ++i) m.emplace(std::string(1, letters[i]), 44 + i);
                for (int i = 1; i <= 9; ++i) {
                    m.emplace(std::to_string(i), 1 + i);
                    m.emplace("digit" + std::to_string(i), 1 + i);
                }
                put({ "0", "digit0" }, 11);
                for (int i = 1; i <= 10; ++i) m.emplace("f" + std::to_string(i), 58 + i);
                put({ "f11" }, 87);
                put({ "f12" }, 88);
                for (int i = 13; i <= 23; ++i) m.emplace("f" + std::to_string(i), 87 + i);  // 100-110
                put({ "f24" }, 118);
                const std::uint32_t pad[] = { 82, 79, 80, 81, 75, 76, 77, 71, 72, 73 };
                for (int i = 0; i < 10; ++i) {
                    m.emplace("numpad" + std::to_string(i), pad[i]);
                    m.emplace("num" + std::to_string(i), pad[i]);
                    m.emplace("kp" + std::to_string(i), pad[i]);
                }
                put({ "minus" }, 12);
                put({ "equals", "equal" }, 13);
                put({ "backspace", "back" }, 14);
                put({ "tab" }, 15);
                put({ "leftbracket", "bracketleft", "lbracket" }, 26);
                put({ "rightbracket", "bracketright", "rbracket" }, 27);
                put({ "enter", "return" }, 28);
                put({ "leftcontrol", "lcontrol", "leftctrl", "lctrl", "controlleft", "ctrl", "control" }, 29);
                put({ "semicolon" }, 39);
                put({ "apostrophe", "quote" }, 40);
                put({ "grave", "tilde", "backquote", "`", "~" }, 41);
                put({ "leftshift", "lshift", "shiftleft", "shift" }, 42);
                put({ "backslash" }, 43);
                put({ "comma" }, 51);
                put({ "period" }, 52);
                put({ "slash" }, 53);
                put({ "rightshift", "rshift", "shiftright" }, 54);
                put({ "numpadmultiply", "multiply", "numpadstar" }, 55);
                put({ "leftalt", "lalt", "altleft", "alt", "lmenu" }, 56);
                put({ "space", "spacebar" }, 57);
                put({ "capslock", "capital", "caps" }, 58);
                put({ "numlock" }, 69);
                put({ "scrolllock", "scroll" }, 70);
                put({ "numpadsubtract", "numpadminus", "subtract" }, 74);
                put({ "numpadadd", "numpadplus", "add" }, 78);
                put({ "numpaddecimal", "numpadperiod", "decimal" }, 83);
                put({ "numpadenter" }, 156);
                put({ "rightcontrol", "rcontrol", "rightctrl", "rctrl", "controlright" }, 157);
                put({ "numpaddivide", "divide", "numpadslash" }, 181);
                put({ "printscreen", "print", "sysrq" }, 183);
                put({ "rightalt", "ralt", "altright", "rmenu" }, 184);
                put({ "pause" }, 197);
                put({ "home" }, 199);
                put({ "up", "uparrow", "arrowup" }, 200);
                put({ "pageup", "pgup", "prior" }, 201);
                put({ "left", "leftarrow", "arrowleft" }, 203);
                put({ "right", "rightarrow", "arrowright" }, 205);
                put({ "end" }, 207);
                put({ "down", "downarrow", "arrowdown" }, 208);
                put({ "pagedown", "pgdn", "next" }, 209);
                put({ "insert", "ins" }, 210);
                put({ "delete", "del" }, 211);
                put({ "mouse1", "leftmouse", "leftmousebutton", "lmb", "mouseleft" }, 256);
                put({ "mouse2", "rightmouse", "rightmousebutton", "rmb", "mouseright" }, 257);
                put({ "mouse3", "middlemouse", "middlemousebutton", "mmb", "mousemiddle" }, 258);
                return m;
            }();
            return map;
        }

        // Keys the panel can show: keyboard DIK 2-254 (1 = Esc) and SKSE's 256-258 = mouse 1-3.
        bool PanelCode(long long c) { return (c >= 2 && c <= 254) || (c >= 256 && c <= 258); }
        bool ModifierDik(std::uint32_t c) { return c == 42 || c == 54 || c == 29 || c == 157 || c == 56 || c == 184; }

        // "42", "0x2A", "45.000000", "F19", "\"Insert\"" -> code; nullopt when not a key at all.
        std::optional<long long> ParseKeyValue(std::string_view raw)
        {
            std::string v(raw);
            if (const auto p = v.find_first_of(";#"); p != std::string::npos) v.erase(p);
            v = Trim(v);
            if (v.size() >= 2 && (v.front() == '"' || v.front() == '\'') && v.back() == v.front()) v = Trim(v.substr(1, v.size() - 2));
            if (v.empty()) return std::nullopt;
            if (v.size() > 2 && v[0] == '0' && (v[1] == 'x' || v[1] == 'X')) {
                unsigned long long h = 0;
                const auto [p, ec] = std::from_chars(v.data() + 2, v.data() + v.size(), h, 16);
                if (ec == std::errc{} && p == v.data() + v.size()) return static_cast<long long>(h);
                return std::nullopt;
            }
            double d = 0;
            if (const auto [p, ec] = std::from_chars(v.data(), v.data() + v.size(), d); ec == std::errc{} && p == v.data() + v.size())
                return (std::floor(d) == d && std::fabs(d) < 1e12) ? std::optional<long long>(static_cast<long long>(d)) : std::nullopt;
            std::string n;
            for (const char c : v)
                if (!std::strchr(" _-", c)) n += static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
            const auto& names = KeyNames();
            if (const auto it = names.find(n); it != names.end()) return it->second;
            return std::nullopt;
        }

        // ------------------------------------------------------------------ setting names

        const std::unordered_set<std::string> kKeyTail = { "key", "keys", "hotkey", "hotkeys", "keybind", "keybinds", "keycode",
            "keycodes", "button", "buttons", "shortcut", "shortcuts", "keyboard", "bind", "binding", "keymap" };
        const std::unordered_set<std::string> kKeyHead  = { "key", "hotkey", "keycode", "keybind" };
        const std::unordered_set<std::string> kStripEnd = { "dik", "dx", "mkb", "kb", "int", "code", "codes", "combination", "combo",
            "id", "pc", "value", "scancode" };
        // Words that make a "...Key" setting something else: a size, a delay, a switch, a gamepad
        // button (the panel is keyboard + mouse), a text.
        const std::unordered_set<std::string> kNotKey = { "max", "min", "count", "num", "number", "width", "height", "size", "delay",
            "duration", "ms", "sec", "secs", "seconds", "speed", "mult", "multiplier", "scale", "offset", "sensitivity", "color",
            "colour", "alpha", "enable", "enabled", "disable", "disabled", "visible", "hint", "hints", "text", "name", "label",
            "gamepad", "controller", "joystick", "xbox", "ps4", "dualshock", "spacing", "padding", "gap", "column", "columns",
            "row", "rows", "font", "sound", "volume", "threshold", "index", "difficulty", "cooldown", "message", "icon", "texture",
            "path", "file", "sprite", "prompt", "timeout" };
        const std::unordered_set<std::string> kFalseKey = { "monkey", "donkey", "turkey", "whiskey", "jockey", "hockey", "lackey" };
        // Dropped from a label: the setting is a key, the panel shows it on a key already.
        const std::unordered_set<std::string> kLabelDrop = { "key", "keys", "hotkey", "hotkeys", "keybind", "keybinds", "keycode",
            "keycodes", "dik", "dx", "mkb", "kb", "int", "code", "keyboard", "shortcut", "bind", "binding", "keymap", "combination",
            "scancode" };

        struct NameInfo
        {
            bool                     key      = false;
            bool                     modifier = false;
            std::vector<std::string> words;   // original case, Hungarian prefix gone
        };

        bool EndsWithAny(std::string_view w, std::initializer_list<std::string_view> tails)
        {
            return std::ranges::any_of(tails, [&](std::string_view t) { return w.size() > t.size() && w.ends_with(t); }) ||
                   std::ranges::any_of(tails, [&](std::string_view t) { return w == t; });
        }

        NameInfo Classify(std::string_view raw)
        {
            NameInfo    ni;
            std::size_t i = 0;
            while (i < raw.size() && !IsAlnum(raw[i])) ++i;   // "!iHUDKey"
            std::string name(raw.substr(i));
            // Hungarian notation: i / u = integer (keep), b / f / s = bool, float, string (not a key)
            if (name.size() > 2 && IsLowerC(name[0]) && IsUpper(name[1])) {
                if (std::strchr("bfs", name[0])) return ni;
                if (std::strchr("iu", name[0])) name.erase(0, 1);
            }
            ni.words = Words(name);
            std::vector<std::string> low;
            for (const auto& w : ni.words) low.push_back(Lower(w));
            while (low.size() > 1 && IsDigit(low.back()[0])) low.pop_back();   // "HotKey2"
            if (low.empty()) return ni;
            for (const auto& w : low) {
                if (kNotKey.contains(w) || Has(w, "keyword") || Has(w, "keyframe")) return ni;
                if (Has(w, "modifier") || w == "mod") ni.modifier = true;
            }
            while (low.size() > 1 && kStripEnd.contains(low.back())) low.pop_back();
            const auto& last = low.back();
            if (kKeyTail.contains(last)) ni.key = true;
            else if (ni.modifier && Has(last, "modifier")) ni.key = true;   // "iKeyboardModifier"
            else if (low.size() <= 2 && kKeyHead.contains(low.front())) ni.key = true;   // "iKeyCCW", "HotkeyGhost"
            else {
                // one lower-case blob (Papyrus / JsonUtil style): "furniturenpcactionkey", "keycodeposernext"
                std::string w = last;
                for (const std::string_view suf : { "int", "dik", "dx" })
                    if (w.size() > suf.size() + 3 && w.ends_with(suf)) w.erase(w.size() - suf.size());
                if (!kFalseKey.contains(w) &&
                    (EndsWithAny(w, { "key", "keys", "hotkey", "keycode", "keybind", "button" }) || w.starts_with("keycode") ||
                        w.starts_with("hotkey")))
                    ni.key = true;
            }
            return ni;
        }

        std::string Cap(std::string w)
        {
            const bool allCaps = w.size() > 1 && std::ranges::none_of(w, IsLowerC);
            if (!allCaps) {
                w = Lower(w);
                w[0] = static_cast<char>(std::toupper(static_cast<unsigned char>(w[0])));
            }
            return w;
        }

        // Words -> "Toggle UI", without the "Key" / "Hotkey" words.
        std::string LabelFromWords(const std::vector<std::string>& words)
        {
            std::string out;
            for (std::size_t i = 0; i < words.size(); ++i) {
                auto w = words[i];
                auto l = Lower(w);
                if (kLabelDrop.contains(l)) continue;
                if (l == "hot" && i + 1 < words.size() && Lower(words[i + 1]) == "key") continue;   // "HotKey2"
                // a mod's short lower-case prefix: "bb_playerautowhorehotkeyint"
                if (i == 0 && words.size() > 1 && w.size() <= 3 && w == l && !IsDigit(w[0]) && words[1] == Lower(words[1])) continue;
                // a lower-case blob: cut the key words off its ends ("keycodeposernext" -> "posernext")
                if (w.size() >= 8 && std::all_of(w.begin() + 1, w.end(), [](char c) { return !IsUpper(c); })) {
                    for (const std::string_view pre : { "keycode", "hotkey" })
                        if (l.size() > pre.size() + 2 && l.starts_with(pre)) { w = w.substr(pre.size()); l = l.substr(pre.size()); }
                    for (const std::string_view suf : { "int", "hotkey", "keycode", "keys", "key" })
                        if (l.size() > suf.size() + 2 && l.ends_with(suf)) { w.resize(w.size() - suf.size()); l.resize(l.size() - suf.size()); }
                }
                if (w.empty()) continue;
                if (!out.empty()) out += ' ';
                out += Cap(w);
            }
            if (!out.empty() && std::ranges::all_of(out, [](char c) { return IsDigit(c) || c == ' '; })) out = "Hotkey " + out;
            return out;
        }

        std::string Humanize(std::string_view name) { return LabelFromWords(Words(name)); }

        // "TorchesCandlelightLanterns" -> "Torches Candlelight Lanterns" (every word kept)
        std::string Spaced(std::string_view name)
        {
            std::string out;
            for (const auto& w : Words(name)) out += (out.empty() ? "" : " ") + w;
            return out.empty() ? std::string(name) : out;
        }

        // A section name that says nothing about the key ("[General] Hotkey = 109").
        bool GenericSection(const std::string& section)
        {
            static const std::unordered_set<std::string> kGeneric = { "", "general", "settings", "setting", "main", "hotkey",
                "hotkeys", "keys", "key", "keybinds", "controls", "control", "input", "config", "options", "properties" };
            return kGeneric.contains(Lower(Trim(section)));
        }

        // MCM Helper text: "$TrueDirectionalMovement_TargetLockKey_OptionText" -> "Target Lock";
        // "{$Group}/{$Ungroup}" -> "Group/Ungroup". Plain text stays as written.
        std::string McmText(const std::string& text)
        {
            if (text.find('$') == std::string::npos) return Trim(text);
            std::string s;
            for (const char c : text)
                if (c != '$' && c != '{' && c != '}') s += c;
            if (s.find_first_of(" /") != std::string::npos) return Trim(s);   // "Group 1", "Group/Ungroup"
            std::vector<std::string> parts;
            std::size_t              b = 0;
            while (b <= s.size()) {
                const auto e = s.find('_', b);
                parts.push_back(s.substr(b, e == std::string::npos ? std::string::npos : e - b));
                if (e == std::string::npos) break;
                b = e + 1;
            }
            std::erase_if(parts, [](const std::string& p) {
                const auto l = Lower(p);
                return l.empty() || l == "optiontext" || l == "text" || l == "option" || l == "info" || l == "name";
            });
            if (parts.empty()) return Trim(s);
            auto label = Humanize(parts.back());
            return label.empty() ? Humanize(s) : label;
        }

        // Words from a lower-case blob or a normal name, whichever reads better as an owner.
        std::string OwnerName(std::string name)
        {
            if (Lower(name).starts_with("po3_")) name.erase(0, 4);
            return name;
        }

        // ------------------------------------------------------------------ results

        struct Entry
        {
            std::string                src;
            std::uint32_t              dik = 0;
            std::vector<std::uint32_t> mods;
            std::string                owner, label, where;
            bool                       mcm = false;
        };

        // SkyPrompt keys only work while their prompt is on screen: listed, but not a clash.
        bool Contextual(const Entry& e) { return Has(Lower(e.where), "prompt"); }

        struct Scan
        {
            fs::path           data;
            std::vector<Entry> entries;
            int                files = 0;
        };

        // ------------------------------------------------------------------ ini

        struct IniLine
        {
            std::string section, name, value;
        };

        std::vector<IniLine> ReadIni(const std::string& text)
        {
            std::vector<IniLine> out;
            std::string          section;
            std::size_t          pos = text.starts_with("\xEF\xBB\xBF") ? 3 : 0;
            while (pos < text.size()) {
                auto nl = text.find('\n', pos);
                if (nl == std::string::npos) nl = text.size();
                const auto t = Trim(std::string_view(text).substr(pos, nl - pos));
                pos          = nl + 1;
                if (t.empty() || t[0] == ';' || t[0] == '#' || t.starts_with("//")) continue;
                if (t[0] == '[') {
                    const auto r = t.find(']');
                    section      = Trim(t.substr(1, r == std::string::npos ? std::string::npos : r - 1));
                    continue;
                }
                const auto eq = t.find('=');
                if (eq == std::string::npos) continue;
                out.push_back({ section, Trim(t.substr(0, eq)), Trim(t.substr(eq + 1)) });
            }
            return out;
        }

        bool Truthy(const std::string& v)
        {
            const auto l = Lower(Trim(v));
            if (l == "true" || l == "on" || l == "yes") return true;
            const auto n = ParseKeyValue(l);
            return n && *n != 0;
        }

        // Base name for pairing a key with its modifier: "iKeyboardKey" / "iKeyboardModifier" -> "keyboard".
        std::string PairStem(const NameInfo& ni)
        {
            std::string s;
            for (const auto& w : ni.words) {
                const auto l = Lower(w);
                if (kLabelDrop.contains(l) || Has(l, "modifier") || l == "mod") continue;
                s += l;
            }
            return s;
        }

        void ScanIniText(Scan& scan, const std::string& text, const std::string& rel, const std::string& owner)
        {
            const auto lines = ReadIni(text);
            struct Found
            {
                std::size_t line;
                NameInfo    ni;
                long long   code;
            };
            std::vector<Found> keys, mods;
            for (std::size_t i = 0; i < lines.size(); ++i) {
                const auto& l = lines[i];
                if (std::ranges::any_of(Words(l.section), [](const std::string& w) {
                        const auto lw = Lower(w);
                        return lw == "gamepad" || lw == "controller" || lw == "joystick" || lw == "xbox";
                    }))
                    continue;
                auto ni = Classify(l.name);
                if (!ni.key) continue;
                const auto code = ParseKeyValue(l.value);
                if (!code) continue;
                (ni.modifier ? mods : keys).push_back({ i, std::move(ni), *code });
            }
            for (const auto& k : keys) {
                if (!PanelCode(k.code)) continue;
                const auto& l = lines[k.line];
                Entry       e;
                e.dik   = static_cast<std::uint32_t>(k.code);
                e.owner = owner;
                e.label = LabelFromWords(k.ni.words);
                if (e.label.empty() && !GenericSection(l.section)) e.label = Humanize(l.section);
                e.src   = "SCAN:" + Lower(rel) + "|" + l.section + "|" + l.name;
                e.where = rel + "  [" + l.section + "] " + l.name;

                // uToggleUIKey + uToggleUIKeyShift / Ctrl / Alt = true
                const auto base = Lower(l.name);
                for (const auto& s : lines) {
                    if (s.section != l.section) continue;
                    const auto n = Lower(s.name);
                    if (!n.starts_with(base) || n.size() == base.size()) continue;
                    std::string suf = n.substr(base.size());
                    if (suf[0] == '_') suf.erase(0, 1);
                    std::uint32_t dik = 0;
                    if (suf == "shift") dik = 42;
                    else if (suf == "ctrl" || suf == "control") dik = 29;
                    else if (suf == "alt") dik = 56;
                    if (dik && Truthy(s.value)) e.mods.push_back(dik);
                }
                // iToggleKey + iToggleModifierKey; or the one modifier of a section with one key
                if (e.mods.empty() && !mods.empty()) {
                    const auto stem = PairStem(k.ni);
                    const Found* pick = nullptr;
                    for (const auto& m : mods)
                        if (lines[m.line].section == l.section && PairStem(m.ni) == stem) pick = &m;
                    if (!pick) {
                        const auto sameSection = [&](const Found& f) { return lines[f.line].section == l.section; };
                        if (std::ranges::count_if(keys, sameSection) == 1 && std::ranges::count_if(mods, sameSection) == 1)
                            pick = &*std::ranges::find_if(mods, sameSection);
                    }
                    // a real key (Shift / Ctrl / Alt, CapsLock...); 2-11 there is an enum (Custom Markers: 8 = LShift)
                    if (pick && pick->code >= 2 && pick->code <= 254 && pick->code != k.code &&
                        (ModifierDik(static_cast<std::uint32_t>(pick->code)) || pick->code >= 12))
                        e.mods.push_back(static_cast<std::uint32_t>(pick->code));
                }
                scan.entries.push_back(std::move(e));
            }
        }

        // ------------------------------------------------------------------ json

        void ScanJsonValue(Scan& scan, const JVal& v, const std::string& path, const std::string& parent, const std::string& name,
            const std::string& rel, const std::string& owner, int depth)
        {
            if (depth > 32) return;
            if (v.t == JVal::T::Obj) {
                for (const auto& [k, child] : v.obj)
                    ScanJsonValue(scan, child, path.empty() ? k : path + "." + k, name, k, rel, owner, depth + 1);
                return;
            }
            if (v.t == JVal::T::Arr) {
                const bool ints = !v.arr.empty() && std::ranges::all_of(v.arr, [](const JVal& x) { return x.Int().has_value(); });
                if (!ints) {
                    for (std::size_t i = 0; i < v.arr.size(); ++i)
                        ScanJsonValue(scan, v.arr[i], path + "[" + std::to_string(i) + "]", parent, name, rel, owner, depth + 1);
                    return;
                }
            }
            const auto ni = Classify(name);
            if (!ni.key || ni.modifier) return;

            auto label = LabelFromWords(ni.words);
            if (label.empty()) label = Humanize(parent);   // IED: ui.toggle_keys.key
            const auto emit = [&](long long code, std::vector<std::uint32_t> mods, const std::string& suffix, const std::string& id) {
                if (!PanelCode(code)) return;
                Entry e;
                e.dik   = static_cast<std::uint32_t>(code);
                e.mods  = std::move(mods);
                e.owner = owner;
                e.label = label + suffix;
                e.src   = "SCAN:" + Lower(rel) + "|" + id;
                e.where = rel + "  " + id;
                scan.entries.push_back(std::move(e));
            };

            if (v.t == JVal::T::Arr) {
                std::vector<long long> codes;
                for (const auto& x : v.arr) codes.push_back(*x.Int());
                // [Shift, U] under a "..._key_combination" name = one combo; else one bind per element
                const auto low = Lower(name);
                if (Has(low, "combination") || Has(low, "combo")) {
                    std::vector<std::uint32_t> mods;
                    long long                  main = -1;
                    for (const auto c : codes) {
                        if (c >= 2 && c <= 254 && ModifierDik(static_cast<std::uint32_t>(c)) && codes.size() > 1) mods.push_back(static_cast<std::uint32_t>(c));
                        else if (main < 0) main = c;
                    }
                    if (main >= 0) emit(main, mods, "", path);
                    return;
                }
                std::set<long long> seen;
                for (std::size_t i = 0; i < codes.size(); ++i)
                    if (seen.insert(codes[i]).second)
                        emit(codes[i], {}, codes.size() > 1 ? " " + std::to_string(i + 1) : "", path + "[" + std::to_string(i) + "]");
                return;
            }
            std::optional<long long> code;
            if (v.t == JVal::T::Num) code = v.Int();
            else if (v.t == JVal::T::Str) code = ParseKeyValue(v.str);
            if (code) emit(*code, {}, "", path);
        }

        // ------------------------------------------------------------------ MCM Helper

        struct Keymap
        {
            std::string id, text;
            bool        inIni = true;   // sourceType set: the value lives in the mod's ini
        };

        void CollectKeymaps(const JVal& v, std::vector<Keymap>& out, int depth = 0)
        {
            if (depth > 32) return;
            if (v.t == JVal::T::Obj) {
                if (v.Str("type") == "keymap" && !v.Str("id").empty()) {
                    const auto* opts = v.Get("valueOptions");
                    out.push_back({ v.Str("id"), v.Str("text"), opts && !opts->Str("sourceType").empty() });
                }
                for (const auto& [k, child] : v.obj) CollectKeymaps(child, out, depth + 1);
            } else if (v.t == JVal::T::Arr) {
                for (const auto& child : v.arr) CollectKeymaps(child, out, depth + 1);
            }
        }

        // SkyUI's own menu keys (inventory search, tabs...) only work inside its menus; its
        // favourite-group keys are the gameplay ones.
        bool SkipMcmKeymap(const std::string& modLower, const std::string& id)
        {
            return modLower == "skyui_se" && !Lower(id).starts_with("ifavoritegroupusehotkey");
        }

        // Returns the MCM/Settings file names (lower case) read here, for the generic pass to skip.
        std::set<std::string> ScanMcmHelper(Scan& scan)
        {
            std::set<std::string> handled{ "keybinds.json" };
            const auto            cfgDir = scan.data / "MCM" / "Config";
            const auto            setDir = scan.data / "MCM" / "Settings";

            // keymaps with no ini setting: MCM Helper's own registry
            std::map<std::string, long long> registry;   // "mod|id" (lower) -> keycode
            {
                JVal kb;
                if (ReadJson(setDir / "keybinds.json", kb))
                    if (const auto* list = kb.Get("keybinds"); list && list->t == JVal::T::Arr)
                        for (const auto& b : list->arr)
                            if (const auto* kc = b.Get("keycode"); kc && kc->Int())
                                registry[Lower(b.Str("modName")) + "|" + Lower(b.Str("id"))] = *kc->Int();
            }

            std::error_code ec;
            for (fs::directory_iterator it(cfgDir, fs::directory_options::skip_permission_denied, ec), end; !ec && it != end; it.increment(ec)) {
                std::error_code e2;
                if (!it->is_directory(e2)) continue;
                const auto folder = it->path().filename().string();
                JVal       cfg;
                if (!ReadJson(it->path() / "config.json", cfg)) continue;
                ++scan.files;
                std::vector<Keymap> keymaps;
                CollectKeymaps(cfg, keymaps);
                if (keymaps.empty()) continue;

                const auto modName = cfg.Str("modName").empty() ? folder : cfg.Str("modName");
                auto       display = cfg.Str("displayName");
                if (display.empty() || display[0] == '$') display = Spaced(modName);
                const auto modLower = Lower(modName);

                // values: the user's MCM/Settings/<mod>.ini over the menu's own defaults
                std::map<std::string, std::string> values;   // "name:section" (lower) -> value
                std::map<std::string, std::string> fromFile;
                const auto                         load = [&](const fs::path& p, const std::string& rel) {
                    const auto text = ReadSmallFile(p);
                    if (!text) return false;
                    for (const auto& l : ReadIni(*text)) {
                        const auto id = Lower(l.name + ":" + l.section);
                        values[id]    = l.value;
                        fromFile[id]  = rel;
                    }
                    return true;
                };
                load(it->path() / "settings.ini", "MCM/Config/" + folder + "/settings.ini");
                if (load(setDir / (modName + ".ini"), "MCM/Settings/" + modName + ".ini")) {
                    handled.insert(Lower(modName + ".ini"));
                    ++scan.files;
                }

                for (const auto& km : keymaps) {
                    if (SkipMcmKeymap(modLower, km.id)) continue;
                    // a menu's "modifier" key is held with its other keys, not a hotkey of its own
                    if (Has(Lower(km.id), "modifier") || Has(Lower(km.text), "modifier")) continue;
                    std::optional<long long> code;
                    std::string              where;
                    if (km.inIni) {
                        const auto id = Lower(km.id);
                        if (const auto v = values.find(id); v != values.end()) {
                            code  = ParseKeyValue(v->second);
                            where = fromFile[id] + "  " + km.id;
                        }
                    } else if (const auto r = registry.find(modLower + "|" + Lower(km.id)); r != registry.end()) {
                        code  = r->second;
                        where = "MCM/Settings/keybinds.json  " + km.id;
                    }
                    if (!code || !PanelCode(*code)) continue;
                    Entry e;
                    e.dik   = static_cast<std::uint32_t>(*code);
                    e.owner = display;
                    e.label = McmText(km.text.empty() ? km.id : km.text);
                    e.src   = "SCAN:mcm/" + modLower + "|" + km.id;
                    e.where = where;
                    e.mcm   = true;
                    scan.entries.push_back(std::move(e));
                }
            }
            return handled;
        }

        // ------------------------------------------------------------------ files under SKSE/Plugins

        // Not settings: other tools' data, translations, backups, our own state.
        bool SkipFile(const std::string& relLower)
        {
            for (const std::string_view part : { "/skypatcher/", "/hotkeypanel/", "/hotkeyatlas", "translation", "strings", "original",
                     "backup", "/lang/", "/languages/", "/locale", "_english", "_en.", "/interface/" })
                if (Has(relLower, part)) return true;
            return relLower.ends_with(".bak");
        }

        bool SettingsJsonName(const std::string& fileLower)
        {
            for (const std::string_view w : { "setting", "config", "user", "hotkey", "keybind", "control", "input", "option", "pref" })
                if (Has(fileLower, w)) return true;
            return false;
        }

        bool Defaultish(const std::string& relLower) { return Has(relLower, "default") || Has(relLower, "factory"); }

        // Where a defaults file's real twin would be: "wheeler/ammowheel.defaults.ini" and
        // "risa/defaults/risa.ini" both -> the same key as "wheeler/ammowheel.ini" / "risa/settings/risa.ini".
        std::string TwinKey(const std::string& relLower)
        {
            std::string out;
            std::size_t b = 0;
            while (b <= relLower.size()) {
                auto       e   = relLower.find('/', b);
                const bool dir = e != std::string::npos;
                auto       seg = relLower.substr(b, dir ? e - b : std::string::npos);
                if (dir && (seg == "defaults" || seg == "default" || seg == "settings" || seg == "config")) {
                    b = e + 1;
                    continue;
                }
                if (!dir)
                    for (const std::string_view w : { ".defaults", "_defaults", ".default", "_default", "defaults", "default", ".factory", "_factory" })
                        if (const auto p = seg.find(w); p != std::string::npos) seg.erase(p, w.size());
                out += seg;
                if (!dir) break;
                out += '/';
                b = e + 1;
            }
            return out;
        }

        // SKSE/Plugins/<Folder>/x.ini -> Folder; SKSE/Plugins/x.ini, MCM/Settings/x.ini -> x;
        // SKSE/Plugins/StorageUtilData/<Folder>/x.json -> Folder.
        std::string OwnerOf(const std::string& rel)
        {
            std::vector<std::string> parts;
            std::size_t              b = 0;
            while (b <= rel.size()) {
                const auto e = rel.find('/', b);
                parts.push_back(rel.substr(b, e == std::string::npos ? std::string::npos : e - b));
                if (e == std::string::npos) break;
                b = e + 1;
            }
            const auto stem = fs::path(parts.back()).stem().string();
            if (parts.size() > 3 && Lower(parts[0]) == "skse") {
                const auto dir = Lower(parts[2]);
                if ((dir == "storageutildata" || dir == "jcontainers") && parts.size() > 4) return OwnerName(parts[3]);
                if (dir != "storageutildata" && dir != "jcontainers") return OwnerName(parts[2]);
            }
            return OwnerName(stem);
        }

        void ScanFiles(Scan& scan, const std::set<std::string>& mcmHandled)
        {
            struct Candidate
            {
                fs::path    path;
                std::string rel, relLower;
                bool        json;
            };
            std::vector<Candidate> found;
            const auto             add = [&](const fs::path& p) {
                std::string ext, rel;
                try {
                    ext = Lower(p.extension().string());
                    // lexical on purpose: fs::relative follows MO2's VFS to the real mod folder
                    rel = p.lexically_relative(scan.data).generic_string();
                } catch (...) {
                    return;
                }
                if (ext != ".ini" && ext != ".json") return;
                const auto relLower = Lower(rel);
                if (SkipFile(relLower)) return;
                const bool json = ext == ".json";
                if (json && !SettingsJsonName(Lower(p.filename().string()))) return;
                found.push_back({ p, rel, relLower, json });
            };

            // own walk, one directory at a time: a folder that can't be listed (too long a path,
            // no access) is skipped instead of ending the whole listing
            std::vector<std::pair<fs::path, int>> dirs{ { scan.data / "SKSE" / "Plugins", 0 } };
            int                                   unreadable = 0;
            while (!dirs.empty()) {
                const auto [dir, depth] = dirs.back();
                dirs.pop_back();
                std::error_code ec;
                for (fs::directory_iterator it(dir, fs::directory_options::skip_permission_denied, ec), end; !ec && it != end; it.increment(ec)) {
                    std::error_code e2;
                    if (it->is_directory(e2)) {
                        std::string name;
                        try {
                            name = Lower(it->path().filename().string());
                        } catch (...) {
                            continue;
                        }
                        if (depth < 8 && name != "skypatcher" && name != "hotkeypanel" && name != "translations")
                            dirs.emplace_back(it->path(), depth + 1);
                    } else if (it->is_regular_file(e2)) {
                        add(it->path());
                    }
                }
                if (ec) ++unreadable;
            }
            if (unreadable) SKSE::log::warn("HotkeyScan: {} folders under SKSE/Plugins could not be listed", unreadable);
            std::error_code ec;
            for (fs::directory_iterator it(scan.data / "MCM" / "Settings", fs::directory_options::skip_permission_denied, ec), end;
                 !ec && it != end; it.increment(ec)) {
                std::error_code e2;
                if (!it->is_regular_file(e2)) continue;
                std::string name;
                try {
                    name = Lower(it->path().filename().string());
                } catch (...) {
                    continue;
                }
                if (mcmHandled.contains(name)) continue;
                add(it->path());
            }

            std::unordered_set<std::string> real;
            for (const auto& c : found)
                if (!Defaultish(c.relLower)) real.insert(TwinKey(c.relLower));

            for (const auto& c : found) {
                if (Defaultish(c.relLower) && real.contains(TwinKey(c.relLower))) continue;   // the user's copy wins
                const auto text = ReadSmallFile(c.path);
                if (!text) continue;
                ++scan.files;
                const auto owner = OwnerOf(c.rel);
                if (c.json) {
                    JVal root;
                    if (JParser(*text).Parse(root)) ScanJsonValue(scan, root, "", "", "", c.rel, owner, 0);
                } else {
                    ScanIniText(scan, *text, c.rel, owner);
                }
            }
        }

        // ------------------------------------------------------------------ output

        void JsonStr(std::string& out, std::string_view s)
        {
            out += '"';
            for (const unsigned char c : s) {
                if (c == '"' || c == '\\') { out += '\\'; out += static_cast<char>(c); }
                else if (c < 0x20) { char buf[8]; std::snprintf(buf, sizeof(buf), "\\u%04x", c); out += buf; }
                else out += static_cast<char>(c);
            }
            out += '"';
        }

        std::string RunScan()
        {
            const auto t0 = std::chrono::steady_clock::now();
            Scan       scan;
            scan.data = fs::current_path() / "Data";   // Skyrim runs with the game folder as cwd; MO2's VFS hooks these calls

            const auto handled = ScanMcmHelper(scan);
            ScanFiles(scan, handled);

            // one entry per mod + key (+ modifiers): the same key in a mod's two files (e.g. an
            // ini next to its Settings copy) shows once
            std::set<std::string> seen;
            std::vector<Entry>    unique;
            for (auto& e : scan.entries) {
                auto mods = e.mods;
                std::ranges::sort(mods);
                std::string k = Lower(e.owner) + "|" + std::to_string(e.dik);
                for (const auto m : mods) k += "+" + std::to_string(m);
                if (seen.insert(k).second) unique.push_back(std::move(e));
            }

            const auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - t0).count();
            std::string out = "{\"files\":" + std::to_string(scan.files) + ",\"ms\":" + std::to_string(ms) + ",\"entries\":[";
            bool first = true;
            for (const auto& e : unique) {
                if (!first) out += ',';
                first = false;
                out += "{\"src\":";
                JsonStr(out, e.src);
                out += ",\"dik\":" + std::to_string(e.dik) + ",\"mods\":[";
                for (std::size_t i = 0; i < e.mods.size(); ++i) out += (i ? "," : "") + std::to_string(e.mods[i]);
                out += "],\"owner\":";
                JsonStr(out, e.owner);
                out += ",\"label\":";
                JsonStr(out, e.label);
                out += ",\"where\":";
                JsonStr(out, e.where);
                out += e.mcm ? ",\"mcm\":true" : ",\"mcm\":false";
                out += Contextual(e) ? ",\"ctx\":true}" : "}";
            }
            out += "]}";
            SKSE::log::info("HotkeyScan: {} hotkeys from {} files in {} ms", unique.size(), scan.files, ms);
            return out;
        }
    }

    bool Start(std::function<void(std::string)> done)
    {
        if (g_running.exchange(true)) return false;
        std::thread([done = std::move(done)]() {
            std::string json;
            try {
                json = RunScan();
            } catch (const std::exception& ex) {
                SKSE::log::error("HotkeyScan: failed: {}", ex.what());
            } catch (...) {
                SKSE::log::error("HotkeyScan: failed");
            }
            g_running = false;
            if (!json.empty() && done) done(std::move(json));
        }).detach();
        return true;
    }
}
