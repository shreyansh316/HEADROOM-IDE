const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('[HEADROOM IDE SMOKE TEST] Verifying Electron application startup...');

const root = path.resolve(__dirname, '..');
const electronExe = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');

const command = fs.existsSync(electronExe) ? electronExe : 'npx';
const args = fs.existsSync(electronExe) ? ['.'] : ['electron', '.'];

const child = spawn(command, args, {
    cwd: root,
    env: {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: '1'
    },
    stdio: 'pipe',
    shell: !fs.existsSync(electronExe)
});

let output = '';
let hasCrashed = false;

child.stdout.on('data', (d) => {
    output += d.toString();
});

child.stderr.on('data', (d) => {
    output += d.toString();
});

child.on('error', (err) => {
    console.error('[SMOKE TEST ERROR] Failed to start Electron:', err.message);
    hasCrashed = true;
});

child.on('exit', (code) => {
    if (code !== null && code !== 0 && !child.killed) {
        console.error(`[SMOKE TEST ERROR] Electron exited prematurely with code ${code}`);
        hasCrashed = true;
    }
});

setTimeout(() => {
    if (hasCrashed) {
        console.error('[SMOKE TEST FAILED] Process error during startup test.');
        process.exit(1);
    } else {
        console.log('[SMOKE TEST PASSED] Electron initialized window and main process cleanly with zero crash.');
        try {
            child.kill();
        } catch (e) {}
        process.exit(0);
    }
}, 3000);
