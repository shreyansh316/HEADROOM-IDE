import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import AgencyProfileCatalog from '../src/main/services/AgencyProfileCatalog.js';

describe('AgencyProfileCatalog', () => {
    const catalog = new AgencyProfileCatalog();

    // 1. Development resolution and existing functionality
    it('resolves agency-agent profiles correctly in development', () => {
        const result = catalog.list({ limit: 1 });
        expect(result.divisions).toHaveLength(18);
        expect(result.total).toBe(282);
        expect(result.profiles).toHaveLength(1);
        expect(result.profiles[0]).not.toHaveProperty('guidance');
    });

    it('filters and pages profiles with bounded query arguments', () => {
        const result = catalog.list({ divisionId: 'engineering', query: 'frontend', offset: 0, limit: 5 });
        expect(result.profiles.length).toBeLessThanOrEqual(5);
        expect(result.profiles.every((profile) => profile.divisionId === 'engineering')).toBe(true);
        expect(() => catalog.list({ limit: 101 })).toThrow(/Invalid Agency profile catalog query/);
    });

    it('returns selected bounded profile guidance with an explicit untrusted marker', () => {
        const profile = catalog.getProfile(catalog.profiles[0].id);
        expect(profile.guidance.length).toBeGreaterThan(0);
        expect(profile.trust).toBe('untrusted-guidance');
        expect(() => catalog.getProfile('../README.md')).toThrow(/Invalid Agency profile id/);
        expect(catalog.getProfile('engineering/not-a-profile.md')).toBeNull();
    });

    // 2. Production packaging layout alignment
    it('verifies electron-builder package configuration includes core/agency-agents in extraResources', () => {
        const packageJsonPath = path.resolve(__dirname, '../package.json');
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        expect(pkg.build).toBeDefined();
        expect(pkg.build.extraResources).toBeDefined();

        const rule = pkg.build.extraResources.find(
            (r) => r.from === 'core/agency-agents' && r.to === 'core/agency-agents'
        );
        expect(rule).toBeDefined();
    });

    it('verifies production path resolution matches the configured Electron package layout', () => {
        const expected = AgencyProfileCatalog.getExpectedPackagingLocation();
        expect(expected).toContain(path.join('core', 'agency-agents'));

        // Test production resolution when process.resourcesPath is simulated
        const originalResourcesPath = process.resourcesPath;
        try {
            // Point to workspace root as mock resources container (where core/agency-agents exists)
            process.resourcesPath = path.resolve(__dirname, '..');
            const resolved = AgencyProfileCatalog.resolveDefaultRootPath();
            expect(resolved).toBe(fs.realpathSync.native(path.resolve(__dirname, '../core/agency-agents')));
        } finally {
            process.resourcesPath = originalResourcesPath;
        }
    });

    // 3. Required agent files presence in source and catalog
    it('verifies all 18 division directories and divisions.json exist in core/agency-agents', () => {
        const coreAgentsDir = path.resolve(__dirname, '../core/agency-agents');
        expect(fs.existsSync(coreAgentsDir)).toBe(true);

        const divisionsJsonPath = path.join(coreAgentsDir, 'divisions.json');
        expect(fs.existsSync(divisionsJsonPath)).toBe(true);

        const divisionsData = JSON.parse(fs.readFileSync(divisionsJsonPath, 'utf8'));
        const divisionKeys = Object.keys(divisionsData.divisions);
        expect(divisionKeys).toHaveLength(18);

        for (const divId of divisionKeys) {
            const divDir = path.join(coreAgentsDir, divId);
            expect(fs.existsSync(divDir)).toBe(true);
            expect(fs.statSync(divDir).isDirectory()).toBe(true);
        }
    });

    // 4. Missing directory produces useful actionable diagnostics
    it('produces an actionable diagnostic error with expected packaging location when directory is missing', () => {
        const missingPath = path.resolve(__dirname, '../non-existent-agents-dir-12345');
        let caughtError = null;

        try {
            new AgencyProfileCatalog(missingPath);
        } catch (err) {
            caughtError = err;
        }

        expect(caughtError).not.toBeNull();
        expect(caughtError.code).toBe('ENOENT');
        expect(caughtError.diagnostic).toBeDefined();
        expect(caughtError.diagnostic.status).toBe('missing');
        expect(caughtError.diagnostic.resolvedPath).toBe(missingPath);
        expect(caughtError.diagnostic.expectedPackagingLocation).toBeDefined();
        expect(caughtError.message).toContain('Expected packaging location:');
        expect(caughtError.message).toContain(missingPath);
    });

    it('returns a structured diagnostic object via static diagnose without throwing', () => {
        // Valid path diagnosis
        const validDiag = AgencyProfileCatalog.diagnose();
        expect(validDiag.available).toBe(true);
        expect(validDiag.resolvedPath).toBeDefined();

        // Missing path diagnosis
        const invalidDiag = AgencyProfileCatalog.diagnose('/missing/invalid/directory/path');
        expect(invalidDiag.available).toBe(false);
        expect(invalidDiag.code).toBe('ENOENT');
        expect(invalidDiag.expectedPackagingLocation).toBeDefined();
    });
});
