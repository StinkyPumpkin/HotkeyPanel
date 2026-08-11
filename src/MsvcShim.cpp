// MsvcShim.cpp — link-time fallback stubs for MSVC STL helpers that current
// cl.exe (14.44.35207 / _MSC_VER 1944) inlines references to from the STL
// headers, but does NOT export from the matching libcpmt.lib. Once VS is
// updated to a build that ships these symbols in the runtime lib, the
// linker will prefer the lib version and these stubs become dead code.
//
// Pattern lifted from FollowerUI-PrismaUI's RegexShim.cpp +
// MainMenuVideo-Claude's msvc_stub.cpp.

#include <cstddef>
#include <cstdint>

extern "C" {

// ---------------------------------------------------------------------------
// __std_regex_transform_primary_char
// Vectorized regex primary-key transform. CommonLibSSE-NG references it
// via <regex> template instantiations triggered by string handling deep
// in the SkyrimVM / Trampoline / etc. translation units.
//
// 19.44 declaration in <regex>: __cdecl, 3-arg
//   size_t __cdecl __std_regex_transform_primary_char(const void*, void*, size_t);
//
// We never expect this to fire — CommonLibSSE doesn't do primary-key regex
// transforms at runtime. A zero return is harmless if it ever does.
// ---------------------------------------------------------------------------
#if _MSC_VER >= 1950
struct _Collvec;  // forward-declare to avoid pulling in <regex>
size_t __stdcall __std_regex_transform_primary_char(
    char*, char*, const char*, const char*, const _Collvec*) noexcept { return 0; }
size_t __stdcall __std_regex_transform_primary_wchar_t(
    wchar_t*, wchar_t*, const wchar_t*, const wchar_t*, const _Collvec*) noexcept { return 0; }
#else
size_t __cdecl __std_regex_transform_primary_char(const void*, void*, size_t) { return 0; }
#endif

// ---------------------------------------------------------------------------
// __std_replace_copy_2
// Vectorized std::replace_copy fast-path for 2-byte (uint16_t / char16_t /
// wchar_t) element ranges. CommonLibSSE-NG pulls in a reference through the
// same template-instantiation chain as the regex helper.
//
// Best-guess signature (based on MS STL naming convention for _N-suffixed
// vector helpers: trailing element-size suffix indicates byte width):
//   void __stdcall __std_replace_copy_2(
//       const uint16_t* first, const uint16_t* last,
//       uint16_t* dest,
//       uint16_t old_val, uint16_t new_val) noexcept;
//
// REMOVED 2026-07-23: libcpmt.lib in the current VS toolchain (MSVC 14.44
// linker era) now SHIPS __std_replace_copy_2, so our stub became a
// multiply-defined symbol (LNK2005) instead of dead code — the "linker will
// prefer the lib version" prediction above was wrong; it errors. The regex
// stub above did NOT collide, so it stays until the lib provides it too.
// ---------------------------------------------------------------------------

}  // extern "C"
