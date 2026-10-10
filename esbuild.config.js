const esbuild = require('esbuild');
const path = require('path');

const isWatch = process.argv.includes('--watch');

const buildOptions = {
    entryPoints: [path.join(__dirname, 'src', 'renderer', 'js', 'app.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome120'],
    outfile: path.join(__dirname, 'dist', 'renderer.bundle.js'),
    sourcemap: true,
    loader: {
        '.js': 'jsx'
    },
    define: {
        'process.env.NODE_ENV': '"development"'
    }
};

async function run() {
    try {
        if (isWatch) {
            const ctx = await esbuild.context(buildOptions);
            await ctx.watch();
            console.log('[HEADROOM IDE] esbuild watching renderer files...');
        } else {
            await esbuild.build(buildOptions);
            console.log('[HEADROOM IDE] Renderer bundle built successfully -> dist/renderer.bundle.js');
        }
    } catch (err) {
        console.error('[HEADROOM IDE] Build error:', err);
        process.exit(1);
    }
}

run();
