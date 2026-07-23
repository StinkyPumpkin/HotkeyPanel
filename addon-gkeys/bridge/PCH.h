#pragma once

#include "RE/Skyrim.h"
#include "SKSE/SKSE.h"

#if FMT_VERSION >= 100000
template <>
struct fmt::formatter<RE::BSFixedString> : fmt::formatter<std::string_view> {
    auto format(const RE::BSFixedString& s, fmt::format_context& ctx) const {
        return fmt::formatter<std::string_view>::format(s.c_str() ? s.c_str() : "", ctx);
    }
};
#endif

using namespace std::literals;
