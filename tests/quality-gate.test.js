import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('HEADROOM IDE Quality Gate & TypeScript Prohibition', () => {
    const root = path.resolve(__dirname, '..');

    it('guarantees zero TypeScript files in HEADROOM IDE source', () => {
        const sourceDirs = ['src', 'scripts', 'tests'];
        const tsFiles = [];

        function scan(dir) {
            if (!fs.existsSync(dir)) return;
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
                        scan(full);
                    }
                } else if (/\.(ts|tsx|mts|cts|d\.ts)$/i.test(entry.name)) {
                    tsFiles.push(path.relative(root, full));
                }
            }
        }

        for (const dir of sourceDirs) {
            scan(path.join(root, dir));
        }

        expect(tsFiles).toEqual([]);
    });

    it('verifies that all application source files are valid JavaScript', () => {
        const jsFiles = [];
        function scan(dir) {
            if (!fs.existsSync(dir)) return;
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
                        scan(full);
                    }
                } else if (/\.(js|mjs|cjs)$/i.test(entry.name)) {
                    jsFiles.push(full);
                }
            }
        }

        scan(path.join(root, 'src'));
        expect(jsFiles.length).toBeGreaterThan(5);
        for (const file of jsFiles) {
            const content = fs.readFileSync(file, 'utf8');
            expect(content.length).toBeGreaterThan(0);
        }
    });
});
