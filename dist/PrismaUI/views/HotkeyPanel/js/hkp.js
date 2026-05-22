/* =========================================================================
   Hotkey Panel — UI logic
   ========================================================================= */
(function () {
    'use strict';

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
        { idx: 10, hex: '#4a4a55', lum: 'dark' }
    ];

    const DEFAULT_STATE = {
        version: 1,
        settings: {
            toggleKey: 'F11',
            toggleKeyEnabled: true,
            labelFontSize: 18,
            panelScale: 100,    // percent, 12..100
            panelOpacity: 100   // percent, 20..100
        },
        profiles: [{ name: 'DEFAULT', system: true }],
        activeProfile: 'DEFAULT',
        modifierKeys: [],
        activeModifiers: [],
        activeTapMode: 'single',    // 'single' | 'double' | 'long'
        keys: {}
    };

    const TAP_MODES = ['single', 'double', 'long'];
    const TAP_LABEL = { single: 'Single', double: 'Double', long: 'Long' };

    let state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    let colorMode = null;
    let pendingEditKey = null;
    let pendingEditLayer = null;
    let pendingProfileCallback = null;
    let pendingConfirmCallback = null;
    let bindingToggleKey = false;
    let saveDebounce = null;
    let activeTooltip = null;
    let settingsOpen = false;

    // ---------------------------------------------------------------
    // Bootstrap
    // ---------------------------------------------------------------
    document.addEventListener('DOMContentLoaded', () => {
        buildKeyCaptions();
        renderKeyboard();
        renderMouse();
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
        el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); onKeyContext(keyId, el, e); });
        // PrismaUI may swallow contextmenu — also catch right-click via mousedown button=2
        el.addEventListener('mousedown', (e) => {
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
        el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); onKeyContext(keyId, el, e); });
        el.addEventListener('mousedown', (e) => {
            if (e.button === 2) { e.preventDefault(); e.stopPropagation(); onKeyContext(keyId, el, e); }
        });
        attachLongPress(el, keyId);
        el.addEventListener('mouseenter', (e) => maybeShowMouseTooltip(el, e));
        el.addEventListener('mouseleave', hideTooltip);
        return el;
    }

    function maybeShowMouseTooltip(el, evt) {
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
        const activeLayer = currentLayerId();
        const activeProf = state.activeProfile;
        document.querySelectorAll('.hkp-key').forEach(el => applyKeyVisual(el, activeLayer, activeProf));
        document.querySelectorAll('.hkp-m-input').forEach(el => applyMouseVisual(el, activeLayer, activeProf));
    }

    function applyKeyVisual(el, activeLayer, activeProf) {
        const keyId = el.dataset.keyId;
        const reserved = isReservedKey(keyId);
        const isMod = state.modifierKeys.includes(keyId);
        const keyData = getKeyLayer(keyId, activeLayer);

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
        const keyData = getKeyLayer(keyId, activeLayer);

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
        if (isReservedKey(keyId)) return;
        if (state.modifierKeys.includes(keyId)) { toggleActiveModifier(keyId); return; }
        if (colorMode !== null) applyColor(keyId);
    }

    function toggleActiveModifier(keyId) {
        const on = state.activeModifiers.includes(keyId);
        if (on) state.activeModifiers = state.activeModifiers.filter(k => k !== keyId);
        else state.activeModifiers = [...state.activeModifiers, keyId];
        updateModifierBadge();
        refreshAll();
    }

    function applyColor(keyId) {
        const layer = currentLayerId();
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
        if (isReservedKey(keyId)) return;
        if (state.activeProfile !== 'DEFAULT') {
            showContextMenu(evt.clientX, evt.clientY, buildProfileContextMenu(keyId));
            return;
        }
        showContextMenu(evt.clientX, evt.clientY, buildDefaultContextMenu(keyId));
    }

    function buildDefaultContextMenu(keyId) {
        const layer = currentLayerId();
        const isMod = state.modifierKeys.includes(keyId);
        return [
            { label: 'Edit name…', action: () => startEditName(keyId, layer) },
            { label: isMod ? 'Unmark as modifier' : 'Mark as modifier',
              action: () => toggleModifierFlag(keyId) },
            { sep: true },
            { label: 'Reset key', danger: true, action: () => resetKey(keyId) }
        ];
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
    function saveEditInternal() {
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
                const s = document.createElement('div');
                s.className = 'hkp-ctx-sep';
                menu.appendChild(s);
            } else {
                const b = document.createElement('button');
                b.className = 'hkp-ctx-item' + (it.danger ? ' hkp-ctx-danger' : '');
                b.textContent = it.label;
                b.onclick = () => { hideContextMenu(); it.action(); };
                menu.appendChild(b);
            }
        });
        menu.style.left = Math.min(x, window.innerWidth - 240) + 'px';
        menu.style.top = Math.min(y, window.innerHeight - 200) + 'px';
        menu.classList.remove('hkp-hidden');
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
        if (colorMode && colorMode.swatchIdx === idx) { exitColorMode(); return; }
        colorMode = { swatchIdx: idx };
        document.body.classList.add('hkp-color-mode');
        document.getElementById('hkp-swatch-bar').classList.add('hkp-active');
        [...document.querySelectorAll('.hkp-swatch')].forEach((sw, i) =>
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
        [...document.querySelectorAll('.hkp-swatch')].forEach(sw => sw.classList.remove('selected'));
        updateSwatchBarLabel();
    }
    // Shows color-mode tip while a swatch is picked, otherwise shows the current tap mode.
    function updateSwatchBarLabel() {
        const el = document.getElementById('hkp-swatch-label');
        if (!el) return;
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
        const sz = Number(state.settings.labelFontSize) || 18;
        document.getElementById('hkp-label-size').value = sz;
        document.getElementById('hkp-label-size-val').textContent = sz;
        const ps = Number(state.settings.panelScale) || 100;
        document.getElementById('hkp-panel-scale').value = ps;
        document.getElementById('hkp-panel-scale-val').textContent = ps + '%';
        const po = Number(state.settings.panelOpacity) || 100;
        document.getElementById('hkp-panel-opacity').value = po;
        document.getElementById('hkp-panel-opacity-val').textContent = po + '%';
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
        document.addEventListener('keydown', (e) => {
            if (bindingToggleKey) {
                e.preventDefault();
                if (e.key !== 'Escape') applyBoundToggle(e.code);
                bindingToggleKey = false;
                syncSettingsInputs();
                return;
            }
            if (e.key === 'Escape' || e.key === 'Tab') {
                e.preventDefault();
                // ESC/Tab cascade: close whatever is layered on top first.
                if (!document.getElementById('hkp-modal-confirm').classList.contains('hkp-hidden')) { confirmCancel(); return; }
                if (!document.getElementById('hkp-modal-edit').classList.contains('hkp-hidden'))    { cancelEdit(); return; }
                if (!document.getElementById('hkp-modal-profile').classList.contains('hkp-hidden')) { cancelProfile(); return; }
                if (!document.getElementById('hkp-ctx-menu').classList.contains('hkp-hidden'))     { hideContextMenu(); return; }
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
    function cancelEdit() { pendingEditKey = null; document.getElementById('hkp-modal-edit').classList.add('hkp-hidden'); }
    function cancelProfile() { pendingProfileCallback = null; document.getElementById('hkp-modal-profile').classList.add('hkp-hidden'); }

    // ---------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------
    window.HKP = {
        loadState(json) {
            try {
                const parsed = typeof json === 'string' ? JSON.parse(json) : json;
                state = Object.assign(JSON.parse(JSON.stringify(DEFAULT_STATE)), parsed);
                if (!state.profiles || !state.profiles.length) state.profiles = [{ name: 'DEFAULT', system: true }];
                state.activeModifiers = [];
                if (!state.activeTapMode) state.activeTapMode = 'single';
                renderProfiles(); refreshAll(); updateModifierBadge(); applyTapModeBg(); applyLabelSize(); applyPanelScale(); applyPanelOpacity(); updateSwatchBarLabel();
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
            hideContextMenu(); hideTooltip();
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
