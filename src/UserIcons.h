#pragma once

#include <filesystem>
#include <string>

// --Claude 2026-11-20: the user's own key pictures - PNG, JPG, SVG, WEBP or GIF files in Data/Icons, a folder
// named Icons at the top of a mod (with MO2: best a mod of their own, so an update of the panel never takes
// them away). Folders inside become groups in the panel's icon picker. Files are only read, never changed.
namespace UserIcons
{
    std::filesystem::path Dir();

    // A fingerprint of the folder (names, sizes, times): the panel only gets the pictures again when it changed.
    std::string Signature();

    // The list for the panel: [{"id":"u:<path>","name","group","url"}], <path> relative with forward slashes.
    // dataUrls: each picture rides inside the list as a data: URL (the in-game page - its host may not read
    // files outside the page's own folder); otherwise url = "usericons/<path>" (the tablet server serves those).
    // `count` / `bytes` (optional) get what went in.
    std::string BuildJson(bool dataUrls, int* count = nullptr, std::size_t* bytes = nullptr);

    // One picture by its relative path (forward slashes), only inside the folder and only picture files.
    bool Read(const std::string& rel, std::string& data, std::string& mime);
}
