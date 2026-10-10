const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('[HEADROOM PACKAGED APP VERIFICATION] Probing packaged desktop binary...');

const root = path.resolve(__dirname, '..');
const packagedExe = path.join(root, 'release', 'win-unpacked', 'HEADROOM IDE.exe');

if (!fs.existsSync(packagedExe)) {
    console.error(`[VERIFICATION FAILED] Packaged executable not found at: ${packagedExe}`);
    process.exit(1);
}

const stats = fs.statSync(packagedExe);
console.log(`[PACKAGED ARTIFACT FOUND] Size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);

const child = spawn(packagedExe, [], {
    cwd: path.dirname(packagedExe),
    env: {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: '1'
    },
    stdio: 'pipe'
});

let hasCrashed = false;
let exitCode = null;

child.on('error', (err) => {
    console.error('[ERROR] Failed to spawn packaged binary:', err.message);
    hasCrashed = true;
});

child.on('exit', (code) => {
    exitCode = code;
    if (code !== null && code !== 0 && !child.killed) {
        console.error(`[ERROR] Packaged application exited unexpectedly with code ${code}`);
        hasCrashed = true;
    }
});

setTimeout(() => {
    if (hasCrashed) {
        console.error('[VERIFICATION FAILED] Packaged application crashed on launch.');
        process.exit(1);
    } else {
        console.log('[VERIFICATION PASSED] Packaged binary launched successfully and ran stably without crash.');
        try {
            child.kill();
        } catch (e) {}
        process.exit(0);
    }
}, 4000);
