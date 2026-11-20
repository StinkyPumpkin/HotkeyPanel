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
        ['MouseSideLeft1',   'Top left',       10.5, 47.0],   // --Claude 2026-11-20: names say where the button is
        ['MouseSideLeft2',   'Left side front', 10.5, 61.0],
        ['MouseSideLeft3',   'Left side back', 10.5, 75.0],
        ['Mouse3',           'Middle Click',   50.8,  8.0],
        ['Mouse2',           'Right Click',    86.0, 19.0],
        ['MouseTiltRight',   'Tilt Right',     88.5, 33.0],
        ['MouseSideRight1',  'Top right',      89.5, 47.0],
        ['MouseSideRight2',  'Right side front', 89.5, 61.0],
        ['MouseSideRight3',  'Right side back', 89.5, 75.0]
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
            remotePort: 8950,
            scanConfigs: true,    // --Claude 2026-10-01: show mods' keys found in their config files
            colorStyle: 'fill',   // --Claude 2026-11-20: 'fill' = the key takes its colour, 'dot' = a coloured dot on a plain key
            panelGeom: null       // --Claude 2026-11-20: {x, y, w, h} screen fractions after a move / resize; null = centred
        },
        swatches: null,   // --Claude 2026-11-20: the 26 saved colour squares ('#rrggbbaa'); null = the original palette
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
        extCustom: {},
        // --Claude 2026-10-01: config-file keys the user removed from the panel ({ [source]: true });
        // the next scan leaves them out
        scanHidden: {}
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
        attachWheelHandlers();
        wireGeom();
        applyGeom();
        updateModifierBadge();
        applyTapModeBg();
        applyLabelSize();
        applyPanelScale();
        applyPanelOpacity();
        updateSwatchBarLabel();
        layoutKeyboard();
        refreshAll();
        renderInfo();
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
        dispatchToBridge('hkpScanConfigs', state.settings.scanConfigs === false ? '0' : '1');
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
        // --Claude 2026-11-20: the keyboard takes all the height the bottom row (profiles, mouse, info,
        // controls) leaves; the bottom row keeps at least 26%. Keys are width-bound on a 16:9 screen, so
        // the spare height makes them taller (up to 1.35x their width) = more lines for a label.
        const mainInner = main.clientHeight - mainPadY - gap;
        // --Claude 2026-11-20: a big panel (4K, or resized to the whole screen) gave the bottom row a third of
        // the height; now it keeps about a quarter and the keys take the rest (up to 1.6x as tall as wide)
        const kbMaxH = mainInner - Math.max(230, mainInner * 0.25);
        const kbPadY = parseFloat(kbCs.paddingTop) + parseFloat(kbCs.paddingBottom);
        const availH = kbMaxH - kbPadY;
        const uW = Math.floor((availW - 108) / 22);
        const uH = Math.floor((availH - 20) / 6);
        const u = Math.max(40, Math.min(180, Math.min(uW, uH)));
        document.documentElement.style.setProperty('--hkp-u', u + 'px');
        let keyH = REMOTE ? u : Math.max(u, Math.min(uH, Math.round(u * 1.6)));
        stackStep = Math.max(3, Math.min(8, Math.round(u / 18)));
        // --Claude 2026-09-30: on a tablet with the mouse & profiles section folded away the
        // keyboard has the whole height, but a landscape screen keeps the keys width-bound, so
        // they grow TALLER instead (more lines for a label) - up to 2.5x their width.
        if (REMOTE && document.body.classList.contains('hkp-r-no-bottom')) {
            let used = 0;
            for (const c of main.children) {
                if (c !== kb && c.offsetParent !== null) used += c.offsetHeight + gap + parseFloat(getComputedStyle(c).marginBottom || 0);
            }
            const fullH = main.clientHeight - mainPadY - used - kbPadY;
            keyH = Math.max(u, Math.min(Math.floor((fullH - 20) / 6), Math.floor(u * 2.5)));
        }
        document.documentElement.style.setProperty('--hkp-key-h', keyH + 'px');
        // the mouse block keeps its shape (width from the row's height), so the drawing and its lines stay
        // as laid out instead of a narrow, tall column whose lines fan out and cross
        const bottom = document.querySelector('.hkp-bottom'), mw = document.querySelector('.hkp-mouse-wrap');
        if (bottom && mw && !REMOTE) {
            const bh = bottom.clientHeight;
            mw.style.width = Math.round(Math.max(380, Math.min(bh * 2.0, bottom.clientWidth * 0.46))) + 'px';
        }
        refitAll();
        drawMouseLines();
        drawGroupOutline();
    }

    window.addEventListener('resize', layoutKeyboard);

    // ---------------------------------------------------------------
    // --Claude 2026-11-20 polish: stacked keys, labels that fit, the pointed-at name scrolls,
    // and the info box in the bottom row.
    // ---------------------------------------------------------------

    // ---------------------------------------------------------------
    // --Claude 2026-11-20 colour wheel. A key's colour is either a palette number (older saves, and
    // the colours mods announce) or '#rrggbbaa' from the wheel. The squares are the user's saved
    // colours (state.swatches, 26 x '#rrggbbaa'; null = the original palette). Painting with a square
    // copies its colour onto the key, so changing a square later never recolours painted keys.
    // ---------------------------------------------------------------
    const KEY_BASE = [30, 27, 22];   // #1e1b16, the plain key under a see-through colour
    function shade(hex, k) {   // '#rrggbb' darkened (k < 1)
        const c = parseHex8(hex);
        return c ? '#' + hex2(c.r * k) + hex2(c.g * k) + hex2(c.b * k) : hex;
    }
    function hex2(v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); }
    function parseHex8(h) {
        const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(String(h || '').trim());
        if (!m) return null;
        const n = parseInt(m[1], 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
    }
    function toHex8(r, g, b, a) { return '#' + hex2(r) + hex2(g) + hex2(b) + hex2(a * 255); }
    function swatchList() {
        const def = PALETTE.slice(1).map(p => p.hex.toLowerCase() + 'ff');
        const s = Array.isArray(state.swatches) ? state.swatches : [];
        return def.map((d, i) => (parseHex8(s[i]) ? String(s[i]).toLowerCase() : d));
    }
    function colourInfo(c) {
        if (c == null || c === 0 || c === '') return null;
        const custom = typeof c !== 'number';
        const p = custom ? null : PALETTE[c];
        const rgb = custom ? parseHex8(c) : (p && p.hex ? parseHex8(p.hex) : null);
        if (!rgb) return null;
        const mix = (v, b) => v * rgb.a + b * (1 - rgb.a);
        const sr = mix(rgb.r, KEY_BASE[0]), sg = mix(rgb.g, KEY_BASE[1]), sb = mix(rgb.b, KEY_BASE[2]);
        const lumV = (0.2126 * sr + 0.7152 * sg + 0.0722 * sb) / 255;
        return {
            custom, rgb,
            css: 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + rgb.a.toFixed(3) + ')',
            dimCss: 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + (rgb.a * 0.45).toFixed(3) + ')',
            solid: '#' + hex2(sr) + hex2(sg) + hex2(sb),
            lum: custom ? (lumV > 0.5 ? 'light' : 'dark') : p.lum
        };
    }
    // see-through colours show over a checkerboard
    function swatchBg(el, css) {
        if (!css) {
            el.style.background = 'repeating-linear-gradient(45deg, #333, #333 3px, #222 3px, #222 6px)';
            return;
        }
        el.style.backgroundColor = '#2a2a2a';
        el.style.backgroundImage = 'linear-gradient(' + css + ',' + css + '),' +
            'linear-gradient(45deg,#4a4a4a 25%,transparent 25%,transparent 75%,#4a4a4a 75%),' +
            'linear-gradient(45deg,#4a4a4a 25%,transparent 25%,transparent 75%,#4a4a4a 75%)';
        el.style.backgroundSize = 'auto, 8px 8px, 8px 8px';
        el.style.backgroundPosition = '0 0, 0 0, 4px 4px';
    }
    // the key face, dot, fade and text colour for a colour (number or '#rrggbbaa')
    function paintKeyColour(el, col, dim) {
        const ci = colourInfo(col);
        el.dataset.color = typeof col === 'number' ? String(col) : (ci ? 'x' : '0');
        if (ci && ci.lum === 'light') el.dataset.lum = 'light'; else delete el.dataset.lum;
        const dotMode = document.body.classList.contains('hkp-color-dot');
        if (ci && ci.custom && !dotMode) el.style.setProperty('background', dim ? ci.dimCss : ci.css, dim ? 'important' : '');
        else el.style.removeProperty('background');
        el.style.setProperty('--kbg', ci ? ci.solid : '#1e1b16');
        const dotEl = el.querySelector('.hkp-dot');
        if (dotEl) dotEl.style.background = ci ? ci.css : '';
        return ci;
    }

    // ---- the wheel ----
    let cw = null;   // { h, s, v, a, old, slot } while the colour wheel is open
    function hsv2rgb(h, s, v) {
        const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
        return [f(5) * 255, f(3) * 255, f(1) * 255];
    }
    function rgb2hsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        let h = 0;
        if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx };
    }
    function cwHex() { const [r, g, b] = hsv2rgb(cw.h, cw.s, cw.v); return toHex8(r, g, b, cw.a); }
    function drawWheel() {
        const cv = document.getElementById('hkp-cw-wheel');
        if (!cv || !cv.getContext) return;
        const ctx = cv.getContext('2d'), W = cv.width, R = W / 2, img = ctx.createImageData(W, W), d = img.data;
        for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
            const dx = x - R + 0.5, dy = y - R + 0.5, dist = Math.sqrt(dx * dx + dy * dy), i = (y * W + x) * 4;
            if (dist > R) { d[i + 3] = 0; continue; }
            const h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
            const [r, g, b] = hsv2rgb(h, dist / R, cw.v);
            d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = dist > R - 1 ? Math.round(255 * (R - dist)) : 255;
        }
        ctx.putImageData(img, 0, 0);
    }
    function syncWheel(redraw) {
        if (!cw) return;
        if (redraw) drawWheel();
        const wrap = document.getElementById('hkp-cw-wheel-wrap'), R = wrap.clientWidth / 2;
        const knob = document.getElementById('hkp-cw-knob'), ang = cw.h * Math.PI / 180;
        knob.style.left = (R + Math.cos(ang) * cw.s * R) + 'px';
        knob.style.top = (R + Math.sin(ang) * cw.s * R) + 'px';
        const [r, g, b] = hsv2rgb(cw.h, cw.s, 1), [r2, g2, b2] = hsv2rgb(cw.h, cw.s, cw.v);
        const full = 'rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ')';
        const cur = 'rgb(' + Math.round(r2) + ',' + Math.round(g2) + ',' + Math.round(b2) + ')';
        document.querySelector('#hkp-cw-val .hkp-cw-fill').style.background = 'linear-gradient(90deg, #000, ' + full + ')';
        document.querySelector('#hkp-cw-alpha .hkp-cw-fill').style.background = 'linear-gradient(90deg, rgba(0,0,0,0), ' + cur + ')';
        document.querySelector('#hkp-cw-val .hkp-cw-thumb').style.left = (cw.v * 100) + '%';
        document.querySelector('#hkp-cw-alpha .hkp-cw-thumb').style.left = (cw.a * 100) + '%';
        const hex = cwHex(), ci = colourInfo(hex);
        swatchBg(document.getElementById('hkp-cw-new'), ci.css);
        const inp = document.getElementById('hkp-cw-hex');
        if (document.activeElement !== inp) inp.value = hex.toUpperCase();
        document.getElementById('hkp-cw-vval').textContent = Math.round(cw.v * 100) + '%';
        document.getElementById('hkp-cw-aval').textContent = Math.round(cw.a * 100) + '%';
    }
    function renderWheelSquares() {
        const bar = document.getElementById('hkp-cw-squares');
        if (!bar || !cw) return;
        bar.innerHTML = '';
        swatchList().forEach((hex, i) => {
            const sw = document.createElement('div');
            sw.className = 'hkp-swatch' + (cw.slot === i + 1 ? ' selected' : '');
            swatchBg(sw, colourInfo(hex).css);
            sw.title = 'Square ' + (i + 1) + ': ' + hex.toUpperCase();
            sw.onclick = () => { cw.slot = i + 1; renderWheelSquares(); syncSaveBtn(); };
            bar.appendChild(sw);
        });
        syncSaveBtn();
    }
    function syncSaveBtn() {
        const b = document.getElementById('hkp-cw-save');
        if (b) { b.disabled = !cw || !cw.slot; b.textContent = cw && cw.slot ? 'Save into square ' + cw.slot : 'Pick a square to save into'; }
    }
    function setWheelColour(hex) {
        const c = parseHex8(hex) || parseHex8('#c9a45c');
        const hsv = rgb2hsv(c.r, c.g, c.b);
        cw.h = hsv.h; cw.s = hsv.s; cw.v = hsv.v; cw.a = c.a;
    }
    function openColourWheel() {
        const slot = colorMode && colorMode.swatchIdx > 0 ? colorMode.swatchIdx : null;
        const start = colorMode && typeof colorMode.colour === 'string' ? colorMode.colour : '#c9a45cff';
        cw = { h: 0, s: 0, v: 1, a: 1, old: start, slot };
        setWheelColour(start);
        swatchBg(document.getElementById('hkp-cw-old'), colourInfo(start).css);
        document.getElementById('hkp-modal-color').classList.remove('hkp-hidden');
        renderWheelSquares();
        requestAnimationFrame(() => syncWheel(true));
    }
    function closeColourWheel() {
        cw = null;
        document.getElementById('hkp-modal-color').classList.add('hkp-hidden');
    }
    function dragOn(el, fn) {
        el.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            fn(e);
            const mv = (ev) => fn(ev);
            const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
            document.addEventListener('mousemove', mv);
            document.addEventListener('mouseup', up);
        });
    }
    function attachWheelHandlers() {
        const wrap = document.getElementById('hkp-cw-wheel-wrap');
        if (!wrap) return;
        dragOn(wrap, (e) => {
            if (!cw) return;
            const r = wrap.getBoundingClientRect(), R = r.width / 2;
            const dx = e.clientX - r.left - R, dy = e.clientY - r.top - R;
            cw.h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
            cw.s = Math.min(1, Math.sqrt(dx * dx + dy * dy) / R);
            syncWheel(false);
        });
        const track = (id, key) => {
            const t = document.getElementById(id);
            dragOn(t, (e) => {
                if (!cw) return;
                const r = t.getBoundingClientRect();
                cw[key] = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
                syncWheel(key === 'v');
            });
        };
        track('hkp-cw-val', 'v');
        track('hkp-cw-alpha', 'a');
    }
    function cwHexInput(v) {
        if (!cw) return;
        let h = String(v || '').trim();
        if (!h.startsWith('#')) h = '#' + h;
        if (!parseHex8(h)) return;
        setWheelColour(h);
        syncWheel(true);
    }
    function cwSave() {
        if (!cw || !cw.slot) return;
        const list = swatchList();
        list[cw.slot - 1] = cwHex();
        state.swatches = list;
        save();
        renderSwatches();
        renderWheelSquares();
        flashStatus('Saved into square ' + cw.slot + '.', 2500);
    }
    function cwUse() {
        if (!cw) return;
        const hex = cwHex(), slot = cw.slot && swatchList()[cw.slot - 1] === hex ? cw.slot : -1;
        closeColourWheel();
        startColourMode(slot, hex);
    }

    // ---------------------------------------------------------------
    // --Claude 2026-11-20: move the panel by its edge or its title, resize it from the corner grip (as in
    // PEM). Saved as screen fractions in settings.panelGeom; null = centred at the old "Panel size". A resize
    // shows an outline and lays the keys out once, on release; a double press on the grip = the default again.
    // No transform on the panel (in PEM a transform made clicks land off). PrismaUI: mousemove carries no
    // button state, so a drag runs from our mousedown to our mouseup; Unfocus sends a move to (0,0); the DLL
    // calls hide() before Unfocus, and hide() drops a running drag.
    // ---------------------------------------------------------------
    const GEOM_MARGIN = 6, GEOM_MIN = [760, 420];
    let geomDrag = null, gripDownAt = 0;
    function geomDefault(W, H) {
        const k = (Number(state.settings.panelScale) || 100) / 100, w = W * 0.92 * k, h = H * 0.94 * k;
        return { x: (W - w) / 2, y: (H - h) / 2, w, h };
    }
    function geomClamp(g, W, H) {
        const m = GEOM_MARGIN;
        const w = Math.max(Math.min(GEOM_MIN[0], W - 2 * m), Math.min(g.w, W - 2 * m));
        const h = Math.max(Math.min(GEOM_MIN[1], H - 2 * m), Math.min(g.h, H - 2 * m));
        return { x: Math.min(Math.max(g.x, m), W - w - m), y: Math.min(Math.max(g.y, m), H - h - m), w, h };
    }
    function setRootRect(g) {
        const s = document.getElementById('hkp-root').style;
        s.left = Math.round(g.x) + 'px'; s.top = Math.round(g.y) + 'px';
        s.width = Math.round(g.w) + 'px'; s.height = Math.round(g.h) + 'px';
    }
    function savedGeom() {
        const g = state.settings.panelGeom;
        return g && [g.x, g.y, g.w, g.h].every(v => typeof v === 'number' && isFinite(v)) && g.w > 0.05 && g.h > 0.05 ? g : null;
    }
    function applyGeom() {
        if (REMOTE || geomDrag) return;
        const W = window.innerWidth, H = window.innerHeight, f = savedGeom();
        setRootRect(geomClamp(f ? { x: f.x * W, y: f.y * H, w: f.w * W, h: f.h * H } : geomDefault(W, H), W, H));
    }
    function resetGeom() {
        state.settings.panelGeom = null;
        applyGeom(); layoutKeyboard(); save();
    }
    const GEOM_HANDLES = ['hkp-main', 'hkp-bottom', 'hkp-keyboard', 'hkp-kb-main', 'hkp-kb-nav', 'hkp-kb-numpad',
                          'hkp-row', 'hkp-row-gap', 'hkp-nav-empty', 'hkp-kb-title', 'hkp-drag-glyph'];
    function isGeomHandle(el) {
        if (!el || !el.closest) return false;
        if (el.id === 'hkp-root') return true;
        if (el.closest('.hkp-kb-title')) return true;
        return GEOM_HANDLES.some(c => el.classList && el.classList.contains(c));
    }
    function wireGeom() {
        if (REMOTE) return;
        document.addEventListener('mousedown', (e) => {
            if (geomDrag) endGeomDrag(false);   // its mouseup never came: back where it was
            if (e.button !== 0 || !e.target || !e.target.closest || !e.target.closest('#hkp-root')) return;
            if (e.target.closest('.hkp-modal, .hkp-settings-panel, .hkp-context-menu')) return;
            if (e.target.closest('#hkp-grip')) {
                e.preventDefault(); e.stopPropagation();
                const now = Date.now();
                if (now - gripDownAt < 400) { gripDownAt = 0; resetGeom(); return; }   // JS-timed double press
                gripDownAt = now;
                startGeomDrag('size', e);
                return;
            }
            if (!isGeomHandle(e.target)) return;
            startGeomDrag('move', e);
        }, true);
        document.addEventListener('mousemove', geomMove, true);
        document.addEventListener('mouseup', (e) => { if (geomDrag && e.button === 0) endGeomDrag(true); }, true);
        window.addEventListener('blur', () => endGeomDrag(false));
        window.addEventListener('resize', applyGeom);
    }
    function startGeomDrag(kind, e) {
        const r = document.getElementById('hkp-root').getBoundingClientRect();
        geomDrag = { kind, sx: e.clientX, sy: e.clientY, g: { x: r.left, y: r.top, w: r.width, h: r.height }, moved: false, last: null };
    }
    function geomMove(e) {
        const d = geomDrag;
        if (!d) return;
        if (e.clientX === 0 && e.clientY === 0) return;   // PrismaUI's Unfocus reset, not the user
        const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
        if (!d.moved) {
            if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;   // still a click
            d.moved = true;
            if (d.kind === 'size') gripDownAt = 0;
            document.body.classList.add(d.kind === 'move' ? 'hkp-dragging' : 'hkp-resizing');
            hideContextMenu(); hideTooltip();
        }
        const W = window.innerWidth, H = window.innerHeight;
        if (d.kind === 'move') {
            d.last = geomClamp({ x: d.g.x + dx, y: d.g.y + dy, w: d.g.w, h: d.g.h }, W, H);
            setRootRect(d.last);
        } else {
            // the top-left corner stays; the size runs from the minimum to the screen edge
            const m = GEOM_MARGIN, maxW = W - d.g.x - m, maxH = H - d.g.y - m;
            d.last = { x: d.g.x, y: d.g.y,
                       w: Math.max(Math.min(GEOM_MIN[0], maxW), Math.min(d.g.w + dx, maxW)),
                       h: Math.max(Math.min(GEOM_MIN[1], maxH), Math.min(d.g.h + dy, maxH)) };
            let gh = document.getElementById('hkp-geom-ghost');
            if (!gh) { gh = document.createElement('div'); gh.id = 'hkp-geom-ghost'; document.body.appendChild(gh); }
            gh.style.left = Math.round(d.last.x) + 'px'; gh.style.top = Math.round(d.last.y) + 'px';
            gh.style.width = Math.round(d.last.w) + 'px'; gh.style.height = Math.round(d.last.h) + 'px';
            gh.style.display = 'block';
        }
    }
    // commit = a real mouseup: keep and save the new place. Anything else puts the panel back.
    function endGeomDrag(commit) {
        const d = geomDrag;
        if (!d) return;
        geomDrag = null;
        document.body.classList.remove('hkp-dragging', 'hkp-resizing');
        const gh = document.getElementById('hkp-geom-ghost');
        if (gh) gh.style.display = 'none';
        if (!d.moved) return;   // a plain click on the edge or the grip
        if (!commit || !d.last) { applyGeom(); return; }
        const W = window.innerWidth, H = window.innerHeight, g = d.last;
        setRootRect(g);
        state.settings.panelGeom = { x: +(g.x / W).toFixed(4), y: +(g.y / H).toFixed(4), w: +(g.w / W).toFixed(4), h: +(g.h / H).toFixed(4) };
        if (d.kind === 'size') layoutKeyboard();
        save();
    }
    let stackStep = 4;
    function escHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }
    // "ShiftLeft+ControlLeft" / "double:default" -> "Ctrl + Shift" / "Double tap"
    function layerName(layerId) {
        let tap = 'single', mods = layerId || 'default';
        const i = mods.indexOf(':');
        if (i > 0) { tap = mods.slice(0, i); mods = mods.slice(i + 1); }
        const m = mods === 'default' ? '' : mods.split('+').map(k => KEY_CAPTION[k] || k).join(' + ');
        const t = tap === 'single' ? '' : TAP_LABEL[tap] + ' tap';
        return [m, t].filter(Boolean).join(', ') || 'Default';
    }
    // Every other layer where this key has a name (the user's own or a mod's), with its colour.
    function otherLayers(keyId, cur) {
        const ids = new Set();
        const k = state.keys[keyId];
        if (k && k.layers) for (const [id, l] of Object.entries(k.layers)) if (l && l.label) ids.add(id);
        for (const [, e] of (extByKey[keyId] || [])) ids.add(extLayer(e));
        ids.delete(cur);
        const out = [];
        for (const id of ids) {
            const v = viewLayer(keyId, id);
            if (v && v.label) out.push({ id, label: v.label, color: resolveColor(v, state.activeProfile) });
        }
        return out;
    }
    // Up to 3 cards peek out under the key, each in the colour of what that layer holds. The key itself
    // gets smaller by the same amount (--st), so the stack stays inside the key's own cell.
    function applyStack(el, others) {
        el._stackCols = others.slice(0, 3).map(o => o.color);
        paintStack(el);
    }
    function paintStack(el) {
        const cols = el._stackCols || [];
        el.classList.toggle('hkp-stacked', cols.length > 0);
        if (!cols.length) { el.style.removeProperty('--st'); el.style.boxShadow = ''; return; }
        const s = stackStep, sh = [], dotMode = document.body.classList.contains('hkp-color-dot');
        cols.forEach((c, i) => {
            const ci = dotMode ? null : colourInfo(c), d = s * (i + 1), fill = ci ? shade(ci.solid, 0.62) : '#3b3428';
            sh.push(d + 'px ' + d + 'px 0 -1px ' + fill, d + 'px ' + d + 'px 0 0 rgba(6,5,4,.95)');
        });
        el.style.setProperty('--st', (s * cols.length) + 'px');
        el.style.boxShadow = sh.join(', ');
    }
    // A label shrinks (to 72% of the label size at most) until no word is cut and no line is lost.
    // Still too long: it ends in "..." and scrolls while pointed at; the info box shows it in full.
    function fitLabel(lbl) {
        if (REMOTE || !lbl || lbl.classList.contains('hkp-run')) return;
        const base = labelSize();
        const key = lbl.textContent + '|' + base + '|' + lbl.parentNode.clientWidth + 'x' + lbl.parentNode.clientHeight;
        if (lbl._fit === key) return;
        lbl._fit = key;
        lbl.style.fontSize = '';
        lbl.classList.remove('hkp-ovf');
        if (!lbl.textContent || !lbl.clientWidth) return;
        const over = () => lbl.scrollWidth > lbl.clientWidth + 1 || lbl.scrollHeight > lbl.clientHeight + 1;
        const min = Math.max(9, Math.round(base * 0.72));
        let size = base;
        for (let i = 0; i < 5 && over() && size > min; i++) {
            const byW = lbl.scrollWidth > lbl.clientWidth + 1 ? Math.floor(size * lbl.clientWidth / lbl.scrollWidth) : size;
            size = Math.max(min, Math.min(size - 1, byW));
            lbl.style.fontSize = size + 'px';
        }
        if (over()) lbl.classList.add('hkp-ovf');
    }
    function refitAll() {
        document.querySelectorAll('.hkp-key-label, .hkp-m-label').forEach(fitLabel);
        document.querySelectorAll('.hkp-stacked').forEach(paintStack);
    }
    let mq = null;
    function startMarquee(el) {
        stopMarquee();
        const lbl = el && el.querySelector('.hkp-key-label, .hkp-m-label');
        if (!lbl || !lbl.classList.contains('hkp-ovf')) return;
        const txt = lbl.textContent;
        lbl.classList.add('hkp-run');
        lbl.textContent = '';
        const track = document.createElement('span');
        track.className = 'hkp-run-track';
        const a = document.createElement('b'); a.textContent = txt;
        track.appendChild(a); track.appendChild(a.cloneNode(true));
        lbl.appendChild(track);
        const unit = a.offsetWidth, t0 = performance.now(), pause = 450, speed = 42;
        mq = { lbl, txt, raf: 0 };
        const step = now => {
            const t = now - t0, x = t < pause ? 0 : ((t - pause) / 1000 * speed) % unit;
            track.style.transform = 'translateX(' + (-x) + 'px)';
            mq.raf = requestAnimationFrame(step);
        };
        mq.raf = requestAnimationFrame(step);
    }
    function stopMarquee() {
        if (!mq) return;
        cancelAnimationFrame(mq.raf);
        mq.lbl.classList.remove('hkp-run');
        mq.lbl.textContent = mq.txt;
        mq = null;
    }
    let infoKey = null, infoTimer = null;
    function onKeyHover(keyId, el) {
        clearTimeout(infoTimer);
        infoKey = keyId;
        renderInfo();
        startMarquee(el);
        litMouseZone(keyId, true);
    }
    function onKeyLeave(keyId) {
        stopMarquee();
        litMouseZone(keyId, false);
        clearTimeout(infoTimer);
        infoTimer = setTimeout(() => { infoKey = null; renderInfo(); }, 150);
    }
    function litMouseZone(keyId, on) {
        const z = document.querySelector('.hkp-mouse-svg [data-mz="' + keyId + '"]');
        if (z) z.classList.toggle('hkp-lit', on);
        document.querySelectorAll('#hkp-mouse-lines [data-ml="' + keyId + '"]').forEach(l => l.classList.toggle('hkp-lit', on));
    }
    function colourChip(idx) {
        const ci = colourInfo(idx);
        return '<span class="hkp-chip"' + (ci ? ' style="background:' + ci.css + '"' : '') + '></span>';
    }
    function renderInfo() {
        const box = document.getElementById('hkp-info');
        if (!box) return;
        if (!infoKey) {
            box.innerHTML = '<div class="hkp-info-idle">Point at a key to see its whole name and what it does on its other layers.</div>';
            return;
        }
        const keyId = infoKey, cur = currentLayerId();
        const reserved = isReservedKey(keyId);
        const v = reserved ? { label: 'Opens Hotkey Panel', color: 0 } : viewLayer(keyId, cur);
        const isMod = state.modifierKeys.includes(keyId);
        let h = '<div class="hkp-info-head"><span class="hkp-info-key">' + escHtml(KEY_CAPTION[keyId] || keyId) + '</span>' +
                '<span class="hkp-info-layer">' + escHtml(layerName(cur)) + '</span></div>';
        if (v && v.label) h += '<div class="hkp-info-name">' + colourChip(resolveColor(v, state.activeProfile)) + '<span>' + escHtml(v.label) + '</span></div>';
        else h += '<div class="hkp-info-name hkp-info-empty">' + (isMod ? 'Modifier key: click it to show its layer.' : 'Nothing here. Right-click to name it.') + '</div>';
        const others = reserved ? [] : otherLayers(keyId, cur);
        if (others.length) {
            h += '<div class="hkp-info-sub">On other layers</div>';
            others.forEach(o => { h += '<div class="hkp-info-row">' + colourChip(o.color) + '<b>' + escHtml(layerName(o.id)) + '</b><span>' + escHtml(o.label) + '</span></div>'; });
        }
        // every other thing bound to this key; the ones that clash carry the "!"
        const all = [];
        const own = getKeyLayer(keyId, cur);
        if (own && own.label && v && own.label !== v.label) all.push({ t: own.label + '  (your name)', clash: false });
        (extByKey[keyId] || []).forEach(([s, e]) => {
            const t = extLabel(s, e) + '  (' + ownerName(s) + ')';
            if (v && extShownLabel(s, e) === v.label && extLayer(e) === cur) return;
            all.push({ t: t + (countsAsConflict(s, e) ? '' : '  - only in its own menu'), clash: countsAsConflict(s, e) });
        });
        (gameKeys[keyId] || []).forEach(ev => all.push({ t: ev + '  (Skyrim control)', clash: true }));
        const nClash = conflictOwners(keyId).length;
        if (all.length) {
            h += '<div class="hkp-info-sub' + (nClash > 1 ? ' hkp-info-warn' : '') + '">' + (nClash > 1 ? 'Clash - ' + nClash + ' things use this key' : 'Also on this key') + '</div>';
            all.forEach(o => { h += '<div class="hkp-info-row' + (o.clash && nClash > 1 ? ' hkp-info-warnrow' : '') + '">' + (o.clash && nClash > 1 ? '<i class="hkp-info-bang">!</i>' : '<i class="hkp-info-dot"></i>') + '<span>' + escHtml(o.t) + '</span></div>'; });
        }
        box.innerHTML = h;
    }

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
            if (rs > 1) el.style.height = `calc(${rs} * var(--hkp-key-h) + ${rs - 1} * var(--hkp-key-gap) - var(--st, 0px))`;
            if (cs > 1) el.style.width = `calc(${cs} * var(--hkp-u) + ${cs - 1} * var(--hkp-key-gap) - var(--st, 0px))`;
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
        const dot = document.createElement('div');
        dot.className = 'hkp-dot';
        el.appendChild(dot);
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
        if (REMOTE) {
            el.addEventListener('mouseenter', (e) => maybeShowTooltip(keyId, el, e));
            el.addEventListener('mouseleave', hideTooltip);
        } else {
            el.addEventListener('mouseenter', () => onKeyHover(keyId, el));
            el.addEventListener('mouseleave', () => onKeyLeave(keyId));
        }
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
    // --Claude 2026-11-20: a drawn generic mouse (no brand picture) between two columns of button
    // boxes; the pointed-at box lights its button on the drawing, and bound buttons take their colour.
    const MOUSE_LEFT  = ['Mouse1', 'MouseTiltLeft', 'MouseSideLeft1', 'MouseSideLeft2', 'MouseSideLeft3'];
    const MOUSE_RIGHT = ['Mouse2', 'MouseTiltRight', 'MouseSideRight1', 'MouseSideRight2', 'MouseSideRight3'];
    // --Claude 2026-11-20: laid out like the old picture's mouse: two buttons on top behind the wheel
    // (the third box each side) and two thumb/side buttons per flank (the last two boxes). MOUSE_ANCHOR = where
    // each box's line ends on the drawing (viewBox units).
    const MOUSE_SVG =
        '<svg class="hkp-mouse-svg" viewBox="0 0 120 200" preserveAspectRatio="xMidYMid meet">' +
        '<path class="hkp-m-body" d="M60 4 C30 4 13 24 11 60 L9 130 C9 174 31 196 60 196 C89 196 111 174 111 130 L109 60 C107 24 90 4 60 4 Z"/>' +
        '<path class="hkp-mz" data-mz="Mouse1" d="M46 8.5 C28 10.5 15.5 27 13.5 60 L12.7 86 Q28 92 46 93 Z"/>' +
        '<path class="hkp-mz" data-mz="Mouse2" d="M74 8.5 C92 10.5 104.5 27 106.5 60 L107.3 86 Q92 92 74 93 Z"/>' +
        '<path class="hkp-m-spine" d="M48 12 H72 V90 Q60 94 48 90 Z"/>' +
        '<rect class="hkp-mz" data-mz="Mouse3" x="54" y="20" width="12" height="32" rx="6"/>' +
        '<path class="hkp-m-ridge" d="M56.5 27 H63.5 M56.5 32 H63.5 M56.5 37 H63.5 M56.5 42 H63.5 M56.5 47 H63.5"/>' +
        '<path class="hkp-mz" data-mz="MouseTiltLeft" d="M52.5 30 L49 36 L52.5 42 Z"/>' +
        '<path class="hkp-mz" data-mz="MouseTiltRight" d="M67.5 30 L71 36 L67.5 42 Z"/>' +
        '<rect class="hkp-mz" data-mz="MouseSideLeft1" x="50" y="62" width="8.5" height="13" rx="2.5"/>' +
        '<rect class="hkp-mz" data-mz="MouseSideRight1" x="61.5" y="62" width="8.5" height="13" rx="2.5"/>' +
        '<rect class="hkp-mz" data-mz="MouseSideLeft2" x="4" y="92" width="9" height="18" rx="3"/>' +
        '<rect class="hkp-mz" data-mz="MouseSideLeft3" x="4.5" y="116" width="9" height="18" rx="3"/>' +
        '<rect class="hkp-mz" data-mz="MouseSideRight2" x="107" y="92" width="9" height="18" rx="3"/>' +
        '<rect class="hkp-mz" data-mz="MouseSideRight3" x="106.5" y="116" width="9" height="18" rx="3"/>' +
        '</svg>';
    const MOUSE_ANCHOR = {
        Mouse1: [40, 24], Mouse2: [80, 24], Mouse3: [60, 22],   // click dots high on the buttons: their lines stay above the tilt lines
        MouseTiltLeft: [51, 36], MouseTiltRight: [69, 36],
        MouseSideLeft1: [54.25, 68.5], MouseSideRight1: [65.75, 68.5],
        MouseSideLeft2: [8.5, 101], MouseSideLeft3: [9, 125],
        MouseSideRight2: [111.5, 101], MouseSideRight3: [111, 125]
    };
    // A line from each box to its button, ending in a dot (as the old picture had).
    function drawMouseLines() {
        const stage = document.getElementById('hkp-mouse-stage');
        const pic = stage && stage.querySelector('.hkp-mouse-svg');
        if (!pic || REMOTE || !stage.offsetWidth) return;
        let svg = document.getElementById('hkp-mouse-lines');
        if (!svg) {
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.id = 'hkp-mouse-lines';
            stage.appendChild(svg);
        }
        const sr = stage.getBoundingClientRect(), pr = pic.getBoundingClientRect();
        const k = Math.min(pr.width / 120, pr.height / 200);
        const midBox = stage.querySelector('.hkp-m-mid .hkp-m-input'), mid = midBox && midBox.getBoundingClientRect();
        const ox = pr.left - sr.left + (pr.width - 120 * k) / 2, oy = pr.top - sr.top + (pr.height - 200 * k) / 2;
        let h = '';
        for (const [id, [ax, ay]] of Object.entries(MOUSE_ANCHOR)) {
            const box = stage.querySelector('.hkp-m-input[data-key-id="' + id + '"]');
            if (!box) continue;
            const b = box.getBoundingClientRect();
            const px = ox + ax * k, py = oy + ay * k;
            let pts;
            if (id === 'Mouse3') {
                const bx = b.left - sr.left + b.width / 2, by = b.bottom - sr.top;
                pts = bx + ',' + by + ' ' + px + ',' + py;
            } else {
                const left = b.left + b.width / 2 < pr.left + pr.width / 2;
                const bx = left ? b.right - sr.left : b.left - sr.left, by = b.top - sr.top + b.height / 2;
                if ((id === 'Mouse1' || id === 'Mouse2') && mid) {
                    // route: out of the box, under the Middle Click box, then down to the button
                    const kx = left ? mid.left - sr.left + 12 : mid.right - sr.left - 12, ky = mid.bottom - sr.top + 16;
                    pts = bx + ',' + by + ' ' + kx + ',' + ky + ' ' + px + ',' + py;
                } else if (id === 'MouseSideLeft2' || id === 'MouseSideRight2') {
                    // the front side button: angled like the back one, up to just beside the body at the button's
                    // height, then into it - so its line passes the back button on the outside
                    const edge = left ? ox + 4 * k - 3 : ox + 116 * k + 3;
                    const kx = bx + (left ? 10 : -10);
                    pts = bx + ',' + by + ' ' + kx + ',' + by + ' ' + edge + ',' + py + ' ' + px + ',' + py;
                } else {
                    const kx = bx + (left ? 10 : -10);
                    pts = bx + ',' + by + ' ' + kx + ',' + by + ' ' + px + ',' + py;
                }
            }
            h += '<polyline class="hkp-ml" data-ml="' + id + '" points="' + pts + '"/>' +
                 '<circle class="hkp-ml-dot" data-ml="' + id + '" cx="' + px + '" cy="' + py + '" r="' + Math.max(2.5, 2.2 * k) + '"/>';
        }
        svg.innerHTML = h;
    }
    function renderMouse() {
        const stage = document.getElementById('hkp-mouse-stage');
        stage.innerHTML = '';
        const col = (cls, ids) => {
            const c = document.createElement('div');
            c.className = 'hkp-m-col ' + cls;
            ids.forEach(k => c.appendChild(makeMouseInput(k, KEY_CAPTION[k])));
            return c;
        };
        const mid = document.createElement('div');
        mid.className = 'hkp-m-mid';
        mid.appendChild(makeMouseInput('Mouse3', KEY_CAPTION.Mouse3));
        mid.insertAdjacentHTML('beforeend', MOUSE_SVG);
        stage.appendChild(col('hkp-m-left', MOUSE_LEFT));
        stage.appendChild(mid);
        stage.appendChild(col('hkp-m-right', MOUSE_RIGHT));
        stage.querySelectorAll('[data-mz]').forEach(z => {
            const k = z.getAttribute('data-mz');
            const box = stage.querySelector('.hkp-m-input[data-key-id="' + k + '"]');
            z.addEventListener('mouseenter', () => { if (box) { box.classList.add('hkp-m-hot'); onKeyHover(k, box); } });
            z.addEventListener('mouseleave', () => { if (box) box.classList.remove('hkp-m-hot'); onKeyLeave(k); });
        });
    }

    function makeMouseInput(keyId, placeholder) {
        const el = document.createElement('div');
        el.className = 'hkp-m-input';
        el.dataset.keyId = keyId;

        const cap = document.createElement('div');
        cap.className = 'hkp-key-cap';
        cap.textContent = placeholder || keyId;
        el.appendChild(cap);
        const dot = document.createElement('div');
        dot.className = 'hkp-dot';
        el.appendChild(dot);

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
        if (REMOTE) {
            el.addEventListener('mouseenter', (e) => maybeShowMouseTooltip(el, e));
            el.addEventListener('mouseleave', hideTooltip);
        } else {
            el.addEventListener('mouseenter', () => onKeyHover(keyId, el));
            el.addEventListener('mouseleave', () => onKeyLeave(keyId));
        }
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
        if (infoKey) renderInfo();
        drawGroupOutline();
    }

    // --Claude 2026-11-20: a mod profile's keys get one glowing outline. Keys next to each other share it
    // (the outline runs round the whole group); a lone key gets its own. Drawn as the outline of the union
    // of the keys' cells (each grown by half the key gap so neighbours touch), on an SVG over the panel.
    function drawGroupOutline() {
        const main = document.querySelector('.hkp-main');
        if (!main || REMOTE) return;
        let svg = document.getElementById('hkp-group-svg');
        if (!svg) {
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.id = 'hkp-group-svg';
            main.appendChild(svg);
        }
        const prof = state.activeProfile;
        if (!prof || prof === 'DEFAULT' || !main.offsetWidth) { svg.innerHTML = ''; return; }
        const mr = main.getBoundingClientRect(), zk = main.offsetWidth ? mr.width / main.offsetWidth : 1;
        // --Claude 2026-11-20 in-game test: neighbours were outlined one by one there, so the reach comes from
        // the gap actually measured between Q|W and Q/A (never under 6 px)
        const gapOf = (a, b, horiz) => {
            const A = document.querySelector('.hkp-key[data-key-id="' + a + '"]'), B = document.querySelector('.hkp-key[data-key-id="' + b + '"]');
            if (!A || !B) return 0;
            const ra = A.getBoundingClientRect(), rb = B.getBoundingClientRect(), sa = (A._stackCols || []).length * stackStep * zk;
            return horiz ? rb.left - (ra.right + sa) : rb.top - (ra.bottom + sa);
        };
        const gap = Math.max(gapOf('KeyQ', 'KeyW', true), gapOf('KeyQ', 'KeyA', false), 0) / zk;
        const pad = Math.max(6, gap / 2 + 2), rd = v => Math.round(v * 2) / 2;
        const rects = [];
        document.querySelectorAll('.hkp-key, .hkp-m-input').forEach(el => {
            if (el.classList.contains('hkp-dim') || el.classList.contains('hkp-reserved') || !el.offsetWidth) return;
            const r = el.getBoundingClientRect(), st = (el._stackCols || []).length * stackStep;
            const L = (r.left - mr.left) / zk, T = (r.top - mr.top) / zk, R = (r.right - mr.left) / zk, B = (r.bottom - mr.top) / zk;
            rects.push([rd(L - pad), rd(T - pad), rd(R + st + pad), rd(B + st + pad)]);
        });
        if (!rects.length) { svg.innerHTML = ''; return; }
        const xs = [...new Set(rects.flatMap(r => [r[0], r[2]]))].sort((a, b) => a - b);
        const ys = [...new Set(rects.flatMap(r => [r[1], r[3]]))].sort((a, b) => a - b);
        const xi = new Map(xs.map((v, i) => [v, i])), yi = new Map(ys.map((v, i) => [v, i]));
        const W = xs.length - 1, H = ys.length - 1, cov = new Uint8Array(W * H);
        for (const r of rects)
            for (let j = yi.get(r[1]); j < yi.get(r[3]); j++)
                for (let i = xi.get(r[0]); i < xi.get(r[2]); i++) cov[j * W + i] = 1;
        const c = (i, j) => (i >= 0 && j >= 0 && i < W && j < H) ? cov[j * W + i] : 0;
        let d = '';
        for (let j = 0; j <= H; j++) {
            let run = -1;
            for (let i = 0; i <= W; i++) {
                const e = i < W && c(i, j - 1) !== c(i, j);
                if (e && run < 0) run = i;
                if (!e && run >= 0) { d += 'M' + xs[run] + ' ' + ys[j] + 'H' + xs[i]; run = -1; }
            }
        }
        for (let i = 0; i <= W; i++) {
            let run = -1;
            for (let j = 0; j <= H; j++) {
                const e = j < H && c(i - 1, j) !== c(i, j);
                if (e && run < 0) run = j;
                if (!e && run >= 0) { d += 'M' + xs[i] + ' ' + ys[run] + 'V' + ys[j]; run = -1; }
            }
        }
        svg.innerHTML = '<path class="hkp-grp-glow" d="' + d + '"/><path class="hkp-grp-line" d="' + d + '"/>';
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
        if (mq && mq.lbl === lbl) stopMarquee();
        if (reserved) {
            lbl.textContent = 'Hotkeys';
            lbl.classList.remove('hkp-empty');
            el.dataset.color = '0';
            delete el.dataset.lum;
            applyStack(el, []);
            fitLabel(lbl);
            return;
        }
        if (keyData && keyData.label) { lbl.textContent = keyData.label; lbl.classList.remove('hkp-empty'); }
        else { lbl.textContent = ''; lbl.classList.add('hkp-empty'); }
        paintKeyColour(el, resolveColor(keyData, activeProf), dim);
        if (!REMOTE) applyStack(el, otherLayers(keyId, activeLayer));
        fitLabel(lbl);
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
        if (mq && mq.lbl === lbl) stopMarquee();
        if (keyData && keyData.label) { lbl.textContent = keyData.label; lbl.classList.remove('hkp-empty'); }
        else { lbl.textContent = ''; lbl.classList.add('hkp-empty'); }

        const ci = paintKeyColour(el, resolveColor(keyData, activeProf), dim);
        if (!REMOTE) applyStack(el, otherLayers(keyId, activeLayer));
        fitLabel(lbl);
        // the drawing's button takes the colour too
        const z = document.querySelector('.hkp-mouse-svg [data-mz="' + keyId + '"]');
        if (z) z.style.fill = ci ? ci.solid : '';
        if (z) z.classList.toggle('hkp-bound', !!(keyData && keyData.label));
        if (z) z.classList.toggle('hkp-tinted', !!ci);
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
                const c = customFor(src, !!colorMode.colour);
                if (!c) return;
                if (!colorMode.colour) delete c.color; else c.color = colorMode.colour;
            });
            refreshAll(); save();
            return;
        }
        ensureKeyLayer(keyId, layer);
        const entry = state.keys[keyId].layers[layer];
        if (state.activeProfile === 'DEFAULT') {
            // Set the default (base) color for this layer
            if (colorMode.colour) entry.color = colorMode.colour; else delete entry.color;
        } else {
            // Set a profile-specific color override — only applies while this profile is active
            if (!entry.profileColors) entry.profileColors = {};
            if (!colorMode.colour) {
                // Clearing the profile override (revert to default color under this profile)
                delete entry.profileColors[state.activeProfile];
            } else {
                entry.profileColors[state.activeProfile] = colorMode.colour;
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
        // keys found in config files never take the user's own name, so it stays editable
        const hasExt = extOnLayer(keyId, layer).some(([s]) => !s.startsWith('SCAN:'));
        const items = buildExtItems(keyId, layer);
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
    function buildExtItems(keyId, layer) {
        const items = [];
        const ext = extOnLayer(keyId, layer);
        const owners = layer === 'default' ? conflictOwners(keyId) : [];
        if (owners.length > 1) items.push({ note: true, warn: true, label: 'Conflict: ' + owners.length + ' actions on this key, remap all but one' });
        ext.forEach(([src, e]) => {
            items.push({ head: true, label: extShownLabel(src, e) + '  ·  ' + ownerName(src) });
            if (e.move) items.push({ label: 'Move Key…', action: () => startMove(src) });
            else        items.push({ note: true, label: rebindNote(src) });
            items.push({ label: 'Rename…', action: () => startEditExtName(src) });
            // --Claude 2026-10-01: a key that only works inside its own menu / mode is no clash
            if (!(e.mods && e.mods.length)) {
                items.push(countsAsConflict(src, e)
                    ? { label: 'Only works in its own menu (not a conflict)', action: () => setConflictIgnored(src, true) }
                    : { label: 'Count it in key conflicts', action: () => setConflictIgnored(src, false) });
            }
            items.push({ label: 'Remove from panel', danger: true, action: () => removeExt(src) });
            items.push({ sep: true });
        });
        const game = layer === 'default' ? gameKeys[keyId] : null;
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
            // --Claude 2026-10-01 (user renamed a scanned key, the panel kept the old name until
            // Reset key): the key's own name hides config-file keys, so renaming one of them
            // replaces that name. Colour and profiles stay.
            if (val && e && e.key && src.startsWith('SCAN:')) {
                const own = getKeyLayer(e.key, extLayer(e));
                if (own && own.label) own.label = '';
            }
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
        // --Claude 2026-11-20: Clear is the LAST box, so the Nth box is square N here and in the wheel
        const list = swatchList().map((h, i) => [h, i + 1]).concat([[0, 0]]);
        list.forEach(([hex, idx]) => {
            const sw = document.createElement('div');
            sw.className = 'hkp-swatch' + (colorMode && colorMode.swatchIdx === idx ? ' selected' : '');
            swatchBg(sw, idx ? colourInfo(hex).css : null);
            sw.title = idx ? 'Square ' + idx + ': ' + hex.toUpperCase() : 'Clear colour';
            sw.dataset.idx = String(idx);
            sw.onclick = () => pickSwatch(idx);
            bar.appendChild(sw);
        });
    }
    function pickSwatch(idx) {
        if (moveMode) exitMoveMode();
        if (colorMode && colorMode.swatchIdx === idx) { exitColorMode(); return; }
        startColourMode(idx, idx ? swatchList()[idx - 1] : 0);
    }
    // colour mode paints `colour` (0 = clear); swatchIdx = its square, -1 = a wheel colour in no square
    function startColourMode(idx, colour) {
        if (moveMode) exitMoveMode();
        colorMode = { swatchIdx: idx, colour };
        document.body.classList.add('hkp-color-mode');
        document.getElementById('hkp-swatch-bar').classList.add('hkp-active');
        [...document.querySelectorAll('#hkp-swatches .hkp-swatch')].forEach(sw =>
            sw.classList.toggle('selected', Number(sw.dataset.idx) === idx));
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
            el.textContent = !colorMode.colour
                ? 'Clear color — click keys to remove' + forProf + '. Click swatch again to exit.'
                : 'Color mode — click keys to apply' + forProf + '. Click swatch again or press ESC to exit.';
            el.classList.remove('hkp-swatch-label-tap');
        } else {
            // --Claude 2026-11-20: the tap mode already shows on its button
            el.textContent = REMOTE ? 'Tap mode: ' + (TAP_LABEL[state.activeTapMode || 'single']) : 'Colours';
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
        const sz = labelSize();
        document.getElementById('hkp-label-size').value = sz;
        document.getElementById('hkp-label-size-val').textContent = sz;
        const ps = Number(state.settings.panelScale) || 100;
        void ps;
        const po = Number(state.settings.panelOpacity) || 100;
        document.getElementById('hkp-panel-opacity').value = po;
        document.getElementById('hkp-panel-opacity-val').textContent = po + '%';
        syncFontButton();
        document.getElementById('hkp-remote-enabled').checked = !!state.settings.remoteEnabled;
        document.getElementById('hkp-remote-port').value = Number(state.settings.remotePort) || 8950;
        syncRemoteStatus();
        document.getElementById('hkp-scan-enabled').checked = state.settings.scanConfigs !== false;
        syncScanStatus();
        syncColorStyle();
    }
    // --Claude 2026-11-20: Key colours = Fill (the whole key) or Dot (a dot in the corner of a plain key;
    // keeps the panel even and leaves room for icons). Stack cards go plain in Dot mode too.
    function colorStyle() { return state.settings.colorStyle === 'dot' ? 'dot' : 'fill'; }
    function applyColorStyle() {
        document.body.classList.toggle('hkp-color-dot', colorStyle() === 'dot');
        refreshAll();
    }
    function syncColorStyle() {
        const f = document.getElementById('hkp-cs-fill'), d = document.getElementById('hkp-cs-dot');
        if (f) f.classList.toggle('hkp-on', colorStyle() === 'fill');
        if (d) d.classList.toggle('hkp-on', colorStyle() === 'dot');
    }
    function setColorStyle(v) {
        state.settings.colorStyle = v === 'dot' ? 'dot' : 'fill';
        applyColorStyle(); syncColorStyle(); save();
    }
    // --Claude 2026-09-30: a tablet / phone keeps its OWN label size (remote.js, stored on that
    // device), so shrinking labels to fit small keys there never changes the in-game panel.
    function labelSize() {
        if (REMOTE && window.HKP_REMOTE_LABEL) return window.HKP_REMOTE_LABEL.get();
        return Number(state.settings.labelFontSize) || 18;
    }
    function setLabelSize(val) {
        if (REMOTE && window.HKP_REMOTE_LABEL) {
            const sz = window.HKP_REMOTE_LABEL.set(val);
            document.getElementById('hkp-label-size-val').textContent = sz;
            applyLabelSize();
            return;
        }
        const sz = Math.max(10, Math.min(36, Number(val) || 18));
        state.settings.labelFontSize = sz;
        document.getElementById('hkp-label-size-val').textContent = sz;
        applyLabelSize();
        save();
    }
    function applyLabelSize() {
        document.documentElement.style.setProperty('--hkp-label-size', labelSize() + 'px');
        if (REMOTE && window.HKP_REMOTE_LABEL) window.HKP_REMOTE_LABEL.fit();
        else refitAll();
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
        if (btn) btn.textContent = state.settings.fontFamily || 'Default (Segoe UI)';
    }
    function applyFont() {
        const fam = state.settings.fontFamily;
        // --Claude 2026-11-20: the chosen font is for the labels only; menus, settings and the panel's own
        // text keep the plain Edge fonts. '' = the default label font.
        if (fam) document.documentElement.style.setProperty('--hkp-label-font', '"' + fam + '", "Segoe UI", Arial, sans-serif');
        else document.documentElement.style.removeProperty('--hkp-label-font');
        if (!REMOTE) refitAll();
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
                    // --Claude 2026-10-12: Shift held = a "Shift+" toggle; the bare key stays free
                    if (code && e.shiftKey && !/^Shift(Left|Right)$/.test(code)) code = 'Shift+' + code;
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
                if (!document.getElementById('hkp-modal-color').classList.contains('hkp-hidden'))   { closeColourWheel(); return; }
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
        // A key found in a mod's config file that the mod's MCM also announced (MCM Unlocked,
        // after a rebind) is the same bind twice: keep the announce.
        for (const [keyId, list] of Object.entries(extByKey)) {
            const mcm = list.filter(([s]) => s.startsWith('MCM:')).map(([s]) => normOwner(mcmName(s)));
            if (!mcm.length) continue;
            extByKey[keyId] = list.filter(([s, e]) => !(s.startsWith('SCAN:') && !(e.mods && e.mods.length) &&
                mcm.some(m => sameOwner(m, normOwner(e.owner)))));
        }
    }
    function normOwner(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
    function sameOwner(a, b) {
        return !!a && !!b && (a === b || (a.length >= 4 && b.includes(a)) || (b.length >= 4 && a.includes(b)));
    }

    // --Claude 2026-10-01: keys found in mods' config files (HotkeyScan.cpp). One scan result
    // replaces every SCAN: entry; entries the user removed stay out (state.scanHidden).
    // A key held with modifiers shows on that modifier layer when the user has those keys
    // marked as modifiers, else on the default layer as "Shift+…" (never as a conflict there).
    const MOD_FAMILY = {
        ShiftLeft: ['ShiftLeft', 'ShiftRight'], ShiftRight: ['ShiftLeft', 'ShiftRight'],
        ControlLeft: ['ControlLeft', 'ControlRight'], ControlRight: ['ControlLeft', 'ControlRight'],
        AltLeft: ['AltLeft', 'AltRight'], AltRight: ['AltLeft', 'AltRight']
    };
    let scanInfo = null;   // { found, shown, files, ms } of the last scan, for the Settings row
    function setScannedHotkeys(res) {
        let r = res;
        try { if (typeof res === 'string') r = JSON.parse(res); } catch (_) { r = null; }
        if (!r || !Array.isArray(r.entries)) return;
        if (!state.external) state.external = {};
        if (!state.scanHidden) state.scanHidden = {};
        const old = {};
        for (const [s, e] of Object.entries(state.external)) if (s.startsWith('SCAN:')) { old[s] = e; delete state.external[s]; }
        let shown = 0;
        if (state.settings.scanConfigs !== false) {
            r.entries.forEach(en => {
                const code = DIK_TO_CODE[en.dik];
                if (!code || !en.src || state.scanHidden[en.src]) return;
                const mods = (en.mods || []).map(d => DIK_TO_CODE[d]).filter(Boolean);
                const who = shortOwner(en.owner);
                state.external[en.src] = {
                    key: code, label: en.label ? who + ': ' + en.label : en.owner,
                    color: en.mcm ? 6 : 5, move: false, scan: true,
                    owner: en.owner, where: en.where, mcm: !!en.mcm, ctx: !!en.ctx, mods
                };
                shown++;
            });
        }
        scanInfo = { found: r.entries.length, shown, files: r.files, ms: r.ms };
        syncScanStatus();
        const now = {};
        for (const [s, e] of Object.entries(state.external)) if (s.startsWith('SCAN:')) now[s] = e;
        if (JSON.stringify(now) !== JSON.stringify(old)) { refreshAll(); save(); }
    }
    // Key faces are small: "PlayerEquipmentManager" -> "PEM", "True Directional Movement" -> "TDM".
    // The full name stays in the key's menu and the conflict list.
    function shortOwner(o) {
        const s = String(o || '').trim();
        if (s.length <= 12) return s;
        const words = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
            .split(/[^A-Za-z0-9]+/).filter(Boolean);
        if (words.length < 2) return s.slice(0, 12);
        return words.map(w => (/^[A-Z0-9]+$/.test(w) && w.length <= 4) ? w : w[0].toUpperCase()).join('');
    }
    // The layer a mod key shows on: 'default', or its modifiers as the user's modifier keys.
    function extLayer(e) {
        if (!e || !e.mods || !e.mods.length) return 'default';
        const picked = [];
        for (const m of e.mods) {
            const k = (MOD_FAMILY[m] || [m]).find(c => state.modifierKeys.includes(c));
            if (!k) return 'default';
            picked.push(k);
        }
        return [...new Set(picked)].sort().join('+');
    }
    function extOnLayer(keyId, layerId) {
        return (extByKey[keyId] || []).filter(([, e]) => extLayer(e) === layerId);
    }
    // Its label, "Shift+" in front when its modifiers have no layer of their own.
    function extShownLabel(src, e) {
        const label = extLabel(src, e);
        if (!e || !e.mods || !e.mods.length || extLayer(e) !== 'default') return label;
        return e.mods.map(m => KEY_CAPTION[m] || m).join('+') + '+ ' + label;
    }
    // A bare key that fires anywhere: modifier combos and keys the user (or a SkyPrompt
    // prompt) marked as menu-only are not clashes.
    function countsAsConflict(src, e) {
        if (!e || (e.mods && e.mods.length)) return false;
        const c = state.extCustom && state.extCustom[src];
        if (c && c.noConflict != null) return !c.noConflict;
        return !e.ctx;
    }
    function setConflictIgnored(src, ignored) {
        const e = state.external[src];
        const c = customFor(src, true);
        if (!!(e && e.ctx) === ignored) delete c.noConflict; else c.noConflict = ignored;
        if (!Object.keys(c).length) delete state.extCustom[src];
        refreshAll(); save();
    }

    // Settings row: "Mod keys from config files"
    function setScanConfigs(val) {
        state.settings.scanConfigs = !!val;
        dispatchToBridge('hkpScanConfigs', val ? '1' : '0');
        if (!val) {
            for (const s of Object.keys(state.external || {})) if (s.startsWith('SCAN:')) delete state.external[s];
            scanInfo = null;
            refreshAll();
        }
        syncScanStatus();
        save();
    }
    function rescanConfigs() {
        const el = document.getElementById('hkp-scan-status');
        if (el) el.textContent = 'Scanning…';
        dispatchToBridge('hkpScanConfigs', 'rescan');
    }
    function restoreScanHidden() {
        state.scanHidden = {};
        save();
        rescanConfigs();
    }
    function syncScanStatus() {
        const el = document.getElementById('hkp-scan-status');
        if (!el) return;
        const hidden = Object.keys(state.scanHidden || {}).length;
        const restore = document.getElementById('hkp-scan-restore');
        if (restore) {
            restore.classList.toggle('hkp-hidden', !hidden);
            restore.textContent = 'Restore removed (' + hidden + ')';
        }
        if (state.settings.scanConfigs === false) { el.textContent = 'Off.'; return; }
        if (!scanInfo) { el.textContent = REMOTE ? 'Scanned by the game.' : 'Not scanned yet.'; return; }
        el.textContent = scanInfo.shown + ' keys from ' + scanInfo.files + ' files (' + scanInfo.ms + ' ms)' +
            (scanInfo.found > scanInfo.shown ? ', ' + (scanInfo.found - scanInfo.shown) + ' hidden or not on the panel' : '') + '.';
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
        let ext = extOnLayer(keyId, layerId);
        // --Claude 2026-10-01: the user's own name beats keys found in config files (those
        // still count in conflicts and list in the key's menu); announced keys replace it as before.
        if (own && own.label) ext = ext.filter(([s]) => !s.startsWith('SCAN:'));
        if (!ext.length) return own;
        // --Claude 2026-11-20: one name on the key (the first); every name is listed in the info box
        return {
            label: extShownLabel(ext[0][0], ext[0][1]),
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
        if (src.startsWith('SCAN:')) {
            const e = state.external[src];
            return e ? (e.mcm && !/ MCM$/.test(e.owner) ? e.owner + ' MCM' : e.owner) : 'config file';
        }
        const i = src.indexOf(':');
        return i > 0 ? src.slice(0, i) : src;
    }
    function rebindNote(src) {
        if (src.startsWith('SCAN:')) {
            const e = state.external[src];
            if (e && e.mcm) return 'Rebind in ' + ownerName(src);
            return 'Set in ' + (e ? e.where : 'its config file');
        }
        return src.startsWith('MCM:') ? 'Rebind in ' + mcmName(src) + ' MCM' : 'Rebind in ' + ownerName(src);
    }
    // Everything that fires on this bare key: mod keys, vanilla controls (from the live control
    // map, so the user's controlmap.txt edits count), and the panel's own toggle key. Two or
    // more = a real clash that needs remapping; shown as a red ! with this list on hover.
    function conflictOwners(keyId) {
        const out = (extByKey[keyId] || []).filter(([s, e]) => countsAsConflict(s, e))
            .map(([s, e]) => extLabel(s, e) + '  (' + ownerName(s) + ')');
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
        // a config-file key would come back with the next scan
        if (src.startsWith('SCAN:')) { if (!state.scanHidden) state.scanHidden = {}; state.scanHidden[src] = true; syncScanStatus(); }
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
        pickModal = { keyId, dik, layer, color: (own && own.color) || swatchList()[5] };
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
        swatchList().map((h, i) => [h, i + 1]).concat([[0, 0]]).forEach(([hex, idx]) => {
            const sw = document.createElement('div');
            sw.className = 'hkp-swatch' + (pickModal && pickModal.color === hex ? ' selected' : '');
            swatchBg(sw, idx ? colourInfo(hex).css : null);
            sw.title = idx ? hex.toUpperCase() : 'No colour';
            sw.onclick = () => { if (pickModal) { pickModal.color = hex; renderPickSwatches(); } };
            bar.appendChild(sw);
        });
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
        setExternalHotkey, setGameKeys, setScannedHotkeys, setScanConfigs, rescanConfigs, restoreScanHidden,
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
                if (!state.scanHidden || typeof state.scanHidden !== 'object') state.scanHidden = {};
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
                renderSwatches(); applyColorStyle(); applyGeom(); renderProfiles(); refreshAll(); updateModifierBadge(); applyTapModeBg(); applyLabelSize(); applyPanelScale(); applyPanelOpacity(); applyFont(); syncFontButton(); updateSwatchBarLabel();
                if (settingsOpen) syncSettingsInputs();
                // Tell the DLL about the persisted toggle key so its input
                // sink knows which key opens the panel. (Replaces what the old
                // Papyrus side used to do on quest OnInit.)
                pushToggleKeyToDLL();
            } catch (err) { console.error('HKP.loadState failed', err); }
        },
        show() {
            endGeomDrag(false);
            applyGeom();
            document.getElementById('hkp-root').classList.remove('hkp-hidden');
            // Wait one frame so layout is final, then size keys to container.
            requestAnimationFrame(() => layoutKeyboard());
        },
        hide() {
            endGeomDrag(false);
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
        toggleSettings, setToggleEnabled, startBindToggleKey, exitColorMode, cycleTapMode, setLabelSize, setColorStyle, resetGeom,
        openColourWheel, closeColourWheel, cwSave, cwUse, cwHexInput,
        layout: () => layoutKeyboard(),
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
