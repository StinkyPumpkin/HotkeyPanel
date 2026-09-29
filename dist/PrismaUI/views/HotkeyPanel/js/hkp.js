/* =========================================================================
   Hotkey Panel — UI logic
   ========================================================================= */
(function () {
    'use strict';

    // --Claude 2026-09-30: true when this page runs on a tablet / phone (remote/remote.js, served
    // by the DLL's RemoteServer) instead of in game. A tap fires a key there - see onKeyClick.
    const REMOTE = !!window.HKP_REMOTE;

    // ---------------------------------------------------------------
    // Layout data (main / nav / numpad / mouse)
    // Each main-row key: [keyId, caption, widthU?]  where widthU defaults to 1.
    // Gaps inside a main row: ['_gap', widthU]
    // Nav rows: array of 3 cells, each [keyId, caption] or null for empty slot.
    // Numpad: [keyId, caption, col, row, colSpan, rowSpan]  (1-indexed, span defaults 1)
    // ---------------------------------------------------------------
    const KB_MAIN = [
        // Row 0 — Function row (Esc, F1–F12, groups with spacers)
        [
            ['Escape', 'Esc'], ['_gap', 1],
            ['F1', 'F1'], ['F2', 'F2'], ['F3', 'F3'], ['F4', 'F4'], ['_gap', 0.5],
            ['F5', 'F5'], ['F6', 'F6'], ['F7', 'F7'], ['F8', 'F8'], ['_gap', 0.5],
            ['F9', 'F9'], ['F10', 'F10'], ['F11', 'F11'], ['F12', 'F12']
        ],
        // Row 1 — Number row
        [
            ['Backquote', '`'],
            ['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'],
            ['Digit5', '5'], ['Digit6', '6'], ['Digit7', '7'], ['Digit8', '8'],
            ['Digit9', '9'], ['Digit0', '0'],
            ['Minus', '-'], ['Equal', '='],
            ['Backspace', 'Backspace', 2]
        ],
        // Row 2 — QWERTY
        [
            ['Tab', 'Tab', 1.5],
            ['KeyQ', 'Q'], ['KeyW', 'W'], ['KeyE', 'E'], ['KeyR', 'R'], ['KeyT', 'T'],
            ['KeyY', 'Y'], ['KeyU', 'U'], ['KeyI', 'I'], ['KeyO', 'O'], ['KeyP', 'P'],
            ['BracketLeft', '['], ['BracketRight', ']'],
            ['Backslash', '\\', 1.5]
        ],
        // Row 3 — ASDF
        [
            ['CapsLock', 'Caps', 1.75],
            ['KeyA', 'A'], ['KeyS', 'S'], ['KeyD', 'D'], ['KeyF', 'F'], ['KeyG', 'G'],
            ['KeyH', 'H'], ['KeyJ', 'J'], ['KeyK', 'K'], ['KeyL', 'L'],
            ['Semicolon', ';'], ['Quote', "'"],
            ['Enter', 'Enter', 2.25]
        ],
        // Row 4 — ZXCV
        [
            ['ShiftLeft', 'Shift', 2.25],
            ['KeyZ', 'Z'], ['KeyX', 'X'], ['KeyC', 'C'], ['KeyV', 'V'], ['KeyB', 'B'],
            ['KeyN', 'N'], ['KeyM', 'M'],
            ['Comma', ','], ['Period', '.'], ['Slash', '/'],
            ['ShiftRight', 'Shift', 2.75]
        ],
        // Row 5 — Bottom
        [
            ['ControlLeft', 'Ctrl', 1.25],
            ['MetaLeft', 'Win', 1.25],
            ['AltLeft', 'Alt', 1.25],
            ['Space', '', 6.25],
            ['AltRight', 'Alt', 1.25],
            ['MetaRight', 'Win', 1.25],
            ['ContextMenu', 'Menu', 1.25],
            ['ControlRight', 'Ctrl', 1.25]
        ]
    ];

    // 6 rows × 3 columns
    const KB_NAV = [
        [['PrintScreen', 'PrtSc'], ['ScrollLock', 'ScrLk'], ['Pause', 'Pause']],
        [['Insert', 'Ins'],        ['Home', 'Home'],         ['PageUp', 'PgUp']],
        [['Delete', 'Del'],        ['End', 'End'],           ['PageDown', 'PgDn']],
        [null, null, null],
        [null,                     ['ArrowUp', '↑'],         null],
        [['ArrowLeft', '←'],       ['ArrowDown', '↓'],       ['ArrowRight', '→']]
    ];

    // keyId, caption, col, row, colSpan, rowSpan
    const KB_NUMPAD = [
        ['NumLock',        'NumLk', 1, 1, 1, 1],
        ['NumpadDivide',   '/',     2, 1, 1, 1],
        ['NumpadMultiply', '*',     3, 1, 1, 1],
        ['NumpadSubtract', '-',     4, 1, 1, 1],
        ['Numpad7',        '7',     1, 2, 1, 1],
        ['Numpad8',        '8',     2, 2, 1, 1],
        ['Numpad9',        '9',     3, 2, 1, 1],
        ['NumpadAdd',      '+',     4, 2, 1, 2],
        ['Numpad4',        '4',     1, 3, 1, 1],
        ['Numpad5',        '5',     2, 3, 1, 1],
        ['Numpad6',        '6',     3, 3, 1, 1],
        ['Numpad1',        '1',     1, 4, 1, 1],
        ['Numpad2',        '2',     2, 4, 1, 1],
        ['Numpad3',        '3',     3, 4, 1, 1],
        ['NumpadEnter',    'Ent',   4, 4, 1, 2],
        ['Numpad0',        '0',     1, 5, 2, 1],
        ['NumpadDecimal',  '.',     3, 5, 1, 1]
    ];

    // 11 buttons. [keyId, placeholder, xPercent, yPercent] — spread to ~14% apart so boxes never touch
    // Generic mouse layout — captions are anatomical (position-based), NOT
    // user actions. Users add their own labels via the right-click menu.
    // Side buttons numbered 1–3 per side; matches G903/G502/MX Master style
    // gaming mice but the user can repurpose them for any multi-button mouse.
    const MOUSE = [
        ['Mouse1',           'Left Click',     12.9, 19.0],
        ['MouseTiltLeft',    'Tilt Left',      11.5, 33.0],
        ['MouseSideLeft1',   'Side L1',        10.5, 47.0],
        ['MouseSideLeft2',   'Side L2',        10.5, 61.0],
        ['MouseSideLeft3',   'Side L3',        10.5, 75.0],
        ['Mouse3',           'Middle Click',   50.8,  8.0],
        ['Mouse2',           'Right Click',    86.0, 19.0],
        ['MouseTiltRight',   'Tilt Right',     88.5, 33.0],
        ['MouseSideRight1',  'Side R1',        89.5, 47.0],
        ['MouseSideRight2',  'Side R2',        89.5, 61.0],
        ['MouseSideRight3',  'Side R3',        89.5, 75.0]
    ];

    const KEY_CAPTION = {};

    const PALETTE = [
        { idx: 0,  hex: null,      lum: 'dark' },
        { idx: 1,  hex: '#b84a3a', lum: 'dark' },
        { idx: 2,  hex: '#c78a3a', lum: 'dark' },
        { idx: 3,  hex: '#d0b845', lum: 'light' },
        { idx: 4,  hex: '#6a9a4a', lum: 'dark' },
        { idx: 5,  hex: '#4a8a9a', lum: 'dark' },
        { idx: 6,  hex: '#4a6ab8', lum: 'dark' },
        { idx: 7,  hex: '#8a5aa8', lum: 'dark' },
        { idx: 8,  hex: '#b85a8a', lum: 'dark' },
        { idx: 9,  hex: '#7a6a5a', lum: 'dark' },
        { idx: 10, hex: '#4a4a55', lum: 'dark' },
        // --Claude: 16 extra colours, APPENDED so saved colorIdx 1-10 stay valid.
        // Deliberately loud (neons + pastels) so they don't blur into the muted originals.
        { idx: 11, hex: '#FF3131', lum: 'dark' },   // neon red
        { idx: 12, hex: '#FF7A00', lum: 'light' },  // bright orange
        { idx: 13, hex: '#FFD700', lum: 'light' },  // gold
        { idx: 14, hex: '#39FF14', lum: 'light' },  // neon green
        { idx: 15, hex: '#00FFC8', lum: 'light' },  // mint
        { idx: 16, hex: '#00BFFF', lum: 'light' },  // sky blue
        { idx: 17, hex: '#1E5AFF', lum: 'dark' },   // electric blue
        { idx: 18, hex: '#B026FF', lum: 'dark' },   // electric purple
        { idx: 19, hex: '#FF10F0', lum: 'dark' },   // neon magenta
        { idx: 20, hex: '#FF9ECD', lum: 'light' },  // pastel pink
        { idx: 21, hex: '#FF6F61', lum: 'dark' },   // coral
        { idx: 22, hex: '#40E0D0', lum: 'light' },  // turquoise
        { idx: 23, hex: '#C0FF72', lum: 'light' },  // lime pastel
        { idx: 24, hex: '#F5F5DC', lum: 'light' },  // cream
        { idx: 25, hex: '#E6E6FA', lum: 'light' },  // lavender
        { idx: 26, hex: '#FFFFFF', lum: 'light' }   // white
    ];

    const DEFAULT_STATE = {
        version: 1,
        settings: {
            toggleKey: 'F11',
            toggleKeyEnabled: true,
            labelFontSize: 18,
            panelScale: 100,    // percent, 12..100
            panelOpacity: 100,  // percent, 20..100
            fontFamily: '',     // --Claude: '' = default EB Garamond stack
            pickMode: true,     // --Claude: open over an MCM that asks for a key (MCM key picker)
            remoteEnabled: false, // --Claude 2026-09-30: serve the panel to a tablet on the home network
            remotePort: 8950
        },
        profiles: [{ name: 'DEFAULT', system: true }],
        activeProfile: 'DEFAULT',
        modifierKeys: [],
        activeModifiers: [],
        activeTapMode: 'single',    // 'single' | 'double' | 'long'
        keys: {},
        // --Claude hotkey hub: keys other mods own, one entry per source id (see setExternalHotkey).
        // { [source]: { key: 'KeyG', label, color, move } }; extCustom holds the user's own
        // name/colour for a source so they survive the owner re-announcing its keys.
        external: {},
        extCustom: {}
    };

    const TAP_MODES = ['single', 'double', 'long'];
    const TAP_LABEL = { single: 'Single', double: 'Double', long: 'Long' };

    let state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    let colorMode = null;
    let pendingEditKey = null;
    let pendingEditLayer = null;
    let pendingEditSource = null;   // renaming a mod's key instead of a panel label
    let pendingProfileCallback = null;
    let pendingConfirmCallback = null;
    let bindingToggleKey = false;
    let saveDebounce = null;
    let activeTooltip = null;
    let settingsOpen = false;
    let extByKey = {};        // keyId -> [[source, entry], ...], rebuilt by refreshAll
    let gameKeys = {};        // keyId -> ['Activate', ...] vanilla gameplay binds, from the DLL
    let moveMode = null;      // { source, label } while picking a new key for a mod's hotkey
    let pendingMove = null;   // { source, code, label, timer } until the owner answers
    let statusMsg = null;     // short message in the swatch bar
    let statusTimer = null;
    // --Claude 2026-09-28 MCM key picker: pick = { mod, option, current } while an MCM waits for a
    // key; pickModal = { keyId, dik, layer, color } while the name/colour dialog is up; pendingPick =
    // the name/colour to give the MCM's key once MCM Unlocked announces the new binding.
    let pick = null;
    let pickModal = null;
    let pendingPick = null;

    // ---------------------------------------------------------------
    // Bootstrap
    // ---------------------------------------------------------------
    document.addEventListener('DOMContentLoaded', () => {
        buildKeyCaptions();
        renderKeyboard();
        renderMouse();
        buildGKeys();
        renderProfiles();
        renderSwatches();
        attachGlobalHandlers();
        updateModifierBadge();
        applyTapModeBg();
        applyLabelSize();
        applyPanelScale();
        applyPanelOpacity();
        updateSwatchBarLabel();
        layoutKeyboard();
        refreshAll();
        dispatchToBridge('hkpReady', '1');
        // First-run bootstrap: tell the DLL the default toggle key even before
        // any saved state arrives. loadState() will push it again later if a
        // file exists; the values are idempotent.
        pushToggleKeyToDLL();
    });

    // Send the persisted toggle key + enabled flag to the C++ InputHandler.
    function pushToggleKeyToDLL() {
        const enabled = state.settings.toggleKeyEnabled ? '1' : '0';
        const key = state.settings.toggleKey || 'F11';
        dispatchToBridge('hkpSetToggleKey', enabled + '|' + key);
        dispatchToBridge('hkpSetPickMode', state.settings.pickMode === false ? '0' : '1');
        pushRemoteToDLL();
    }

    // Fit keyboard to available width/height of its container. Profiles sidebar now
    // lives under the keyboard (in .hkp-bottom), so keyboard spans full main width.
    // Keyboard total = 22u + 21*gap(4) + 2*section-gap(12) = 22u + 108
    // Vertical: 6 rows + 5 gaps = 6u + 20
    function layoutKeyboard() {
        const kb = document.querySelector('.hkp-keyboard');
        const main = document.querySelector('.hkp-main');
        if (!kb || !main || kb.offsetWidth === 0) return;
        const kbCs = getComputedStyle(kb);
        const kbPadX = parseFloat(kbCs.paddingLeft) + parseFloat(kbCs.paddingRight);
        const availW = kb.clientWidth - kbPadX;
        // Give keyboard up to half the main vertical space
        const mainCs = getComputedStyle(main);
        const mainPadY = parseFloat(mainCs.paddingTop) + parseFloat(mainCs.paddingBottom);
        const gap = parseFloat(mainCs.gap) || 0;
        // Keyboard gets the majority of the vertical; mouse capped to 40vh via CSS.
        const mainInner = main.clientHeight - mainPadY - gap;
        const kbMaxH = mainInner * 0.62;
        const kbPadY = parseFloat(kbCs.paddingTop) + parseFloat(kbCs.paddingBottom);
        const availH = kbMaxH - kbPadY;
        const uW = Math.floor((availW - 108) / 22);
        const uH = Math.floor((availH - 20) / 6);
        const u = Math.max(40, Math.min(180, Math.min(uW, uH)));
        document.documentElement.style.setProperty('--hkp-u', u + 'px');
        document.documentElement.style.setProperty('--hkp-key-h', u + 'px');
    }

    window.addEventListener('resize', layoutKeyboard);

    function buildKeyCaptions() {
        for (const row of KB_MAIN) for (const cell of row) if (cell && cell[0] !== '_gap') KEY_CAPTION[cell[0]] = cell[1];
        for (const row of KB_NAV)  for (const cell of row) if (cell) KEY_CAPTION[cell[0]] = cell[1];
        for (const np of KB_NUMPAD) KEY_CAPTION[np[0]] = np[1];
        for (const m of MOUSE) KEY_CAPTION[m[0]] = m[1];
    }

    // ---------------------------------------------------------------
    // Keyboard rendering
    // ---------------------------------------------------------------
    function renderKeyboard() {
        // Main section
        const main = document.getElementById('hkp-kb-main');
        main.innerHTML = '';
        KB_MAIN.forEach(row => {
            const rEl = document.createElement('div');
            rEl.className = 'hkp-row';
            row.forEach(cell => {
                if (cell[0] === '_gap') {
                    const g = document.createElement('div');
                    g.className = 'hkp-row-gap';
                    g.style.width = `calc(var(--hkp-u) * ${cell[1]})`;
                    rEl.appendChild(g);
                } else {
                    rEl.appendChild(makeKeyEl(cell[0], cell[1], cell[2]));
                }
            });
            main.appendChild(rEl);
        });

        // Nav section
        const nav = document.getElementById('hkp-kb-nav');
        nav.innerHTML = '';
        KB_NAV.forEach(row => {
            row.forEach(cell => {
                if (cell === null) {
                    const empty = document.createElement('div');
                    empty.className = 'hkp-nav-empty';
                    nav.appendChild(empty);
                } else {
                    nav.appendChild(makeKeyEl(cell[0], cell[1], null));
                }
            });
        });

        // Numpad section (CSS grid)
        const np = document.getElementById('hkp-kb-numpad');
        np.innerHTML = '';
        KB_NUMPAD.forEach(([kid, cap, col, row, cs, rs]) => {
            const el = makeKeyEl(kid, cap, null);
            el.style.gridColumn = `${col} / span ${cs}`;
            el.style.gridRow = `${row} / span ${rs}`;
            if (rs > 1) el.style.height = `calc(${rs} * var(--hkp-key-h) + ${rs - 1} * var(--hkp-key-gap))`;
            if (cs > 1) el.style.width = `calc(${cs} * var(--hkp-u) + ${cs - 1} * var(--hkp-key-gap))`;
            np.appendChild(el);
        });
    }

    function makeKeyEl(keyId, caption, widthU) {
        const el = document.createElement('div');
        el.className = 'hkp-key';
        el.dataset.keyId = keyId;
        if (widthU) el.dataset.w = String(widthU);
        const cap = document.createElement('div');
        cap.className = 'hkp-key-cap';
        cap.textContent = caption;
        el.appendChild(cap);
        const lbl = document.createElement('div');
        lbl.className = 'hkp-key-label hkp-empty';
        el.appendChild(lbl);
        el.addEventListener('click', () => onKeyClick(keyId, el));
        el.addEventListener('mouseleave', cancelHold);
        el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); onKeyContext(keyId, el, e); });
        // PrismaUI may swallow contextmenu — also catch right-click via mousedown button=2
        el.addEventListener('mousedown', (e) => {
            // --Claude 2026-09-15: left button starts the hold-to-fire sweep.
            if (e.button === 0) { startHold(keyId, el); }
            if (e.button === 2) { e.preventDefault(); e.stopPropagation(); onKeyContext(keyId, el, e); }
        });
        attachLongPress(el, keyId);
        el.addEventListener('mouseenter', (e) => maybeShowTooltip(keyId, el, e));
        el.addEventListener('mouseleave', hideTooltip);
        return el;
    }

    // Long-press (hold 450ms) as a fallback for right-click in case PrismaUI
    // swallows the contextmenu event.
    function attachLongPress(el, keyId) {
        let timer = null;
        let startX = 0, startY = 0;
        let fired = false;
        el.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            fired = false;
            startX = e.clientX; startY = e.clientY;
            timer = setTimeout(() => {
                fired = true;
                onKeyContext(keyId, el, { clientX: startX, clientY: startY, preventDefault: () => {} });
            }, 450);
        });
        const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
        el.addEventListener('mouseup', cancel);
        el.addEventListener('mouseleave', cancel);
        el.addEventListener('mousemove', (e) => {
            if (!timer) return;
            if (Math.hypot(e.clientX - startX, e.clientY - startY) > 6) cancel();
        });
        el.addEventListener('click', (e) => {
            if (fired) { e.stopPropagation(); e.preventDefault(); fired = false; }
        }, true);
    }

    // ---------------------------------------------------------------
    // --Claude G-keys add-on: optional extra key column left of the mouse.
    // The main mod ships js/gkeys.js as a null stub; the personal
    // "HKP GKeys Addon" mod folder overrides that file with
    // window.HKP_GKEYS = [{id:'F19',cap:'G1'}, ...]. The keys behave exactly
    // like keyboard keys (labels, colours, profiles, modifiers, tap modes) —
    // with the stub in place the column simply stays hidden.
    // ---------------------------------------------------------------
    function buildGKeys() {
        const wrap = document.getElementById('hkp-gkeys');
        if (!wrap) return;
        const defs = window.HKP_GKEYS;
        if (!Array.isArray(defs) || !defs.length) { wrap.classList.add('hkp-hidden'); return; }
        wrap.innerHTML = '';
        defs.forEach(d => wrap.appendChild(makeKeyEl(d.id, d.cap, null)));
        wrap.classList.remove('hkp-hidden');
    }

    // ---------------------------------------------------------------
    // Mouse rendering (inputs + state rules shared with keys)
    // ---------------------------------------------------------------
    function renderMouse() {
        const stage = document.getElementById('hkp-mouse-stage');
        stage.innerHTML = '';
        MOUSE.forEach(([kid, placeholder, x, y]) => {
            stage.appendChild(makeMouseInput(kid, placeholder, x, y));
        });
    }

    function makeMouseInput(keyId, placeholder, xPct, yPct) {
        const el = document.createElement('div');
        el.className = 'hkp-m-input';
        el.dataset.keyId = keyId;
        el.style.left = xPct + '%';
        el.style.top = yPct + '%';

        const lbl = document.createElement('div');
        lbl.className = 'hkp-m-label hkp-empty';
        el.appendChild(lbl);

        el.addEventListener('click', () => onKeyClick(keyId, el));
        el.addEventListener('mouseleave', cancelHold);
        el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); onKeyContext(keyId, el, e); });
        el.addEventListener('mousedown', (e) => {
            // --Claude 2026-09-15: left button starts the hold-to-fire sweep.
            if (e.button === 0) { startHold(keyId, el); }
            if (e.button === 2) { e.preventDefault(); e.stopPropagation(); onKeyContext(keyId, el, e); }
        });
        attachLongPress(el, keyId);
        el.addEventListener('mouseenter', (e) => maybeShowMouseTooltip(el, e));
        el.addEventListener('mouseleave', hideTooltip);
        return el;
    }

    function maybeShowMouseTooltip(el, evt) {
        if (showConflictTooltip(el)) return;
        const lbl = el.querySelector('.hkp-m-label');
        if (!lbl || !lbl.textContent) return;
        if (lbl.scrollHeight <= lbl.clientHeight + 2 && lbl.scrollWidth <= lbl.clientWidth + 2) return;
        hideTooltip();
        const t = document.createElement('div');
        t.className = 'hkp-tooltip';
        t.textContent = lbl.textContent;
        document.body.appendChild(t);
        const r = el.getBoundingClientRect();
        t.style.left = (r.left + r.width / 2 - 160) + 'px';
        t.style.top = (r.bottom + 6) + 'px';
        activeTooltip = t;
    }

    // ---------------------------------------------------------------
    // Refresh (apply state → DOM for all keys + mouse inputs)
    // ---------------------------------------------------------------
    function refreshAll() {
        rebuildExtIndex();
        const activeLayer = currentLayerId();
        const activeProf = state.activeProfile;
        document.querySelectorAll('.hkp-key').forEach(el => applyKeyVisual(el, activeLayer, activeProf));
        document.querySelectorAll('.hkp-m-input').forEach(el => applyMouseVisual(el, activeLayer, activeProf));
        if (moveMode) markMoveTargets();
    }

    function applyKeyVisual(el, activeLayer, activeProf) {
        const keyId = el.dataset.keyId;
        const reserved = isReservedKey(keyId);
        const isMod = state.modifierKeys.includes(keyId);
        const keyData = viewLayer(keyId, activeLayer);
        setConflictBadge(el, conflictOwners(keyId));
        el.classList.toggle('hkp-reserved', reserved);
        el.classList.toggle('hkp-is-modifier', isMod);
        el.classList.toggle('hkp-mod-active', isMod && state.activeModifiers.includes(keyId));

        const dim = activeProf !== 'DEFAULT' && !reserved &&
                    !(keyData && keyData.profiles && keyData.profiles.includes(activeProf));
        el.classList.toggle('hkp-dim', dim);

        const lbl = el.querySelector('.hkp-key-label');
        if (reserved) {
            lbl.textContent = 'Hotkeys';
            lbl.classList.remove('hkp-empty');
            el.dataset.color = '0';
            delete el.dataset.lum;
            return;
        }
        if (keyData && keyData.label) { lbl.textContent = keyData.label; lbl.classList.remove('hkp-empty'); }
        else { lbl.textContent = ''; lbl.classList.add('hkp-empty'); }
        const colorIdx = resolveColor(keyData, activeProf);
        el.dataset.color = String(colorIdx);
        const p = PALETTE[colorIdx];
        if (p && p.lum === 'light') el.dataset.lum = 'light'; else delete el.dataset.lum;
    }

    // Per-profile colour resolution:
    // - DEFAULT profile (or key not in any profile): use .color
    // - Non-default profile: use .profileColors[profile] if set, else fall back to .color
    function resolveColor(keyData, activeProf) {
        if (!keyData) return 0;
        if (activeProf && activeProf !== 'DEFAULT'
            && keyData.profileColors
            && keyData.profileColors[activeProf] != null) {
            return keyData.profileColors[activeProf];
        }
        return keyData.color || 0;
    }

    function applyMouseVisual(el, activeLayer, activeProf) {
        const keyId = el.dataset.keyId;
        const isMod = state.modifierKeys.includes(keyId);
        const keyData = viewLayer(keyId, activeLayer);
        setConflictBadge(el, conflictOwners(keyId));

        el.classList.toggle('hkp-is-modifier', isMod);
        el.classList.toggle('hkp-mod-active', isMod && state.activeModifiers.includes(keyId));

        const dim = activeProf !== 'DEFAULT' &&
                    !(keyData && keyData.profiles && keyData.profiles.includes(activeProf));
        el.classList.toggle('hkp-dim', dim);

        const lbl = el.querySelector('.hkp-m-label');
        if (keyData && keyData.label) { lbl.textContent = keyData.label; lbl.classList.remove('hkp-empty'); }
        else { lbl.textContent = ''; lbl.classList.add('hkp-empty'); }

        const colorIdx = resolveColor(keyData, activeProf);
        el.dataset.color = String(colorIdx);
        const p = PALETTE[colorIdx];
        if (p && p.lum === 'light') el.dataset.lum = 'light'; else delete el.dataset.lum;
    }

    // ---------------------------------------------------------------
    // Profile list
    // ---------------------------------------------------------------
    function renderProfiles() {
        const list = document.getElementById('hkp-profile-list');
        list.innerHTML = '';
        for (const p of state.profiles) {
            const item = document.createElement('div');
            item.className = 'hkp-profile-item';
            if (p.name === state.activeProfile) item.classList.add('active');
            item.textContent = p.name;
            item.onclick = () => selectProfile(p.name);
            if (!p.system) {
                const del = document.createElement('button');
                del.className = 'hkp-profile-delete';
                del.textContent = '×';
                del.title = 'Delete profile';
                del.onclick = (e) => { e.stopPropagation(); deleteProfile(p.name); };
                item.appendChild(del);
            }
            list.appendChild(item);
        }
        const addRow = document.createElement('div');
        addRow.className = 'hkp-profile-item hkp-profile-add';
        addRow.textContent = '+  Add mod profile';
        addRow.onclick = () => promptNewProfile();
        list.appendChild(addRow);
    }

    function selectProfile(name) {
        state.activeProfile = name;
        refreshAll();
        renderProfiles();
        onProfileChanged();
        save();
    }
    function promptNewProfile() {
        const input = document.getElementById('hkp-modal-profile-input');
        input.value = '';
        document.getElementById('hkp-modal-profile').classList.remove('hkp-hidden');
        setTimeout(() => input.focus(), 30);
        pendingProfileCallback = (name) => {
            if (!name) return;
            name = name.trim();
            if (!name) return;
            if (state.profiles.find(p => p.name === name)) return;
            state.profiles.push({ name });
            state.activeProfile = name;
            renderProfiles(); refreshAll(); save();
        };
    }
    function deleteProfile(name) {
        showConfirm(`Delete profile "${name}"?`,
            'Keys keep their labels and colors; profile assignment is removed.',
            () => {
                state.profiles = state.profiles.filter(p => p.name !== name);
                if (state.activeProfile === name) state.activeProfile = 'DEFAULT';
                for (const keyId in state.keys) {
                    const layers = state.keys[keyId].layers || {};
                    for (const lid in layers) {
                        if (layers[lid].profiles)
                            layers[lid].profiles = layers[lid].profiles.filter(p => p !== name);
                    }
                }
                renderProfiles(); refreshAll(); save();
            });
    }

    // ---------------------------------------------------------------
    // Key / mouse interactions
    // ---------------------------------------------------------------
    function isReservedKey(keyId) {
        return state.settings.toggleKeyEnabled && keyId === state.settings.toggleKey;
    }

    function onKeyClick(keyId, el) {
        if (moveMode) { if (isMoveTarget(keyId)) finishMove(keyId); return; }
        // MCM key picker: any key on any layer picks it; modifier keys still switch layers.
        if (pick && !state.modifierKeys.includes(keyId)) { openPickModal(keyId); return; }
        if (isReservedKey(keyId)) return;
        if (state.modifierKeys.includes(keyId)) { toggleActiveModifier(keyId); return; }
        if (colorMode !== null) { applyColor(keyId); return; }
        if (REMOTE) { remoteFire(keyId); return; }
        // Firing the hotkey is NOT done here — a plain click is too easy to do by
        // accident on a panel you are also editing. It is a press-and-hold instead;
        // see startHold() below. This branch intentionally does nothing now.
    }

    // --Claude 2026-09-30 tablet remote: a tap fires at once. Touch has no hold here - the browser
    // sends mousedown and mouseup together when the finger lifts - and a long press is the key's
    // menu (Android fires contextmenu), so the lift after that menu must not fire the key too.
    let lastCtxAt = 0;
    function remoteFire(keyId) {
        if (Date.now() - lastCtxAt < 800) return;
        if (!canTriggerKey(keyId)) return;
        dispatchToBridge('hkpTriggerKey', keyId + '|' + currentLayerId());
    }

    // ================= hold-to-fire (SkyPrompt style) =================
    // --Claude 2026-09-15. Hold left mouse on a labelled key: the border fills
    // clockwise from 12 o'clock, and completing the loop fires the hotkey (the DLL
    // closes the panel and sends a real key edge pair). Release, leave the key, or
    // lose window focus before it closes and nothing happens.

    const HOLD_MS = 550;
    let hold = null;   // { keyId, el, overlay, segs, lens, total, t0, raf }

    // A key is "a hotkey" only if it carries a label in the current layer. Modifier
    // keys and colour-paint mode keep their existing click behaviour and are excluded.
    function canTriggerKey(keyId) {
        if (pick) return false;
        if (isReservedKey(keyId)) return false;
        if (state.modifierKeys.includes(keyId)) return false;
        if (colorMode !== null || moveMode) return false;
        const keyData = viewLayer(keyId, currentLayerId());
        return !!(keyData && keyData.label);
    }

    function cancelHold() {
        if (!hold) return;
        if (hold.raf) (window.cancelAnimationFrame || clearTimeout)(hold.raf);
        if (hold.overlay && hold.overlay.parentNode) hold.overlay.parentNode.removeChild(hold.overlay);
        hold.el.classList.remove('hkp-holding');
        hold = null;
    }

    function startHold(keyId, el) {
        cancelHold();
        if (REMOTE) return;   // a tap fires on the tablet (remoteFire)
        if (!canTriggerKey(keyId)) return;

        // The overlay is absolutely positioned inside the key, so the key must be a
        // positioning context. .hkp-key already is; the mouse-button elements may not.
        if (window.getComputedStyle(el).position === 'static') el.style.position = 'relative';

        const w = el.offsetWidth, h = el.offsetHeight;
        if (!w || !h) return;

        const overlay = document.createElement('div');
        overlay.className = 'hkp-hold';
        const segs = [];
        ['s1', 's2', 's3', 's4', 's5'].forEach(function (c) {
            const i = document.createElement('i');
            i.className = c;
            overlay.appendChild(i);
            segs.push(i);
        });
        el.appendChild(overlay);
        el.classList.add('hkp-holding');

        // Pixel length of each clockwise segment: top-right half, right, bottom,
        // left, top-left half. Driving the sweep by LENGTH (not by segment index)
        // is what keeps the speed constant on keys of different widths.
        const lens = [w / 2, h, w, h, w / 2];
        const total = lens.reduce(function (a, b) { return a + b; }, 0);

        // Captured at press time, not at completion: the user could toggle a modifier
        // or cycle the tap mode mid-hold, and we must fire what they were looking at
        // when they started.
        const layerId = currentLayerId();

        hold = { keyId, layerId, el, overlay, segs, lens, total, t0: Date.now(), raf: null };
        step();
    }

    function step() {
        if (!hold) return;
        const p = Math.min(1, (Date.now() - hold.t0) / HOLD_MS);
        let travelled = p * hold.total;

        for (let i = 0; i < hold.segs.length; i++) {
            const len = Math.max(0, Math.min(travelled, hold.lens[i]));
            travelled -= hold.lens[i];
            // s2 and s4 are the vertical edges: they grow in height, the rest in width.
            if (i === 1 || i === 3) hold.segs[i].style.height = len + 'px';
            else                    hold.segs[i].style.width  = len + 'px';
        }

        if (p >= 1) {
            const keyId = hold.keyId;
            // --Claude 2026-09-15: send the layer we are SHOWING, so what fires matches
            // the label the user was looking at. currentLayerId() is "default",
            // "ControlLeft+ShiftLeft", "double:default", "long:AltLeft", ... — the DLL
            // parses it back into modifier keys + tap mode and reproduces the input:
            // modifiers down, key pressed once / twice / long, modifiers up.
            const layerId = hold.layerId;
            cancelHold();
            dispatchToBridge('hkpTriggerKey', keyId + '|' + layerId);
            return;
        }
        hold.raf = window.requestAnimationFrame
            ? window.requestAnimationFrame(step)
            : setTimeout(step, 16);   // Ultralight fallback: rAF is not guaranteed here
    }

    // Any of these aborts a hold in progress. mouseup is on the document so that
    // releasing off the key still cancels cleanly.
    document.addEventListener('mouseup', cancelHold);
    window.addEventListener('blur', cancelHold);

    function toggleActiveModifier(keyId) {
        const on = state.activeModifiers.includes(keyId);
        if (on) state.activeModifiers = state.activeModifiers.filter(k => k !== keyId);
        else state.activeModifiers = [...state.activeModifiers, keyId];
        updateModifierBadge();
        refreshAll();
    }

    function applyColor(keyId) {
        const layer = currentLayerId();
        // A mod's key: the colour is the user's override for that source (clear = the mod's own).
        if (layer === 'default' && state.activeProfile === 'DEFAULT' && (extByKey[keyId] || []).length) {
            extByKey[keyId].forEach(([src]) => {
                const c = customFor(src, colorMode.swatchIdx !== 0);
                if (!c) return;
                if (colorMode.swatchIdx === 0) delete c.color; else c.color = colorMode.swatchIdx;
            });
            refreshAll(); save();
            return;
        }
        ensureKeyLayer(keyId, layer);
        const entry = state.keys[keyId].layers[layer];
        if (state.activeProfile === 'DEFAULT') {
            // Set the default (base) color for this layer
            entry.color = colorMode.swatchIdx;
        } else {
            // Set a profile-specific color override — only applies while this profile is active
            if (!entry.profileColors) entry.profileColors = {};
            if (colorMode.swatchIdx === 0) {
                // Clearing the profile override (revert to default color under this profile)
                delete entry.profileColors[state.activeProfile];
            } else {
                entry.profileColors[state.activeProfile] = colorMode.swatchIdx;
            }
        }
        refreshAll(); save();
    }

    function onKeyContext(keyId, el, evt) {
        lastCtxAt = Date.now();
        if (pick) return;
        if (moveMode) { exitMoveMode(); return; }
        if (isReservedKey(keyId)) {
            // the toggle key has no menu of its own, but a mod bound on it still needs Move
            if ((extByKey[keyId] || []).length && currentLayerId() === 'default')
                showContextMenu(evt.clientX, evt.clientY, buildExtItems(keyId));
            return;
        }
        if (state.activeProfile !== 'DEFAULT') {
            showContextMenu(evt.clientX, evt.clientY, buildProfileContextMenu(keyId));
            return;
        }
        showContextMenu(evt.clientX, evt.clientY, buildDefaultContextMenu(keyId));
    }

    function buildDefaultContextMenu(keyId) {
        const layer = currentLayerId();
        const isMod = state.modifierKeys.includes(keyId);
        const hasExt = layer === 'default' && (extByKey[keyId] || []).length > 0;
        const items = layer === 'default' ? buildExtItems(keyId) : [];
        if (!hasExt) items.push({ label: 'Edit name…', action: () => startEditName(keyId, layer) });
        items.push(
            { label: isMod ? 'Unmark as modifier' : 'Mark as modifier',
              action: () => toggleModifierFlag(keyId) },
            { sep: true },
            { label: 'Reset key', danger: true, action: () => resetKey(keyId) }
        );
        return items;
    }

    // --Claude hotkey hub: one block per mod that owns this key. Move Key only for owners that
    // said they take moves ("move" flag); the rest (MCM binds) get a note to rebind at the source.
    function buildExtItems(keyId) {
        const items = [];
        const ext = extByKey[keyId] || [];
        const owners = conflictOwners(keyId);
        if (owners.length > 1) items.push({ note: true, warn: true, label: 'Conflict: ' + owners.length + ' actions on this key, remap all but one' });
        ext.forEach(([src, e]) => {
            items.push({ head: true, label: extLabel(src, e) + '  ·  ' + ownerName(src) });
            if (e.move) items.push({ label: 'Move Key…', action: () => startMove(src) });
            else        items.push({ note: true, label: rebindNote(src) });
            items.push({ label: 'Rename…', action: () => startEditExtName(src) });
            items.push({ label: 'Remove from panel', danger: true, action: () => removeExt(src) });
            items.push({ sep: true });
        });
        const game = gameKeys[keyId];
        if (game && game.length) {
            items.push({ note: true, label: 'Skyrim: ' + game.join(', ') });
            items.push({ sep: true });
        }
        return items;
    }
    function buildProfileContextMenu(keyId) {
        const prof = state.activeProfile;
        const layer = currentLayerId();
        const kd = getKeyLayer(keyId, layer);
        const inProfile = kd && kd.profiles && kd.profiles.includes(prof);
        const hasProfColor = kd && kd.profileColors && kd.profileColors[prof] != null;
        const items = [{
            label: inProfile ? `Remove from "${prof}"` : `Add to "${prof}"`,
            action: () => {
                ensureKeyLayer(keyId, layer);
                const profs = state.keys[keyId].layers[layer].profiles = state.keys[keyId].layers[layer].profiles || [];
                const i = profs.indexOf(prof);
                if (i >= 0) profs.splice(i, 1); else profs.push(prof);
                refreshAll(); save();
            }
        }];
        if (hasProfColor) {
            items.push({
                label: `Clear "${prof}" color`,
                action: () => {
                    const e = state.keys[keyId] && state.keys[keyId].layers && state.keys[keyId].layers[layer];
                    if (e && e.profileColors) { delete e.profileColors[prof]; refreshAll(); save(); }
                }
            });
        }
        return items;
    }

    function toggleModifierFlag(keyId) {
        const isMod = state.modifierKeys.includes(keyId);
        if (isMod) {
            state.modifierKeys = state.modifierKeys.filter(k => k !== keyId);
            state.activeModifiers = state.activeModifiers.filter(k => k !== keyId);
        } else {
            state.modifierKeys = [...state.modifierKeys, keyId];
        }
        updateModifierBadge(); refreshAll(); save();
    }

    function resetKey(keyId) {
        const layer = currentLayerId();
        showConfirm('Reset key?',
            'Clears name, color, and all profile assignments for this key in the current layer.',
            () => {
                if (state.keys[keyId] && state.keys[keyId].layers) {
                    delete state.keys[keyId].layers[layer];
                    if (Object.keys(state.keys[keyId].layers).length === 0) delete state.keys[keyId];
                }
                refreshAll(); save();
            });
    }

    // ---------------------------------------------------------------
    // Edit-name modal (used by keyboard keys; mouse has inline input)
    // ---------------------------------------------------------------
    function startEditName(keyId, layer) {
        pendingEditKey = keyId; pendingEditLayer = layer;
        const input = document.getElementById('hkp-modal-edit-input');
        const existing = getKeyLayer(keyId, layer);
        input.value = (existing && existing.label) || '';
        document.getElementById('hkp-modal-edit').classList.remove('hkp-hidden');
        setTimeout(() => { input.focus(); input.select(); }, 30);
    }
    // Rename a mod's key: stored as the user's override for that source; empty = the mod's name.
    function startEditExtName(src) {
        const e = state.external[src];
        if (!e) return;
        pendingEditSource = src; pendingEditKey = null; pendingEditLayer = null;
        const input = document.getElementById('hkp-modal-edit-input');
        input.value = extLabel(src, e);
        document.getElementById('hkp-modal-edit').classList.remove('hkp-hidden');
        setTimeout(() => { input.focus(); input.select(); }, 30);
    }
    function saveEditInternal() {
        if (pendingEditSource) {
            const src = pendingEditSource;
            pendingEditSource = null;
            const val = document.getElementById('hkp-modal-edit-input').value.trim();
            const e = state.external[src];
            const c = customFor(src, !!val && !!e && val !== e.label);
            if (c) { if (val && e && val !== e.label) c.label = val; else delete c.label; }
            document.getElementById('hkp-modal-edit').classList.add('hkp-hidden');
            refreshAll(); save();
            return;
        }
        if (!pendingEditKey) return;
        const val = document.getElementById('hkp-modal-edit-input').value.trim();
        ensureKeyLayer(pendingEditKey, pendingEditLayer);
        state.keys[pendingEditKey].layers[pendingEditLayer].label = val;
        pendingEditKey = null; pendingEditLayer = null;
        document.getElementById('hkp-modal-edit').classList.add('hkp-hidden');
        refreshAll(); save();
    }

    // ---------------------------------------------------------------
    // Context menu
    // ---------------------------------------------------------------
    function showContextMenu(x, y, items) {
        const menu = document.getElementById('hkp-ctx-menu');
        menu.innerHTML = '';
        items.forEach(it => {
            if (it.sep) {
                // no leading, trailing or doubled separators
                if (!menu.lastChild || menu.lastChild.className === 'hkp-ctx-sep') return;
                const s = document.createElement('div');
                s.className = 'hkp-ctx-sep';
                menu.appendChild(s);
            } else if (it.head || it.note) {
                const d = document.createElement('div');
                d.className = it.head ? 'hkp-ctx-head' : 'hkp-ctx-note' + (it.warn ? ' hkp-ctx-warn' : '');
                d.textContent = it.label;
                menu.appendChild(d);
            } else {
                const b = document.createElement('button');
                b.className = 'hkp-ctx-item' + (it.danger ? ' hkp-ctx-danger' : '');
                b.textContent = it.label;
                b.onclick = () => { hideContextMenu(); it.action(); };
                menu.appendChild(b);
            }
        });
        if (menu.lastChild && menu.lastChild.className === 'hkp-ctx-sep') menu.removeChild(menu.lastChild);
        menu.style.left = Math.min(x, window.innerWidth - 240) + 'px';
        menu.style.top = y + 'px';
        menu.classList.remove('hkp-hidden');
        // measured after it is visible: mod blocks make the menu taller than the old fixed 200px
        menu.style.top = Math.max(0, Math.min(y, window.innerHeight - menu.offsetHeight - 4)) + 'px';
    }
    function hideContextMenu() { document.getElementById('hkp-ctx-menu').classList.add('hkp-hidden'); }

    // ---------------------------------------------------------------
    // Color mode + swatches
    // ---------------------------------------------------------------
    function renderSwatches() {
        const bar = document.getElementById('hkp-swatches');
        bar.innerHTML = '';
        for (const p of PALETTE) {
            const sw = document.createElement('div');
            sw.className = 'hkp-swatch';
            sw.style.background = p.hex || 'repeating-linear-gradient(45deg, #333, #333 3px, #222 3px, #222 6px)';
            sw.title = p.hex || 'Clear color';
            sw.onclick = () => pickSwatch(p.idx);
            bar.appendChild(sw);
        }
    }
    function pickSwatch(idx) {
        if (moveMode) exitMoveMode();
        if (colorMode && colorMode.swatchIdx === idx) { exitColorMode(); return; }
        colorMode = { swatchIdx: idx };
        document.body.classList.add('hkp-color-mode');
        document.getElementById('hkp-swatch-bar').classList.add('hkp-active');
        [...document.querySelectorAll('#hkp-swatches .hkp-swatch')].forEach((sw, i) =>
            sw.classList.toggle('selected', i === idx));
        updateSwatchBarLabel();
    }

    // Picking a profile shouldn't silently kill color mode, but does update the
    // swatch-bar label so the user knows the current swatch will affect the new
    // profile. (Also called when profile list item clicked.)
    function onProfileChanged() {
        if (colorMode) updateSwatchBarLabel();
    }
    function exitColorMode() {
        colorMode = null;
        document.body.classList.remove('hkp-color-mode');
        document.getElementById('hkp-swatch-bar').classList.remove('hkp-active');
        [...document.querySelectorAll('#hkp-swatches .hkp-swatch')].forEach(sw => sw.classList.remove('selected'));
        updateSwatchBarLabel();
    }
    // Shows color-mode tip while a swatch is picked, otherwise shows the current tap mode.
    function updateSwatchBarLabel() {
        const el = document.getElementById('hkp-swatch-label');
        if (!el) return;
        if (pick && !statusMsg) {
            el.textContent = pick.manual
                ? 'SKSE menu key: click a key or mouse button (any layer) for the page waiting for a key, or press it. ESC: cancel.'
                : 'Binding "' + pickTitle() + '": click a key (any layer) or press it. ESC: back to the MCM.';
            el.classList.remove('hkp-swatch-label-tap');
            return;
        }
        if (moveMode || statusMsg) {
            el.textContent = moveMode
                ? 'Moving "' + moveMode.label + '": click an empty key. ESC or right-click cancels.'
                : statusMsg;
            el.classList.remove('hkp-swatch-label-tap');
            return;
        }
        if (colorMode) {
            const forProf = state.activeProfile !== 'DEFAULT'
                ? ` (applies to "${state.activeProfile}" profile only)` : '';
            el.textContent = colorMode.swatchIdx === 0
                ? 'Clear color — click keys to remove' + forProf + '. Click swatch again to exit.'
                : 'Color mode — click keys to apply' + forProf + '. Click swatch again or press ESC to exit.';
            el.classList.remove('hkp-swatch-label-tap');
        } else {
            el.textContent = 'Tap mode: ' + (TAP_LABEL[state.activeTapMode || 'single']);
            el.classList.add('hkp-swatch-label-tap');
        }
    }

    // ---------------------------------------------------------------
    // Modifier layer
    // ---------------------------------------------------------------
    function currentLayerId() {
        const modBase = state.activeModifiers.length
            ? [...state.activeModifiers].sort().join('+')
            : 'default';
        const tap = state.activeTapMode || 'single';
        return tap === 'single' ? modBase : `${tap}:${modBase}`;
    }
    function updateModifierBadge() {
        const el = document.getElementById('hkp-active-mods');
        const modBase = state.activeModifiers.length
            ? state.activeModifiers.sort().map(k => KEY_CAPTION[k] || k).join(' + ')
            : null;
        el.textContent = modBase ? ('Modifier: ' + modBase) : 'Default layer';
        el.classList.toggle('hkp-has-mod', !!modBase);
        // Tap badge
        const tap = state.activeTapMode || 'single';
        const tapBtn = document.getElementById('hkp-btn-tap');
        if (tapBtn) {
            tapBtn.textContent = 'Tap: ' + TAP_LABEL[tap];
            tapBtn.classList.toggle('hkp-active', tap !== 'single');
        }
    }

    function cycleTapMode() {
        const cur = state.activeTapMode || 'single';
        const next = TAP_MODES[(TAP_MODES.indexOf(cur) + 1) % TAP_MODES.length];
        state.activeTapMode = next;
        applyTapModeBg();
        updateModifierBadge();
        updateSwatchBarLabel();
        refreshAll();
    }
    function applyTapModeBg() {
        document.body.classList.remove('hkp-tap-single', 'hkp-tap-double', 'hkp-tap-long');
        document.body.classList.add('hkp-tap-' + (state.activeTapMode || 'single'));
    }

    // Edit Mode removed — right-click and long-press both open the context menu.
    function getKeyLayer(keyId, layerId) {
        const k = state.keys[keyId];
        if (!k || !k.layers) return null;
        return k.layers[layerId] || null;
    }
    function ensureKeyLayer(keyId, layerId) {
        if (!state.keys[keyId]) state.keys[keyId] = { layers: {} };
        if (!state.keys[keyId].layers) state.keys[keyId].layers = {};
        if (!state.keys[keyId].layers[layerId]) state.keys[keyId].layers[layerId] = { label: '', color: 0, profiles: [] };
    }

    // ---------------------------------------------------------------
    // Confirm dialog
    // ---------------------------------------------------------------
    function showConfirm(title, body, onOk) {
        document.getElementById('hkp-confirm-title').textContent = title;
        document.getElementById('hkp-confirm-body').textContent = body;
        document.getElementById('hkp-modal-confirm').classList.remove('hkp-hidden');
        pendingConfirmCallback = onOk;
    }

    // ---------------------------------------------------------------
    // Settings
    // ---------------------------------------------------------------
    function toggleSettings() {
        settingsOpen = !settingsOpen;
        document.getElementById('hkp-settings').classList.toggle('hkp-hidden', !settingsOpen);
        if (settingsOpen) syncSettingsInputs();
    }
    function syncSettingsInputs() {
        document.getElementById('hkp-toggle-key-btn').textContent = state.settings.toggleKey || '(unset)';
        document.getElementById('hkp-toggle-key-enabled').checked = !!state.settings.toggleKeyEnabled;
        document.getElementById('hkp-pick-enabled').checked = state.settings.pickMode !== false;
        const sz = Number(state.settings.labelFontSize) || 18;
        document.getElementById('hkp-label-size').value = sz;
        document.getElementById('hkp-label-size-val').textContent = sz;
        const ps = Number(state.settings.panelScale) || 100;
        document.getElementById('hkp-panel-scale').value = ps;
        document.getElementById('hkp-panel-scale-val').textContent = ps + '%';
        const po = Number(state.settings.panelOpacity) || 100;
        document.getElementById('hkp-panel-opacity').value = po;
        document.getElementById('hkp-panel-opacity-val').textContent = po + '%';
        syncFontButton();
        document.getElementById('hkp-remote-enabled').checked = !!state.settings.remoteEnabled;
        document.getElementById('hkp-remote-port').value = Number(state.settings.remotePort) || 8950;
        syncRemoteStatus();
    }
    function setLabelSize(val) {
        const sz = Math.max(10, Math.min(36, Number(val) || 18));
        state.settings.labelFontSize = sz;
        document.getElementById('hkp-label-size-val').textContent = sz;
        applyLabelSize();
        save();
    }
    function applyLabelSize() {
        document.documentElement.style.setProperty('--hkp-label-size', (state.settings.labelFontSize || 18) + 'px');
    }
    // Live preview while dragging — updates only the percentage label so the
    // user sees feedback without triggering an expensive layout pass on every
    // tick (full layoutKeyboard() relayout would cause flashing as the keys
    // resize repeatedly mid-drag).
    function previewPanelScale(val) {
        const pct = Math.max(12, Math.min(100, Number(val) || 100));
        document.getElementById('hkp-panel-scale-val').textContent = pct + '%';
    }
    function setPanelScale(val) {
        const pct = Math.max(12, Math.min(100, Number(val) || 100));
        state.settings.panelScale = pct;
        document.getElementById('hkp-panel-scale-val').textContent = pct + '%';
        applyPanelScale();
        // Re-measure keyboard now that the panel got smaller/larger
        if (typeof layoutKeyboard === 'function') layoutKeyboard();
        save();
    }
    function applyPanelScale() {
        const pct = Number(state.settings.panelScale) || 100;
        document.documentElement.style.setProperty('--hkp-panel-scale', (pct / 100).toFixed(4));
    }
    function setPanelOpacity(val) {
        const pct = Math.max(20, Math.min(100, Number(val) || 100));
        state.settings.panelOpacity = pct;
        document.getElementById('hkp-panel-opacity-val').textContent = pct + '%';
        applyPanelOpacity();
        save();
    }
    function applyPanelOpacity() {
        const pct = Number(state.settings.panelOpacity) || 100;
        document.documentElement.style.setProperty('--hkp-panel-opacity', (pct / 100).toFixed(3));
    }

    // ---------------------------------------------------------------
    // --Claude font selector (ported from PEM). The DLL pushes the installed
    // system font list once at DOM ready via HKP.setFonts(). Native <select>
    // is BANNED in PrismaUI (first-click focus bug) — custom div dropdown.
    // ---------------------------------------------------------------
    let fontList = [];
    let fontDDOpen = false;
    function setFonts(list) {
        try { fontList = Array.isArray(list) ? list : JSON.parse(list); } catch (_) { fontList = []; }
        syncFontButton();
    }
    function syncFontButton() {
        const btn = document.getElementById('hkp-font-btn');
        if (btn) btn.textContent = state.settings.fontFamily || 'Default (EB Garamond)';
    }
    function applyFont() {
        const fam = state.settings.fontFamily;
        // Inline body style overrides the stylesheet; '' reverts to the default stack.
        document.body.style.fontFamily = fam ? '"' + fam + '", "EB Garamond", "Palatino Linotype", Georgia, serif' : '';
    }
    function toggleFontDD() {
        fontDDOpen = !fontDDOpen;
        const dd = document.getElementById('hkp-font-list');
        if (!dd) return;
        if (fontDDOpen) {
            const cur = state.settings.fontFamily;
            let html = '<div class="hkp-font-item' + (!cur ? ' selected' : '') +
                       '" onclick="HKP.pickFont(\'\')">Default (EB Garamond)</div>';
            for (const f of fontList) {
                const esc = f.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
                html += '<div class="hkp-font-item' + (cur === f ? ' selected' : '') +
                        '" style="font-family:\'' + esc + '\'" onclick="HKP.pickFont(\'' + esc + '\')">' + esc + '</div>';
            }
            dd.innerHTML = html;
            dd.classList.remove('hkp-hidden');
            const sel = dd.querySelector('.selected');
            if (sel) sel.scrollIntoView({ block: 'center' });
        } else {
            dd.classList.add('hkp-hidden');
        }
    }
    function closeFontDD() {
        if (!fontDDOpen) return;
        fontDDOpen = false;
        const dd = document.getElementById('hkp-font-list');
        if (dd) dd.classList.add('hkp-hidden');
    }
    function pickFont(name) {
        state.settings.fontFamily = name || '';
        closeFontDD();
        syncFontButton();
        applyFont();
        save();
    }
    // --Claude 2026-09-30 tablet remote (src/RemoteServer.cpp). The DLL answers every
    // hkpSetRemote with HKP.setRemoteInfo({running, port, urls, error}).
    let remoteInfo = null;
    function pushRemoteToDLL() {
        dispatchToBridge('hkpSetRemote',
            (state.settings.remoteEnabled ? '1' : '0') + '|' + (Number(state.settings.remotePort) || 8950));
    }
    function setRemote(val) {
        state.settings.remoteEnabled = !!val;
        syncRemoteStatus();
        pushRemoteToDLL();
        save();
    }
    function setRemotePort(val) {
        const port = Math.round(Number(val));
        state.settings.remotePort = (port >= 1024 && port <= 65535) ? port : 8950;
        document.getElementById('hkp-remote-port').value = state.settings.remotePort;
        pushRemoteToDLL();
        save();
    }
    function setRemoteInfo(info) {
        remoteInfo = info || null;
        syncRemoteStatus();
    }
    function syncRemoteStatus() {
        const el = document.getElementById('hkp-remote-status');
        if (!el) return;
        const i = remoteInfo;
        let text = 'Off.';
        if (state.settings.remoteEnabled) {
            if (!i || (!i.running && !i.error)) text = 'Starting…';
            else if (i.error) text = i.error + '.';
            else if (i.urls && i.urls.length) text = 'On the tablet, open  ' + i.urls.join('  or  ');
            else text = 'Running on port ' + i.port + ', but this PC has no home-network address.';
        }
        el.textContent = text;
        el.classList.toggle('hkp-remote-bad', !!(state.settings.remoteEnabled && i && i.error));
    }

    function setPickMode(val) {
        state.settings.pickMode = !!val;
        dispatchToBridge('hkpSetPickMode', val ? '1' : '0');
        save();
    }
    function setToggleEnabled(val) {
        state.settings.toggleKeyEnabled = val;
        dispatchToBridge('hkpSetToggleKey', (val ? '1' : '0') + '|' + (state.settings.toggleKey || ''));
        refreshAll(); save();
    }
    function startBindToggleKey() {
        bindingToggleKey = true;
        document.getElementById('hkp-toggle-key-btn').textContent = 'Press any key…';
    }
    function applyBoundToggle(code) {
        state.settings.toggleKey = code;
        document.getElementById('hkp-toggle-key-btn').textContent = code;
        dispatchToBridge('hkpSetToggleKey',
            (state.settings.toggleKeyEnabled ? '1' : '0') + '|' + code);
        refreshAll(); save();
    }
    // ---------------------------------------------------------------
    // Tooltip for overflowed labels
    // ---------------------------------------------------------------
    function maybeShowTooltip(keyId, el, evt) {
        if (showConflictTooltip(el)) return;
        const lbl = el.querySelector('.hkp-key-label');
        if (!lbl || !lbl.textContent) return;
        if (lbl.scrollHeight <= lbl.clientHeight + 2 && lbl.scrollWidth <= lbl.clientWidth + 2) return;
        hideTooltip();
        const t = document.createElement('div');
        t.className = 'hkp-tooltip';
        t.textContent = lbl.textContent;
        document.body.appendChild(t);
        const r = el.getBoundingClientRect();
        t.style.left = (r.left + r.width / 2 - 160) + 'px';
        t.style.top = (r.bottom + 6) + 'px';
        activeTooltip = t;
    }
    function hideTooltip() { if (activeTooltip) { activeTooltip.remove(); activeTooltip = null; } }

    // ---------------------------------------------------------------
    // Globals
    // ---------------------------------------------------------------
    function attachGlobalHandlers() {
        document.addEventListener('click', (e) => {
            // --Claude font selector: click anywhere outside the dropdown closes it
            if (fontDDOpen && !e.target.closest('#hkp-font-dd')) closeFontDD();
            const menu = document.getElementById('hkp-ctx-menu');
            if (!menu.classList.contains('hkp-hidden')) {
                if (menu.contains(e.target)) return;
                if (e.target.closest('.hkp-key') || e.target.closest('.hkp-m-input')) return;
                hideContextMenu();
                return;
            }
            // Settings click-outside close
            if (settingsOpen) {
                const panel = document.getElementById('hkp-settings');
                const settingsBtn = document.getElementById('hkp-btn-settings');
                if (!panel.contains(e.target) && e.target !== settingsBtn && !settingsBtn.contains(e.target)) {
                    toggleSettings();
                }
            }
        });
        // --Claude text-input guard: tell the DLL whenever any text box gains or
        // loses focus so its input sink stops treating ESC/Tab/toggle as
        // panel-close while the user is typing a name. focusout defers one tick
        // so an input->input focus hop doesn't flicker the gate off.
        const sendTextFlag = () => {
            const el = document.activeElement;
            const isText = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
            dispatchToBridge('hkpTextInput', isText ? '1' : '0');
        };
        document.addEventListener('focusin', sendTextFlag);
        document.addEventListener('focusout', () => setTimeout(sendTextFlag, 0));

        document.addEventListener('keydown', (e) => {
            if (bindingToggleKey) {
                e.preventDefault();
                if (e.key !== 'Escape') {
                    // --Claude G-keys: Ultralight doesn't map VK F13-F24 to DOM
                    // codes — e.code arrives empty/'Unidentified' and the bind
                    // stored garbage ("unset"). Fall back to the key NAME
                    // ("F19") or the raw keyCode (124-135 = F13-F24).
                    let code = e.code;
                    if (!code || code === 'Unidentified') {
                        if (/^F(1[3-9]|2[0-4])$/.test(e.key)) code = e.key;
                        else if (e.keyCode >= 124 && e.keyCode <= 135) code = 'F' + (e.keyCode - 111);
                    }
                    if (code) applyBoundToggle(code);
                }
                bindingToggleKey = false;
                syncSettingsInputs();
                return;
            }
            if (e.key === 'Escape' || e.key === 'Tab') {
                // --Claude text-input guard: a focused text box owns its keys — its own
                // keydown (Enter=save, ESC=cancel) has already run; just drop focus and
                // stop, so one ESC can't cancel the edit AND close the next layer too.
                const t = e.target;
                if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) {
                    e.preventDefault();
                    t.blur();
                    return;
                }
                e.preventDefault();
                // ESC/Tab cascade: close whatever is layered on top first.
                if (pickModal) { closePickModal(); return; }
                if (!document.getElementById('hkp-modal-confirm').classList.contains('hkp-hidden')) { confirmCancel(); return; }
                if (!document.getElementById('hkp-modal-edit').classList.contains('hkp-hidden'))    { cancelEdit(); return; }
                if (!document.getElementById('hkp-modal-profile').classList.contains('hkp-hidden')) { cancelProfile(); return; }
                if (!document.getElementById('hkp-ctx-menu').classList.contains('hkp-hidden'))     { hideContextMenu(); return; }
                if (fontDDOpen) { closeFontDD(); return; }
                if (moveMode) { exitMoveMode(); return; }
                if (colorMode !== null) { exitColorMode(); return; }
                if (settingsOpen) { toggleSettings(); return; }
                // Otherwise close the UI
                dispatchToBridge('hkpCloseUI', '1');
                document.getElementById('hkp-root').classList.add('hkp-hidden');
            }
        });
    }

    function dispatchToBridge(channel, payload) {
        try { if (typeof window[channel] === 'function') window[channel](payload); } catch (_) {}
    }

    function save() {
        if (saveDebounce) clearTimeout(saveDebounce);
        saveDebounce = setTimeout(() => {
            dispatchToBridge('hkpSaveState', JSON.stringify(state));
        }, 250);
    }

    function confirmCancel() { document.getElementById('hkp-modal-confirm').classList.add('hkp-hidden'); pendingConfirmCallback = null; }
    function cancelEdit() { pendingEditKey = null; pendingEditSource = null; document.getElementById('hkp-modal-edit').classList.add('hkp-hidden'); }
    function cancelProfile() { pendingProfileCallback = null; document.getElementById('hkp-modal-profile').classList.add('hkp-hidden'); }

    // ---------------------------------------------------------------
    // External hotkeys (--Claude 2026-09-23)
    // Other mods announce their keys through the SKSE mod event HKP_SetHotkey; the DLL
    // forwards them here. PEM sends outfit hotkeys (outfit name, green), MCM Unlocked sends
    // every MCM key bind ("<MCM>: <option>", blue).
    // Hotkey hub (same day): each source id is ONE entry in state.external, apart from the
    // user's own labels, so two mods on one key are both kept and shown as a conflict instead
    // of the second overwriting the first. They show on the DEFAULT layer (single tap, no
    // modifier) only. strArg = "source|colour[,move]|label":
    //   move      = the owner listens for HKP_MoveHotkey, so the panel offers Move Key
    //   source*   = with key 0, forget every entry whose source starts with that prefix
    //               (an owner re-syncing its whole list, e.g. PEM on game load)
    // ---------------------------------------------------------------
    const DIK_TO_CODE = (() => {
        const m = {};
        const put = (codes, start) => codes.forEach((c, i) => { m[start + i] = c; });
        put(['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0','Minus','Equal','Backspace','Tab'], 2);
        put(['KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP','BracketLeft','BracketRight','Enter','ControlLeft'], 16);
        put(['KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK','KeyL','Semicolon','Quote','Backquote','ShiftLeft'], 30);
        put(['Backslash','KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM','Comma','Period','Slash','ShiftRight','NumpadMultiply','AltLeft','Space','CapsLock'], 43);
        put(['F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','NumLock','ScrollLock'], 59);
        put(['Numpad7','Numpad8','Numpad9','NumpadSubtract','Numpad4','Numpad5','Numpad6','NumpadAdd','Numpad1','Numpad2','Numpad3','Numpad0','NumpadDecimal'], 71);
        put(['F13','F14','F15','F16','F17','F18','F19','F20','F21','F22','F23'], 100);   // G-keys (GKeysInputBridge)
        Object.assign(m, {
            1: 'Escape', 87: 'F11', 88: 'F12', 118: 'F24', 156: 'NumpadEnter', 157: 'ControlRight',
            181: 'NumpadDivide', 183: 'PrintScreen', 184: 'AltRight', 197: 'Pause', 199: 'Home',
            200: 'ArrowUp', 201: 'PageUp', 203: 'ArrowLeft', 205: 'ArrowRight', 207: 'End',
            208: 'ArrowDown', 209: 'PageDown', 210: 'Insert', 211: 'Delete',
            256: 'Mouse1', 257: 'Mouse2', 258: 'Mouse3'
        });
        return m;
    })();

    const CODE_TO_DIK = (() => {
        const m = {};
        for (const [dik, code] of Object.entries(DIK_TO_CODE)) m[code] = Number(dik);
        return m;
    })();

    function setExternalHotkey(dik, payload) {
        const p = String(payload || '');
        const a = p.indexOf('|'), b = a < 0 ? -1 : p.indexOf('|', a + 1);
        if (b < 0) return;
        const source = p.slice(0, a);
        const flags = p.slice(a + 1, b).split(',');
        const color = parseInt(flags[0], 10) || 0;
        const move = flags.indexOf('move') > 0;
        const label = p.slice(b + 1).trim();
        if (!source) return;
        if (!state.external) state.external = {};

        if (source.endsWith('*')) {
            const pre = source.slice(0, -1);
            for (const s of Object.keys(state.external)) if (s.startsWith(pre)) delete state.external[s];
            refreshAll(); save();
            return;
        }

        const code = dik > 0 ? DIK_TO_CODE[dik] : null;
        if (dik > 0 && !code) { console.warn('HKP: no panel key for DIK', dik, source); return; }
        if (code) state.external[source] = { key: code, label, color, move };
        else delete state.external[source];

        // MCM key picker: MCM Unlocked announces the key the MCM accepted - name/colour it as picked.
        if (pendingPick && code && dik === pendingPick.dik && source.startsWith('MCM:') &&
            Date.now() - pendingPick.t < 20000) {
            const c = customFor(source, true);
            if (pendingPick.label && pendingPick.label !== label) c.label = pendingPick.label; else delete c.label;
            if (pendingPick.color) c.color = pendingPick.color; else delete c.color;
            pendingPick = null;
        }

        if (pendingMove && pendingMove.source === source) {
            clearTimeout(pendingMove.timer);
            const where = KEY_CAPTION[pendingMove.code] || pendingMove.code;
            flashStatus(code === pendingMove.code
                ? 'Moved "' + pendingMove.label + '" to ' + where + '.'
                : ownerName(source) + ' refused ' + where + '. "' + pendingMove.label + '" kept its key.');
            pendingMove = null;
        }
        refreshAll(); save();
    }

    // ----- hub helpers -----
    function rebuildExtIndex() {
        extByKey = {};
        for (const [src, e] of Object.entries(state.external || {})) {
            if (!e || !e.key) continue;
            (extByKey[e.key] = extByKey[e.key] || []).push([src, e]);
        }
    }
    // The user's name/colour for a source; created on demand when `create`.
    function customFor(src, create) {
        if (!state.extCustom) state.extCustom = {};
        if (!state.extCustom[src] && create) state.extCustom[src] = {};
        return state.extCustom[src] || null;
    }
    function extLabel(src, e) {
        const c = state.extCustom && state.extCustom[src];
        return (c && c.label) || (e && e.label) || src;
    }
    function extColor(src, e) {
        const c = state.extCustom && state.extCustom[src];
        return (c && c.color != null) ? c.color : ((e && e.color) || 0);
    }
    // What a key shows in a layer: its mods' keys on the default layer, else the panel label.
    function viewLayer(keyId, layerId) {
        const own = getKeyLayer(keyId, layerId);
        const ext = layerId === 'default' ? extByKey[keyId] : null;
        if (!ext || !ext.length) return own;
        return {
            label: ext.map(([s, e]) => extLabel(s, e)).join(' / '),
            color: extColor(ext[0][0], ext[0][1]),
            profiles: own && own.profiles,
            profileColors: own && own.profileColors
        };
    }
    // "PEM:outfit:3" -> "PEM"; "MCM:SexLab:Hotkeys:12" -> "SexLab"
    function mcmName(src) {
        const parts = src.slice(4).split(':');
        return parts.length > 2 ? parts.slice(0, -2).join(':') : parts[0];
    }
    function ownerName(src) {
        if (src.startsWith('MCM:')) return mcmName(src) + ' MCM';
        const i = src.indexOf(':');
        return i > 0 ? src.slice(0, i) : src;
    }
    function rebindNote(src) {
        return src.startsWith('MCM:') ? 'Rebind in ' + mcmName(src) + ' MCM' : 'Rebind in ' + ownerName(src);
    }
    // Everything that fires on this bare key: mod keys, vanilla controls (from the live control
    // map, so the user's controlmap.txt edits count), and the panel's own toggle key. Two or
    // more = a real clash that needs remapping; shown as a red ! with this list on hover.
    function conflictOwners(keyId) {
        const out = (extByKey[keyId] || []).map(([s, e]) => extLabel(s, e) + '  (' + ownerName(s) + ')');
        (gameKeys[keyId] || []).forEach(ev => out.push(ev + '  (Skyrim control)'));
        if (isReservedKey(keyId)) out.push('Open Hotkey Panel  (Hotkey Panel)');
        return out;
    }
    function setConflictBadge(el, owners) {
        const on = owners.length > 1;
        el.classList.toggle('hkp-conflict', on);
        el.dataset.conflict = on ? owners.join('\n') : '';
        let b = el.querySelector('.hkp-conflict-badge');
        if (on && !b) {
            b = document.createElement('div');
            b.className = 'hkp-conflict-badge';
            b.textContent = '!';
            el.appendChild(b);
        } else if (!on && b) {
            b.remove();
        }
    }
    function showConflictTooltip(el) {
        if (!el.dataset.conflict) return false;
        hideTooltip();
        const t = document.createElement('div');
        t.className = 'hkp-tooltip hkp-conflict-tip';
        const h = document.createElement('div');
        h.className = 'hkp-conflict-tip-head';
        h.textContent = 'Key conflict: remap all but one';
        t.appendChild(h);
        el.dataset.conflict.split('\n').forEach(line => {
            const d = document.createElement('div');
            d.textContent = '• ' + line;
            t.appendChild(d);
        });
        document.body.appendChild(t);
        const r = el.getBoundingClientRect();
        t.style.left = Math.max(4, Math.min(r.left + r.width / 2 - 160, window.innerWidth - t.offsetWidth - 4)) + 'px';
        t.style.top = (r.bottom + t.offsetHeight + 6 > window.innerHeight ? r.top - t.offsetHeight - 6 : r.bottom + 6) + 'px';
        activeTooltip = t;
        return true;
    }

    function removeExt(src) {
        delete state.external[src];
        if (state.extCustom) delete state.extCustom[src];
        refreshAll(); save();
    }
    function flashStatus(msg, ms) {
        statusMsg = msg;
        if (statusTimer) clearTimeout(statusTimer);
        statusTimer = ms === 0 ? null : setTimeout(() => { statusMsg = null; statusTimer = null; updateSwatchBarLabel(); }, ms || 5000);
        updateSwatchBarLabel();
    }

    // ----- Move Key -----
    // An empty key: a real keyboard key with a scan code, no mod key, no panel label, not the
    // panel's toggle, not a modifier, and not bound to a vanilla gameplay control.
    function isMoveTarget(keyId) {
        const dik = CODE_TO_DIK[keyId];
        if (!dik || dik >= 256 || keyId === 'Escape') return false;
        if (isReservedKey(keyId) || state.modifierKeys.includes(keyId)) return false;
        if ((extByKey[keyId] || []).length || gameKeys[keyId]) return false;
        const own = getKeyLayer(keyId, 'default');
        return !(own && own.label);
    }
    function markMoveTargets() {
        document.querySelectorAll('.hkp-key, .hkp-m-input').forEach(el => {
            const ok = !!moveMode && el.classList.contains('hkp-key') && isMoveTarget(el.dataset.keyId);
            el.classList.toggle('hkp-move-target', ok);
            el.classList.toggle('hkp-move-blocked', !!moveMode && !ok);
        });
    }
    function startMove(src) {
        const e = state.external[src];
        if (!e) return;
        if (colorMode) exitColorMode();
        cancelHold();
        moveMode = { source: src, label: extLabel(src, e) };
        document.body.classList.add('hkp-move-mode');
        markMoveTargets();
        updateSwatchBarLabel();
    }
    function exitMoveMode() {
        moveMode = null;
        document.body.classList.remove('hkp-move-mode');
        markMoveTargets();
        updateSwatchBarLabel();
    }
    // Nothing moves here: the owner applies the key and re-announces it (setExternalHotkey).
    function finishMove(keyId) {
        const src = moveMode.source, label = moveMode.label;
        exitMoveMode();
        if (pendingMove) clearTimeout(pendingMove.timer);
        pendingMove = {
            source: src, code: keyId, label,
            timer: setTimeout(() => {
                pendingMove = null;
                flashStatus(ownerName(src) + ' did not answer. "' + label + '" was not moved.');
            }, 4000)
        };
        flashStatus('Moving "' + label + '" to ' + (KEY_CAPTION[keyId] || keyId) + '…', 0);
        dispatchToBridge('hkpMoveHotkey', src + '|' + CODE_TO_DIK[keyId]);
    }
    function setGameKeys(list) {
        gameKeys = {};
        let arr = list;
        try { if (typeof list === 'string') arr = JSON.parse(list); } catch (_) { arr = []; }
        (Array.isArray(arr) ? arr : []).forEach(([dik, ev]) => {
            const code = DIK_TO_CODE[dik];
            if (code && ev) (gameKeys[code] = gameKeys[code] || []).push(ev);
        });
        refreshAll();   // conflict badges count Skyrim controls too
    }

    // ---------------------------------------------------------------
    // --Claude 2026-09-28: MCM key picker
    // The DLL opens the panel when an MCM asks for a key (HKP.startPick). A click on a key opens a
    // small dialog to name and colour it; Bind sends the key to the DLL, which closes the panel and
    // hands the key to the MCM exactly as if it had been pressed. The MCM's accepted key comes back
    // through MCM Unlocked's announce (setExternalHotkey), which applies the name/colour. On a layer
    // other than the default, the name/colour also go on that layer of the key.
    // ---------------------------------------------------------------
    function pickTitle() {
        if (!pick) return '';
        if (pick.manual) return 'the SKSE menu page waiting for a key';
        return pick.mod && pick.option ? pick.mod + ': ' + pick.option : (pick.option || pick.mod || 'MCM key');
    }
    function startPick(info) {
        let i = info;
        try { if (typeof info === 'string') i = JSON.parse(info); } catch (_) { i = {}; }
        if (moveMode) exitMoveMode();
        if (colorMode) exitColorMode();
        if (settingsOpen) toggleSettings();
        cancelHold(); hideContextMenu(); hideTooltip();
        pick = { manual: !!i.manual, mod: String(i.mod || ''), option: String(i.option || ''), current: Number(i.current) || 0 };
        document.body.classList.add('hkp-pick-mode');
        const cur = DIK_TO_CODE[pick.current];
        document.querySelectorAll('.hkp-pick-current').forEach(el => el.classList.remove('hkp-pick-current'));
        if (cur) document.querySelectorAll('[data-key-id="' + cur + '"]').forEach(el => el.classList.add('hkp-pick-current'));
        updateSwatchBarLabel();
    }
    function endPick() {
        if (pickModal) closePickModal();
        pick = null;
        document.body.classList.remove('hkp-pick-mode');
        document.querySelectorAll('.hkp-pick-current').forEach(el => el.classList.remove('hkp-pick-current'));
        updateSwatchBarLabel();
    }
    function openPickModal(keyId) {
        if (isReservedKey(keyId)) {
            flashStatus((KEY_CAPTION[keyId] || keyId) + ' opens the Hotkey Panel. Pick another key.');
            return;
        }
        const dik = CODE_TO_DIK[keyId];
        if (!dik) { flashStatus('That key cannot be bound from the panel. Press it on the keyboard instead.'); return; }
        cancelHold(); hideTooltip();
        const layer = currentLayerId();
        const caption = KEY_CAPTION[keyId] || keyId;
        const own = getKeyLayer(keyId, layer);
        pickModal = { keyId, dik, layer, color: (own && own.color) || 6 };
        document.getElementById('hkp-pick-title').textContent = 'Bind ' + caption +
            (layer !== 'default' ? '  (layer: ' + layerCaption(layer) + ')' : '');
        document.getElementById('hkp-pick-body').textContent = pick.manual
            ? 'Sent to the SKSE menu page waiting for a key.' : pickTitle();
        const others = conflictOwners(keyId);
        const warn = document.getElementById('hkp-pick-warn');
        warn.textContent = others.length ? 'Already on this key:\n' + others.map(o => '• ' + o).join('\n') : '';
        warn.classList.toggle('hkp-hidden', !others.length);
        const input = document.getElementById('hkp-pick-input');
        input.value = (own && own.label) || pick.option || '';
        renderPickSwatches();
        document.getElementById('hkp-modal-pick').classList.remove('hkp-hidden');
        dispatchToBridge('hkpPickModal', '1');
        setTimeout(() => { input.focus(); input.select(); }, 30);
    }
    function layerCaption(layer) {
        const [tap, mods] = layer.includes(':') ? layer.split(':') : ['single', layer];
        const m = mods === 'default' ? '' : mods.split('+').map(k => KEY_CAPTION[k] || k).join(' + ');
        const t = tap !== 'single' ? TAP_LABEL[tap] : '';
        return [m, t].filter(Boolean).join(', ') || 'default';
    }
    function renderPickSwatches() {
        const bar = document.getElementById('hkp-pick-swatches');
        bar.innerHTML = '';
        for (const p of PALETTE) {
            const sw = document.createElement('div');
            sw.className = 'hkp-swatch' + (pickModal && pickModal.color === p.idx ? ' selected' : '');
            sw.style.background = p.hex || 'repeating-linear-gradient(45deg, #333, #333 3px, #222 3px, #222 6px)';
            sw.title = p.hex || 'No colour';
            sw.onclick = () => { if (pickModal) { pickModal.color = p.idx; renderPickSwatches(); } };
            bar.appendChild(sw);
        }
    }
    function closePickModal() {
        pickModal = null;
        document.getElementById('hkp-modal-pick').classList.add('hkp-hidden');
        dispatchToBridge('hkpPickModal', '0');
    }
    function confirmPick() {
        if (!pickModal || !pick) return;
        const { keyId, dik, layer, color } = pickModal;
        const label = document.getElementById('hkp-pick-input').value.trim();
        // MCM: the name/colour ride on MCM Unlocked's announce. SKSE menu pages announce nothing,
        // so there the name/colour go straight onto the key, on the layer on screen.
        if (!pick.manual) pendingPick = { dik, label, color, t: Date.now() };
        if (layer !== 'default' || pick.manual) {
            ensureKeyLayer(keyId, layer);
            const e = state.keys[keyId].layers[layer];
            if (label) e.label = label;
            e.color = color;
            refreshAll(); save();
        }
        closePickModal();
        dispatchToBridge('hkpPickKey', String(dik));   // the DLL closes the panel and binds it
    }

    // ---------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------
    window.HKP = {
        setExternalHotkey, setGameKeys,
        startPick, endPick, setPickMode,
        confirmPick: () => confirmPick(),
        cancelPick: () => closePickModal(),
        onPickKeydown: (e) => {
            if (e.key === 'Enter') { e.preventDefault(); confirmPick(); }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePickModal(); }
        },
        loadState(json) {
            try {
                const parsed = typeof json === 'string' ? JSON.parse(json) : json;
                state = Object.assign(JSON.parse(JSON.stringify(DEFAULT_STATE)), parsed);
                if (!state.profiles || !state.profiles.length) state.profiles = [{ name: 'DEFAULT', system: true }];
                state.activeModifiers = [];
                if (!state.activeTapMode) state.activeTapMode = 'single';
                if (!state.external || typeof state.external !== 'object') state.external = {};
                if (!state.extCustom || typeof state.extCustom !== 'object') state.extCustom = {};
                // b66da8c wrote mod keys into the key's own default layer, tagged `source`;
                // move them into the registry (the owner adds the move flag on its next announce).
                for (const [keyId, k] of Object.entries(state.keys || {})) {
                    if (!k || !k.layers) continue;
                    for (const [layerId, layer] of Object.entries(k.layers)) {
                        if (!layer || !layer.source) continue;
                        if (!state.external[layer.source])
                            state.external[layer.source] = { key: keyId, label: layer.label || '', color: layer.color || 0, move: false };
                        delete k.layers[layerId];
                    }
                    if (!Object.keys(k.layers).length) delete state.keys[keyId];
                }
                renderProfiles(); refreshAll(); updateModifierBadge(); applyTapModeBg(); applyLabelSize(); applyPanelScale(); applyPanelOpacity(); applyFont(); syncFontButton(); updateSwatchBarLabel();
                if (settingsOpen) syncSettingsInputs();
                // Tell the DLL about the persisted toggle key so its input
                // sink knows which key opens the panel. (Replaces what the old
                // Papyrus side used to do on quest OnInit.)
                pushToggleKeyToDLL();
            } catch (err) { console.error('HKP.loadState failed', err); }
        },
        show() {
            document.getElementById('hkp-root').classList.remove('hkp-hidden');
            // Wait one frame so layout is final, then size keys to container.
            requestAnimationFrame(() => layoutKeyboard());
        },
        hide() {
            document.getElementById('hkp-root').classList.add('hkp-hidden');
            if (pick) endPick();
            hideContextMenu(); hideTooltip();
            if (moveMode) exitMoveMode();
            if (colorMode) exitColorMode();
            if (settingsOpen) toggleSettings();
        },
        close(e) {
            // Stop the click event so its mouseup doesn't propagate to the
            // game world after the BlockerMenu pops. Without this, LMB-up
            // can leak to Skyrim and desync inputs (e.g. Power Attack /
            // Cast Left thinks LMB is half-held), causing "lost controls"
            // until the panel is reopened and closed via Tab/Esc.
            if (e) {
                if (e.preventDefault) e.preventDefault();
                if (e.stopPropagation) e.stopPropagation();
            }
            // Defer one animation frame so the click event fully finishes
            // draining through the UI input pipeline before we tear down
            // the Prisma view + Scaleform blocker menu. Esc/Tab close path
            // doesn't need this because there's no in-flight mouse event.
            const self = this;
            requestAnimationFrame(() => {
                dispatchToBridge('hkpCloseUI', '1');
                self.hide();
            });
        },
        toggleSettings, setToggleEnabled, startBindToggleKey, exitColorMode, cycleTapMode, setLabelSize,
        setPanelScale, previewPanelScale, setPanelOpacity,
        setFonts, toggleFontDD, pickFont,
        setRemote, setRemotePort, setRemoteInfo,
        saveEdit: () => saveEditInternal(),
        cancelEdit: () => cancelEdit(),
        onEditKeydown: (e) => { if (e.key === 'Enter') saveEditInternal(); else if (e.key === 'Escape') cancelEdit(); },
        saveProfile: () => {
            const name = document.getElementById('hkp-modal-profile-input').value;
            if (pendingProfileCallback) pendingProfileCallback(name);
            pendingProfileCallback = null;
            document.getElementById('hkp-modal-profile').classList.add('hkp-hidden');
        },
        cancelProfile: () => cancelProfile(),
        onProfileKeydown: (e) => { if (e.key === 'Enter') window.HKP.saveProfile(); else if (e.key === 'Escape') cancelProfile(); },
        confirmOk: () => {
            document.getElementById('hkp-modal-confirm').classList.add('hkp-hidden');
            const cb = pendingConfirmCallback; pendingConfirmCallback = null;
            if (cb) cb();
        },
        confirmCancel: () => confirmCancel(),
        _state: () => state,
        _pickSwatch: pickSwatch
    };

})();
