#pragma once

#include <RE/Skyrim.h>
#include <SKSE/SKSE.h>
#include "PrismaUI_API.h"
#include <string>
#include <atomic>
#include <cstdio>
#include <vector>

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
    bool IsAnyPrismaViewFocused() const;
    void SetPauseOnShow(bool pause) { m_pauseOnShow = pause; }

    // --Claude text-input guard: JS reports focus in/out of any text box via the
    // hkpTextInput listener; while true the input sink must NOT treat ESC/Tab/toggle
    // as panel-close (typing wins). Still returns kStop — the game never sees keys.
    void SetTextInputActive(bool on) { m_textInput.store(on); }
    bool IsTextInputActive() const { return m_textInput.load(); }

    // --Claude 2026-09-28 MCM key picker (PickMode). ShowPick opens the panel over the MCM with
    // the option being bound; the panel stays in pick mode until it closes. While the name/colour
    // dialog is up (pick modal) every key belongs to the panel, like a focused text box.
    bool IsDomReady() const { return m_domReady.load(); }
    void ShowPick(const std::string& a_infoJson);
    bool IsPickActive() const { return m_pickActive.load(); }
    bool IsPickModalOpen() const { return m_pickModal.load(); }
    bool PickEnabled() const { return m_pickEnabled.load(); }
    // --Claude: the same picker over an SKSE Menu Framework window, opened by the toggle key.
    // Bind (or a real key) hands the key to the SMF mods through PickMode::SmfInject.
    void ShowManualPick();
    bool IsPickManual() const { return m_pickManual.load(); }
    // A picker opened in the last second: its own key (a second or bounced F24) is ignored.
    bool PickJustOpened() const;
    void FinishManualPick(std::uint32_t a_code);

    // --Claude console guard (PEM-proven pattern): closes the Console the instant it
    // opens over the visible panel — kStop can't stop it (menu input runs first).
    static void RegisterConsoleGuard();

    // JS → game data
    void SendState(const std::string& json);  // HKP.loadState(...)

    // --Claude 2026-09-23: another mod announced a hotkey (SKSE mod event HKP_SetHotkey,
    // strArg "source|colourIdx|label", numArg DX scan code, 0 = remove). Forwarded to
    // HKP.setExternalHotkey; queued until the view's DOM (and saved state) is ready.
    void ApplyExternalHotkey(std::uint32_t dik, const std::string& strArg);

    // --Claude 2026-09-30: tablet remote status for the Settings row (RemoteServer's status JSON).
    void SetRemoteInfo(const std::string& json) { InvokeJS("HKP.setRemoteInfo(" + json + ")"); }

private:
    PrismaUIBridge() = default;
    ~PrismaUIBridge() = default;
    PrismaUIBridge(const PrismaUIBridge&) = delete;
    PrismaUIBridge& operator=(const PrismaUIBridge&) = delete;

    void RegisterJSListeners();
    void InvokeJS(const std::string& script);
    void PushInitialState();
    std::vector<std::string> m_pendingJS;   // external hotkeys received before DOM ready

    PRISMA_UI_API::IVPrismaUI2* m_api = nullptr;
    PrismaView m_view = 0;
    bool m_ready = false;
    std::atomic<bool> m_domReady{false};
    std::atomic<bool> m_initialStateSent{false};
    std::atomic<bool> m_textInput{false};
    std::atomic<bool> m_pickActive{false};
    std::atomic<bool> m_pickModal{false};
    std::atomic<bool> m_pickEnabled{true};   // settings.pickMode, pushed by the panel
    std::atomic<bool> m_pickManual{false};   // picker is over an SKSE Menu Framework window
    std::atomic<long long> m_pickOpenedMs{0}; // steady-clock ms when a picker opened
    bool m_pauseOnShow = true;
};
