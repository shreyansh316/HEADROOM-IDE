/**
 * HEADROOM Desktop IDE — Engine Integration Boundary
 *
 * Exposes the authoritative HEADROOM engine adapter and runtime services
 * to the Electron main process and desktop IDE subsystems.
 */

const HeadroomEngineAdapter = require('./HeadroomEngineAdapter.js');
const engine = require('./headroomEngine.cjs');

module.exports = {
    HeadroomEngineAdapter,
    engine
};
