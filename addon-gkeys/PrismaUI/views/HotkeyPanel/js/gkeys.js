// HKP GKeys Addon — StinkyPumpkin's personal Logitech G-key column.
// G1-G6 are remapped to F19-F24 in Logitech G HUB; this file overrides the main
// mod's stub via MO2 VFS priority (this folder must sit BELOW Hotkey Panel in
// the left pane so it wins the file conflict).
window.HKP_GKEYS = [
    { id: 'F19', cap: 'G1' },
    { id: 'F20', cap: 'G2' },
    { id: 'F21', cap: 'G3' },
    { id: 'F22', cap: 'G4' },
    { id: 'F23', cap: 'G5' },
    { id: 'F24', cap: 'G6' },
];
