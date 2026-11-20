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
    // --Claude 2026-11-20: held upright, the arrows and numpad go under the main keys (remote.css)
    function syncOrientation() {
        document.body.classList.toggle('hkp-r-portrait', window.innerHeight > window.innerWidth * 1.05);
    }

    function relayout() {
        syncOrientation();
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

    // ---------------------------------------------------------------
    // Screen care (--Claude 2026-11-20): a tablet that shows the panel all day must not keep the same
    // bright picture in the same pixels for hours (OLED burn-in). Every minute the whole panel moves a
    // few pixels around a small ring, and after a while with no touch a black layer dims it. The layer
    // takes no touches: a tap on a key while it is dim fires that key at once and lights the screen up.
    // Where the browser allows it (a secure address), Wake Lock keeps the screen from going off.
    // All this tablet's own (localStorage), like the label size.
    // ---------------------------------------------------------------
    const SHIFT_RING = [[0, 0], [2, -2], [3, 0], [2, 2], [0, 3], [-2, 2], [-3, 0], [-2, -2], [0, -3]];
    const SHIFT_EVERY_MS = 60000;
    const DIM_AFTER = [[30, '30 s'], [60, '1 min'], [120, '2 min'], [300, '5 min'], [900, '15 min'], [0, 'Never']];
    const DIM_TO = [[60, '60%'], [40, '40%'], [25, '25%'], [10, '10%']];
    const care = {
        shift: stored('careShift', '1') !== '0',
        dimAfter: Number(stored('careDimAfter', 60)),
        dimTo: Number(stored('careDimTo', 40))
    };
    let shiftStep = 0, lastTouch = Date.now(), dimmed = false, dimEl = null, wakeLock = null;

    function applyShift() {
        const [x, y] = care.shift ? SHIFT_RING[shiftStep % SHIFT_RING.length] : [0, 0];
        document.documentElement.style.setProperty('--hkp-r-sx', x + 'px');
        document.documentElement.style.setProperty('--hkp-r-sy', y + 'px');
    }
    function setDim(on) {
        if (!dimEl || dimmed === on) return;
        dimmed = on;
        dimEl.classList.toggle('hkp-r-wake', !on);
        dimEl.style.opacity = on ? String(1 - care.dimTo / 100) : '0';
    }
    function touched() {
        lastTouch = Date.now();
        setDim(false);
        holdScreen();
    }
    async function holdScreen() {
        if (wakeLock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => { wakeLock = null; });
        } catch (_) { wakeLock = null; }
    }
    function careStatus() {
        const el = document.getElementById('hkp-r-care-status');
        if (!el) return;
        el.textContent = ('wakeLock' in navigator)
            ? 'This browser keeps the screen on while the panel is open.'
            : 'This browser cannot keep the screen on from a home-network address: set the tablet\'s screen timeout to the longest it has (or Never).';
    }
    function startScreenCare() {
        dimEl = document.createElement('div');
        dimEl.id = 'hkp-r-dim';
        document.body.appendChild(dimEl);
        document.body.classList.toggle('hkp-r-shift', care.shift);
        applyShift();
        // capture: before the panel's own handlers, so a tap always counts
        for (const ev of ['pointerdown', 'touchstart', 'keydown', 'wheel'])
            document.addEventListener(ev, touched, { capture: true, passive: true });
        document.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') touched(); }, { capture: true, passive: true });
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') touched(); });
        setInterval(() => { if (care.shift) { shiftStep++; applyShift(); } }, SHIFT_EVERY_MS);
        setInterval(() => {
            if (care.dimAfter > 0 && Date.now() - lastTouch > care.dimAfter * 1000) setDim(true);
        }, 1000);
        holdScreen();
    }
    function careSelect(id, options, value, onChange) {
        const sel = document.createElement('select');
        sel.id = id;
        sel.className = 'hkp-r-select';
        for (const [v, label] of options) {
            const o = document.createElement('option');
            o.value = String(v);
            o.textContent = label;
            sel.appendChild(o);
        }
        sel.value = String(value);
        if (sel.value !== String(value)) sel.value = String(options[1][0]);
        sel.addEventListener('change', () => onChange(Number(sel.value)));
        return sel;
    }
    function addCareSetting() {
        const after = document.getElementById('hkp-row-labelsize');
        if (!after) return;
        const row = document.createElement('div');
        row.className = 'hkp-setting-row';
        row.id = 'hkp-row-care';
        row.innerHTML =
            '<div class="hkp-setting-label">Screen care (this tablet)' +
            '<div class="hkp-setting-hint">For a screen that stays on all the time: the panel moves a few pixels every minute, ' +
            'and dims when nobody has touched it for a while. A tap still fires its key while dim, and lights the screen up again.</div>' +
            '<div class="hkp-setting-hint hkp-remote-status" id="hkp-r-care-status"></div></div>' +
            '<div class="hkp-setting-control"></div>';
        const ctl = row.querySelector('.hkp-setting-control');
        const shift = document.createElement('label');
        shift.className = 'hkp-check';
        shift.innerHTML = '<input type="checkbox" id="hkp-r-shift"><span>Move a little</span>';
        const box = shift.querySelector('input');
        box.checked = care.shift;
        box.addEventListener('change', () => {
            care.shift = box.checked;
            store('careShift', care.shift ? '1' : '0');
            document.body.classList.toggle('hkp-r-shift', care.shift);
            applyShift();
            relayout();
        });
        const label = (text, el) => {
            const l = document.createElement('label');
            l.className = 'hkp-check';
            const s = document.createElement('span');
            s.textContent = text;
            l.append(s, el);
            return l;
        };
        ctl.append(shift,
            label('Dim after', careSelect('hkp-r-dimafter', DIM_AFTER, care.dimAfter, (v) => { care.dimAfter = v; store('careDimAfter', v); touched(); })),
            label('Dim to', careSelect('hkp-r-dimto', DIM_TO, care.dimTo, (v) => { care.dimTo = v; store('careDimTo', v); touched(); })));
        after.after(row);
        careStatus();
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
        addCareSetting();
        startScreenCare();
        setConn(false);
        loadGameKeys();
        poll();
        // Labels change on every edit and state sync: re-fit them whenever the key text does.
        const watch = new MutationObserver(() => window.HKP_REMOTE_LABEL.fit());
        document.querySelectorAll('.hkp-keyboard, #hkp-mouse-stage').forEach((el) =>
            watch.observe(el, { childList: true, subtree: true, characterData: true }));
        // Rotating the tablet: re-fit the keys (HKP.show re-runs the layout).
        window.addEventListener('resize', () => { syncOrientation(); if (shown) { window.HKP.show(); relayout(); } });
        syncOrientation();
        relayout();
    });
})();
