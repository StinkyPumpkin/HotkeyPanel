// HKP G-keys add-on hook (STUB — ships with the main mod).
// The personal "HKP GKeys Addon" mod folder OVERRIDES this file via the MO2 VFS
// with a real definition array:
//     window.HKP_GKEYS = [{ id: 'F19', cap: 'G1' }, ...];
// With this stub in place the G-key column stays hidden. Do not add logic here —
// hkp.js owns the rendering (buildGKeys).
window.HKP_GKEYS = null;
