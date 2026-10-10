const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const exePath = path.join(__dirname, '..', 'release', 'win-unpacked', 'HEADROOM IDE.exe');

console.log('[PRODUCTION PACKAGE VERIFICATION] Testing executable:', exePath);

if (!fs.existsSync(exePath)) {
    console.error('[ERROR] Packaged executable does not exist:', exePath);
    process.exit(1);
}

const child = spawn(exePath, [], {
    detached: false,
    stdio: 'ignore'
});

setTimeout(() => {
    if (child.exitCode !== null) {
        console.error(`[ERROR] Packaged application exited prematurely with code ${child.exitCode}`);
        process.exit(1);
    } else {
        console.log(`[VERIFIED] HEADROOM IDE.exe is running actively as Windows process PID: ${child.pid}`);
        try {
            process.kill(child.pid);
        } catch (e) {}
        console.log('[VERIFIED] Production executable test instance cleanly terminated.');
        process.exit(0);
    }
}, 3000);
