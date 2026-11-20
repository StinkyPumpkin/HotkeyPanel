// Hotkey Panel - G-key column (installed by the G-keys option; replaces the main mod's empty js/gkeys.js).
// Six extra keys G1-G6, set to send F19-F24 in the keyboard's own software (Logitech G HUB, Corsair iCUE,
// Razer Synapse, ...). GKeysInputBridge.dll makes F13-F24 real keys in Skyrim, so any mod can bind them.
// A different set-up: change the id (the F-key the G-key sends) and cap (the name on the panel) below.
window.HKP_GKEYS = [
    { id: 'F19', cap: 'G1' },
    { id: 'F20', cap: 'G2' },
    { id: 'F21', cap: 'G3' },
    { id: 'F22', cap: 'G4' },
    { id: 'F23', cap: 'G5' },
    { id: 'F24', cap: 'G6' },
];
