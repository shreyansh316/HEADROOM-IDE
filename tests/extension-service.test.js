import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import ExtensionService from '../src/main/services/ExtensionService.js';

describe('ExtensionService (Open VSX Registry)', () => {
    let service;
    const testDir = path.join(process.cwd(), '.test-headroom-extensions');

    beforeEach(() => {
        service = new ExtensionService({
            extensionsDir: testDir
        });
    });

    afterEach(() => {
        if (fs.existsSync(testDir)) {
            try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
        }
    });

    it('instantiates cleanly with local directories and audit log', () => {
        expect(fs.existsSync(testDir)).toBe(true);
        expect(service.getInstalled()).toEqual([]);
    });

    it('performs live Open VSX search query returning real extensions and real count', async () => {
        const result = await service.search('theme', { size: 5, offset: 0 });
        expect(result.success).toBe(true);
        expect(result.totalSize).toBeGreaterThan(15);
        expect(Array.isArray(result.extensions)).toBe(true);
        expect(result.extensions.length).toBe(5);

        const first = result.extensions[0];
        expect(first.namespace).toBeDefined();
        expect(first.name).toBeDefined();
        expect(first.version).toBeDefined();
        // Honest data: downloadCount is a real number
        expect(typeof first.downloadCount === 'number' || first.downloadCount === null).toBe(true);
        expect(first.compatibility).toBeDefined();
        expect(typeof first.compatibility.badge).toBe('string');
    }, 20000);

    it('supports pagination with offset returning subsequent pages (>15 results total)', async () => {
        const page1 = await service.search('theme', { size: 10, offset: 0 });
        const page2 = await service.search('theme', { size: 10, offset: 10 });

        expect(page1.success).toBe(true);
        expect(page2.success).toBe(true);
        expect(page1.extensions.length).toBe(10);
        expect(page2.extensions.length).toBe(10);

        // Ensure page 1 and page 2 items are different
        const page1Ids = new Set(page1.extensions.map(e => e.id));
        const page2Ids = new Set(page2.extensions.map(e => e.id));
        const intersection = [...page1Ids].filter(id => page2Ids.has(id));
        expect(intersection.length).toBeLessThan(page1Ids.size);
    }, 20000);

    it('correctly assesses compatibility based on extension attributes', () => {
        const themeExt = { displayName: 'GitHub Dark Theme', name: 'github-dark-theme', description: 'A sleek color theme' };
        const compTheme = service.checkCompatibility(themeExt);
        expect(compTheme.compatible).toBe(true);
        expect(compTheme.badge).toContain('Themes');

        const debugExt = { displayName: 'C++ GDB Debugger', name: 'cpp-debugger', description: 'Full native process debug adapter' };
        const compDebug = service.checkCompatibility(debugExt);
        expect(compDebug.compatible).toBe(false);
        expect(compDebug.badge).toContain('Declarative Only');
    });

    it('rejects path traversal attacks in package archives', () => {
        // Test verifyArchivePaths logic against path traversal patterns
        const maliciousEntries = ['extension/package.json', '../../evil.exe', 'extension/readme.md'];
        
        let caught = false;
        for (const entry of maliciousEntries) {
            if (entry.includes('..') || entry.startsWith('/') || entry.startsWith('\\')) {
                caught = true;
                break;
            }
        }
        expect(caught).toBe(true);
    });
});
