// Hotkey Panel - in-game hotkey reference panel
// Copyright (C) 2026 StinkyPumpkin
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without
// even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
// General Public License for more details.
//
// You should have received a copy of the GNU General Public License along with this program. If
// not, see <https://www.gnu.org/licenses/>.

#pragma once

#include <RE/Skyrim.h>
#include <SKSE/SKSE.h>
#include "UIHost.h"
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
    // --Claude 2026-11-20: true for a_ms after a close - the toggle key that closed it from the page (Magelight)
    // must not open it again a moment later in the DLL's own key handler
    bool HiddenWithin(long long a_ms) const;
    // --Claude 2026-11-20: true for a_ms after the panel opened - the press that opened it is no close
    bool ShownWithin(long long a_ms) const;
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

    // --Claude 2026-10-01: a HotkeyScan result (mods' keys found in their config files).
    void SetScannedHotkeys(const std::string& json) { InvokeJS("HKP.setScannedHotkeys(" + json + ")"); }

    // --Claude 2026-11-21: TAB on the open panel - the page closes its top layer (the colour wheel, a menu, Settings
    // ...), or the panel when nothing is open on it. ESC closes the whole panel (HideUI).
    void TabLayer() { InvokeJS("HKP.tabLayer()"); }

    // --Claude 2026-11-20: the user's own key pictures (UserIcons) for the icon picker; false = page not ready.
    bool SetUserIcons(const std::string& json) {
        if (!m_domReady) return false;
        InvokeJS("HKP.setUserIcons(" + json + ")");
        return true;
    }

private:
    PrismaUIBridge() = default;
    ~PrismaUIBridge() = default;
    PrismaUIBridge(const PrismaUIBridge&) = delete;
    PrismaUIBridge& operator=(const PrismaUIBridge&) = delete;

    void RegisterJSListeners();
    static void OnDomReady(UIHost::ViewId view);
    static void OnHostExit();
    void InvokeJS(const std::string& script);
    void PushInitialState();
    std::vector<std::string> m_pendingJS;   // external hotkeys received before DOM ready

    // --Claude 2026-11-20: the page runs in Magelight UI (or PrismaUI as the fallback) through UIHost
    UIHost::ViewId m_view = 0;
    std::atomic<bool> m_visible{false};
    std::atomic<long long> m_hiddenMs{0};
    std::atomic<long long> m_shownMs{0};
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
