// Hotkey Panel offline editor (MO2 plugin): the in-game page in a browser on this PC. Loads hotkeys.json from the
// editor server and saves every change straight back to it (only while Skyrim is closed). The panel's in-game place
// and size are kept as they are; the page fills the browser window here.
(function () {
    'use strict';
    let token = '', gameGeom = null, banner = null, toastTimer = null;
    window.HKP_OFFLINE = true;

    function toast(msg, bad) {
        let t = document.getElementById('hkp-offline-toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'hkp-offline-toast';
            t.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:5000;padding:8px 16px;' +
                'border-radius:6px;font:13px "Segoe UI",Arial,sans-serif;background:rgba(17,15,12,.97);border:1px solid rgba(201,170,110,.5);' +
                'color:#ece4d2;box-shadow:0 4px 16px rgba(0,0,0,.6);pointer-events:none';
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.style.borderColor = bad ? '#e0604f' : 'rgba(201,170,110,.5)';
        t.style.display = 'block';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { t.style.display = 'none'; }, bad ? 6000 : 1600);
    }

    function showBanner(path) {
        banner = document.createElement('div');
        banner.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:4500;padding:3px 12px;font:12px "Segoe UI",Arial,sans-serif;' +
            'background:rgba(40,33,20,.95);color:#e8cc8e;border-bottom:1px solid rgba(201,170,110,.4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
        banner.textContent = 'Offline editor - every change saves to ' + path + ' (only while Skyrim is closed).';
        document.body.appendChild(banner);
    }

    window.hkpSaveState = function (json) {
        // the in-game place and size stay what the game saved
        try {
            const s = JSON.parse(json);
            s.settings = s.settings || {};
            s.settings.panelGeom = gameGeom;
            json = JSON.stringify(s);
        } catch (_) { /* send as is */ }
        fetch('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Token': token }, body: json })
            .then(r => r.json())
            .then(r => {
                if (r.ok) { token = r.token; toast('Saved'); }
                else toast(r.error || 'Not saved', true);
            })
            .catch(() => toast('Not saved: the editor is closed (open it again from MO2)', true));
    };
    const gameOnly = (what) => function () { toast(what + ' only works in game'); };
    window.hkpTriggerKey = gameOnly('Firing a key');
    window.hkpMoveHotkey = gameOnly('Moving a mod\'s key');
    window.hkpScanConfigs = function (v) { if (v === 'rescan') toast('Rescanning mod config files only works in game'); };
    window.hkpPickKey = gameOnly('The MCM key picker');
    // Esc / Tab with nothing open close the panel in game; here they leave it up (the page hid itself, which
    // left an empty page). The panel's x closes the editor window - changes are already saved. A normal
    // browser tab may refuse a page closing itself: then the panel comes back and says how.
    window.hkpCloseUI = function () {
        const ev = window.event;
        if (ev && (ev.type === 'keydown' || ev.type === 'keyup')) { setTimeout(() => window.HKP.show(), 0); return; }
        try { window.close(); } catch (_) { /* refused */ }
        setTimeout(() => {
            window.HKP.show();
            toast('Close this tab when you are done - changes are already saved');
        }, 200);
    };

    document.addEventListener('DOMContentLoaded', () => setTimeout(async () => {
        try {
            const st = await (await fetch('/api/state')).json();
            token = st.token || '';
            if (st.state) {
                const s = st.state;
                s.settings = s.settings || {};
                gameGeom = s.settings.panelGeom || null;
                s.settings.panelGeom = null;   // fill the browser window here
                window.HKP.loadState(JSON.stringify(s));
            }
            window.HKP.setGameKeys(await (await fetch('/api/gamekeys')).json());
            window.HKP.setFonts(await (await fetch('/api/fonts')).json());
            // keys from settings files of mods MO2 does not load stay off the panel, as in game
            if (window.HKP.setInstalledNames) window.HKP.setInstalledNames(await (await fetch('/api/installed')).json());
            // the user's own key pictures (Data/SKSE/Plugins/HotkeyPanel/Icons in the enabled mods)
            if (window.HKP.setUserIcons) window.HKP.setUserIcons(await (await fetch('/api/usericons')).json());
            window.HKP.show();
            showBanner(st.path || 'hotkeys.json');
        } catch (e) {
            toast('Could not load hotkeys.json: ' + e, true);
        }
    }, 60));
})();
