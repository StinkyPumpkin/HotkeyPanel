#pragma once

#include <RE/Skyrim.h>
#include <SKSE/SKSE.h>
#include "PrismaUI_API.h"
#include <string>
#include <atomic>

class PrismaUIBridge {
public:
    static PrismaUIBridge* GetSingleton();

    bool Initialize();
    void Shutdown();
    bool IsReady() const { return m_ready; }

    // View management
    void ShowUI();
    void HideUI();
    void ToggleUI();
    bool IsVisible() const;
    void SetPauseOnShow(bool pause) { m_pauseOnShow = pause; }

    // JS → game data
    void SendState(const std::string& json);  // HKP.loadState(...)

private:
    PrismaUIBridge() = default;
    ~PrismaUIBridge() = default;
    PrismaUIBridge(const PrismaUIBridge&) = delete;
    PrismaUIBridge& operator=(const PrismaUIBridge&) = delete;

    void RegisterJSListeners();
    void InvokeJS(const std::string& script);
    void PushInitialState();

    PRISMA_UI_API::IVPrismaUI2* m_api = nullptr;
    PrismaView m_view = 0;
    bool m_ready = false;
    std::atomic<bool> m_domReady{false};
    std::atomic<bool> m_initialStateSent{false};
    bool m_pauseOnShow = true;
};
