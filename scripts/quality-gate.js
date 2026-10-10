const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const mode = process.argv[2] || 'all';

const sourceRoots = ['src', 'scripts', 'tests'];
const rootFiles = ['package.json', 'esbuild.config.js', 'vitest.config.js'];

function collectFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') return [];
            return collectFiles(fullPath);
        }
        return [fullPath];
    });
}

function checkTypeScriptProhibition() {
    let tsFound = false;
    for (const dirName of sourceRoots) {
        const fullDir = path.join(root, dirName);
        if (!fs.existsSync(fullDir)) continue;
        const allFiles = collectFiles(fullDir);
        for (const file of allFiles) {
            const ext = path.extname(file).toLowerCase();
            if (ext === '.ts' || ext === '.tsx' || ext === '.d.ts' || ext === '.mts' || ext === '.cts') {
                const rel = path.relative(root, file);
                console.error(`[PROHIBITED TYPESCRIPT DETECTED] ${rel} is a TypeScript file! HEADROOM IDE requires JavaScript only.`);
                tsFound = true;
            }
        }
    }
    return !tsFound;
}

function checkSyntaxAndAst() {
    let passed = true;
    const jsFiles = [];
    for (const dirName of sourceRoots) {
        const fullDir = path.join(root, dirName);
        if (!fs.existsSync(fullDir)) continue;
        const allFiles = collectFiles(fullDir);
        for (const file of allFiles) {
            if (file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.cjs')) {
                jsFiles.push(file);
            }
        }
    }
    for (const rootFile of rootFiles) {
        const full = path.join(root, rootFile);
        if (fs.existsSync(full) && (full.endsWith('.js') || full.endsWith('.mjs') || full.endsWith('.cjs'))) {
            jsFiles.push(full);
        }
    }

    for (const file of jsFiles) {
        const rel = path.relative(root, file);
        const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
        if (result.status !== 0) {
            console.error(`[SYNTAX/AST ERROR] ${rel}:\n${result.stderr || result.stdout}`);
            passed = false;
        }
    }
    return { passed, count: jsFiles.length };
}

function checkLintHygiene() {
    let passed = true;
    const filesToCheck = [];
    for (const dirName of sourceRoots) {
        const fullDir = path.join(root, dirName);
        if (!fs.existsSync(fullDir)) continue;
        const allFiles = collectFiles(fullDir);
        for (const file of allFiles) {
            if (/\.(js|mjs|cjs|html|css|json)$/i.test(file)) {
                filesToCheck.push(file);
            }
        }
    }

    const debuggerRegex = /(^|[;{}\s])debugger\s*;/m;
    const conflictRegex = /^(<<<<<<<|=======|>>>>>>>)( |$)/m;

    for (const file of filesToCheck) {
        const rel = path.relative(root, file);
        const content = fs.readFileSync(file, 'utf8');

        if (debuggerRegex.test(content)) {
            console.error(`[LINT ERROR] ${rel}: remove debugger statement`);
            passed = false;
        }
        if (conflictRegex.test(content)) {
            console.error(`[LINT ERROR] ${rel}: unresolved git merge conflict marker`);
            passed = false;
        }
    }
    return { passed, count: filesToCheck.length };
}

console.log(`[HEADROOM IDE QUALITY GATE] Running mode: ${mode}`);

let overallSuccess = true;

if (mode === 'check-ts' || mode === 'all' || mode === 'typecheck') {
    const tsOk = checkTypeScriptProhibition();
    if (!tsOk) {
        overallSuccess = false;
        console.error('[FAILED] Prohibited TypeScript files found in HEADROOM IDE source!');
    } else {
        console.log('[PASSED] TypeScript prohibition check: 0 .ts/.tsx files found. 100% Pure JavaScript.');
    }
}

if (mode === 'typecheck' || mode === 'all') {
    const { passed, count } = checkSyntaxAndAst();
    if (!passed) {
        overallSuccess = false;
        console.error('[FAILED] Syntax/AST checks failed.');
    } else {
        console.log(`[PASSED] Syntax and AST validation passed for ${count} JavaScript files.`);
    }
}

if (mode === 'lint' || mode === 'all') {
    const { passed, count } = checkLintHygiene();
    if (!passed) {
        overallSuccess = false;
        console.error('[FAILED] Lint hygiene checks failed.');
    } else {
        console.log(`[PASSED] Lint hygiene checks passed for ${count} source files.`);
    }
}

if (!overallSuccess) {
    process.exit(1);
} else {
    console.log('[SUCCESS] All HEADROOM IDE Quality Gates verified successfully.');
    process.exit(0);
}
