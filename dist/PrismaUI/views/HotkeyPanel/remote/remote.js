/* =========================================================================
   Hotkey Panel — tablet / phone remote (--Claude 2026-09-30)

   Loaded ONLY when the DLL serves the panel over the home network: its RemoteServer
   adds this script to index.html on the fly, in front of hkp.js. The in-game view
   never loads it.

   hkp.js talks to the DLL by calling window.<channel>(payload) - functions PrismaUI
   provides in game (see dispatchToBridge). Here the same functions become requests
   to the game, so a tap on a labelled key takes exactly the path an in-game click
   takes. Channels not defined here (toggle key, key picker, text-input gate...) are
   about the in-game panel and are simply dropped.
   ========================================================================= */
(function () {
    'use strict';

    window.HKP_REMOTE = true;

    // This page's id: the server echoes it back with our own saves, so they are not
    // mistaken for changes made in game.
    const ORIGIN = Math.random().toString(36).slice(2, 12);
    let version = -1;     // state version this page shows; -1 = nothing yet
    let shown = false;

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // Per-device settings (this tablet only, never the in-game panel). Storage can be blocked.
    function stored(key, fallback) {
        try { const v = localStorage.getItem('hkpR.' + key); return v === null ? fallback : v; } catch (_) { return fallback; }
    }
    function store(key, value) {
        try { localStorage.setItem('hkpR.' + key, String(value)); } catch (_) {}
    }

    // ---------------------------------------------------------------
    // Labels: this device's own size, and each label shrunk until it fits its key
    // ---------------------------------------------------------------
    const LABEL_MIN = 6;
    let fitQueued = false;

    function overflows(el, box) {
        // Strict on width: a label 1 px too wide is already cut with an ellipsis.
        return el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight + 1 ||
               (box && box.scrollHeight > box.clientHeight + 1);
    }

    function fitLabels() {
        fitQueued = false;
        const base = window.HKP_REMOTE_LABEL.get();
        document.querySelectorAll('.hkp-key-label:not(.hkp-empty), .hkp-m-label').forEach((el) => {
            el.style.fontSize = '';
            el.classList.remove('hkp-r-tiny');
            if (!el.textContent) return;
            const box = el.closest('.hkp-key, .hkp-m-input');
            let size = base;
            while (size > LABEL_MIN && overflows(el, box)) {
                size -= 1;
                el.style.fontSize = size + 'px';
            }
            // Still too long at the smallest size: let a long word break instead of vanishing.
            if (overflows(el, box)) el.classList.add('hkp-r-tiny');
        });
    }

    window.HKP_REMOTE_LABEL = {
        get() { return Math.max(LABEL_MIN, Math.min(36, Number(stored('labelSize', 14)) || 14)); },
        set(val) {
            const sz = Math.max(LABEL_MIN, Math.min(36, Number(val) || 14));
            store('labelSize', sz);
            return sz;
        },
        fit() {
            if (fitQueued) return;
            fitQueued = true;
            requestAnimationFrame(fitLabels);
        }
    };

    function post(path, body) {
        return fetch(path, {
            method: 'POST',
            body: body,
            headers: { 'Content-Type': 'text/plain' },
            cache: 'no-store'
        });
    }

    // ---------------------------------------------------------------
    // Feedback: connection dot, key flash, toast
    // ---------------------------------------------------------------
    let connEl = null;
    let toastEl = null;
    let toastTimer = null;

    function setConn(ok) {
        if (!connEl) return;
        connEl.classList.toggle('hkp-r-off', !ok);
        connEl.textContent = ok ? '● Connected' : '● No game';
        connEl.title = ok ? 'Connected to Skyrim' : 'Skyrim is not reachable - is the game running?';
    }

    function toast(msg) {
        if (!toastEl) return;
        toastEl.textContent = msg;
        toastEl.classList.add('hkp-r-show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('hkp-r-show'), 3500);
    }

    function flash(keyId, ok) {
        document.querySelectorAll('[data-key-id]').forEach((el) => {
            if (el.dataset.keyId !== keyId) return;
            el.classList.remove('hkp-r-ok', 'hkp-r-fail');
            void el.offsetWidth;   // restart the animation on a quick second tap
            el.classList.add(ok ? 'hkp-r-ok' : 'hkp-r-fail');
            setTimeout(() => el.classList.remove('hkp-r-ok', 'hkp-r-fail'), 450);
        });
    }

    // ---------------------------------------------------------------
    // Bridge channels (see dispatchToBridge in hkp.js)
    // ---------------------------------------------------------------
    window.hkpTriggerKey = function (payload) {
        const keyId = String(payload).split('|')[0];
        post('/api/press', payload)
            .then((r) => { flash(keyId, r.ok); setConn(true); })
            .catch(() => { flash(keyId, false); setConn(false); });
    };

    window.hkpSaveState = function (json) {
        post('/api/state?base=' + version + '&origin=' + ORIGIN, json)
            .then((r) => r.json().then((env) => {
                if (r.status === 409) {
                    // The game changed the panel since we last looked; ours was older.
                    apply(env);
                    toast('The panel changed in game meanwhile - reloaded it. Redo your last edit.');
                } else if (r.ok) {
                    version = env.v;
                }
            }))
            .catch(() => { setConn(false); toast('Not saved - the game is not reachable.'); });
    };

    window.hkpMoveHotkey = function (payload) {
        post('/api/move', payload).catch(() => setConn(false));
    };

    // ESC on a hardware keyboard closes the in-game panel; on the tablet it stays up.
    window.hkpCloseUI = function () {
        setTimeout(() => window.HKP.show(), 0);
    };

    // ---------------------------------------------------------------
    // State sync: long-poll the game for changes
    // ---------------------------------------------------------------
    function apply(env) {
        version = env.v;
        if (env.state) window.HKP.loadState(env.state);
        if (!shown) { shown = true; window.HKP.show(); }
        relayout();
    }

    async function poll() {
        for (;;) {
            try {
                const r = await fetch('/api/state?since=' + version, { cache: 'no-store' });
                if (r.status !== 200 && r.status !== 204) throw new Error('HTTP ' + r.status);
                setConn(true);
                if (r.status === 200) {
                    const env = await r.json();
                    if (env.origin === ORIGIN) version = env.v;   // our own save coming back
                    else apply(env);
                }
            } catch (_) {
                setConn(false);
                await sleep(2000);
            }
        }
    }

    function loadGameKeys() {
        fetch('/api/gamekeys', { cache: 'no-store' })
            .then((r) => r.json())
            .then((list) => window.HKP.setGameKeys(list))
            .catch(() => {});
    }

    // ---------------------------------------------------------------
    // Top bar: fold buttons, connection dot, full screen
    // ---------------------------------------------------------------
    function relayout() {
        if (window.HKP.layout) window.HKP.layout();
        window.HKP_REMOTE_LABEL.fit();
    }

    // A section the tablet can fold away so the keyboard gets the room. Remembered on this device.
    function addFold(bar, before, label, bodyClass, key) {
        const btn = document.createElement('button');
        btn.className = 'hkp-topbar-btn';
        btn.textContent = label;
        const sync = () => {
            const shown = !document.body.classList.contains(bodyClass);
            btn.classList.toggle('hkp-r-on', shown);
            btn.title = (shown ? 'Hide ' : 'Show ') + label.toLowerCase();
        };
        document.body.classList.toggle(bodyClass, stored(key, '0') !== '1');
        btn.addEventListener('click', () => {
            const hide = !document.body.classList.contains(bodyClass);
            document.body.classList.toggle(bodyClass, hide);
            store(key, hide ? '0' : '1');
            sync();
            relayout();
        });
        sync();
        bar.insertBefore(btn, before);
    }

    function addTopbarBits() {
        const bar = document.querySelector('.hkp-topbar');
        const settingsBtn = document.getElementById('hkp-btn-settings');
        if (!bar) return;

        addFold(bar, settingsBtn, 'Colours', 'hkp-r-no-swatches', 'swatches');
        addFold(bar, settingsBtn, 'Mouse & profiles', 'hkp-r-no-bottom', 'bottom');

        connEl = document.createElement('div');
        connEl.className = 'hkp-r-conn';
        bar.insertBefore(connEl, settingsBtn);

        const root = document.documentElement;
        if (root.requestFullscreen) {
            const fs = document.createElement('button');
            fs.className = 'hkp-topbar-btn';
            const sync = () => { fs.textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen'; };
            fs.addEventListener('click', () => {
                if (document.fullscreenElement) document.exitFullscreen();
                else root.requestFullscreen().catch(() => {});
            });
            document.addEventListener('fullscreenchange', sync);
            sync();
            bar.insertBefore(fs, settingsBtn);
        }

        toastEl = document.createElement('div');
        toastEl.className = 'hkp-r-toast';
        document.body.appendChild(toastEl);
    }

    // The label-size setting here is this device's own; say so, and let it go smaller.
    function tuneLabelSetting() {
        const slider = document.getElementById('hkp-label-size');
        if (slider) slider.min = String(LABEL_MIN);
        const hint = document.querySelector('#hkp-row-labelsize .hkp-setting-hint');
        if (hint) hint.textContent = 'This tablet only (the game keeps its own size). Labels also shrink by themselves until they fit their key.';
    }

    // 'load' runs after hkp.js has built the keyboard on DOMContentLoaded.
    window.addEventListener('load', () => {
        addTopbarBits();
        tuneLabelSetting();
        setConn(false);
        loadGameKeys();
        poll();
        // Labels change on every edit and state sync: re-fit them whenever the key text does.
        const watch = new MutationObserver(() => window.HKP_REMOTE_LABEL.fit());
        document.querySelectorAll('.hkp-keyboard, #hkp-mouse-stage').forEach((el) =>
            watch.observe(el, { childList: true, subtree: true, characterData: true }));
        // Rotating the tablet: re-fit the keys (HKP.show re-runs the layout).
        window.addEventListener('resize', () => { if (shown) { window.HKP.show(); relayout(); } });
        relayout();
    });
})();
