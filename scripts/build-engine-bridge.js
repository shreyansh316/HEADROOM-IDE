const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

async function buildEngineBridge() {
    const outputDir = path.join(__dirname, '..', 'src', 'integration', 'headroom');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const headroomSrc = path.join(__dirname, '..', 'core', 'headroom', 'src');
    if (!fs.existsSync(headroomSrc)) {
        throw new Error(`Authoritative HEADROOM engine source not found at: ${headroomSrc}`);
    }

    console.log('[HEADROOM INTEGRATION] Bundling authoritative engine from:', headroomSrc);

    const bridgeSource = `
export * from './constants.js';
export * from './domain/index.js';
export * from './storage/index.js';
export * from './infrastructure/index.js';
export * from './core/ExecutionActivityFeed.js';
export * from './application/index.js';
`;

    const outfile = path.join(outputDir, 'headroomEngine.cjs');

    await esbuild.build({
        stdin: {
            contents: bridgeSource,
            resolveDir: headroomSrc,
            sourcefile: 'engineBridgeEntry.js',
            loader: 'js'
        },
        bundle: true,
        outfile,
        format: 'cjs',
        platform: 'node',
        target: 'node20',
        external: ['better-sqlite3', 'vscode'],
        sourcemap: false,
        minify: false
    });

    console.log('[HEADROOM INTEGRATION] Authoritative engine bridge generated successfully at:', outfile);
}

if (require.main === module) {
    buildEngineBridge().catch(err => {
        console.error('[HEADROOM INTEGRATION] Bridge build failed:', err);
        process.exit(1);
    });
}

module.exports = { buildEngineBridge };
