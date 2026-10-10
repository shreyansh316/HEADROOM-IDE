const fs = require('fs');
const path = require('path');

const MAX_PROFILES = 500;
const MAX_PROFILE_BYTES = 64 * 1024;
const MAX_PAGE_SIZE = 100;
const PROFILE_ID = /^[a-z0-9-]+\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.md$/;

class AgencyProfileCatalog {
    constructor(rootPath) {
        if (rootPath !== undefined && rootPath !== null) {
            const resolved = path.resolve(rootPath);
            if (!fs.existsSync(resolved) || !fs.existsSync(path.join(resolved, 'divisions.json'))) {
                const expected = AgencyProfileCatalog.getExpectedPackagingLocation();
                const diagnostic = {
                    code: 'ENOENT',
                    status: 'missing',
                    resolvedPath: resolved,
                    expectedPackagingLocation: expected,
                    message: `Agency agent catalog directory not found at resolved path: "${resolved}". Expected packaging location: "${expected}".`
                };
                const error = new Error(diagnostic.message);
                error.code = 'ENOENT';
                error.diagnostic = diagnostic;
                error.resolvedPath = resolved;
                error.expectedPackagingLocation = expected;
                throw error;
            }
            try {
                this.rootPath = fs.realpathSync.native ? fs.realpathSync.native(resolved) : fs.realpathSync(resolved);
            } catch (_) {
                this.rootPath = resolved;
            }
        } else {
            this.rootPath = AgencyProfileCatalog.resolveDefaultRootPath();
        }

        this.divisions = this.loadDivisions();
        this.profiles = this.loadProfiles();
    }

    static getExpectedPackagingLocation() {
        if (process.resourcesPath) {
            return path.join(process.resourcesPath, 'core', 'agency-agents');
        }
        try {
            const electron = require('electron');
            const app = electron?.app || electron?.remote?.app;
            if (app && typeof app.getAppPath === 'function') {
                return path.join(path.dirname(app.getAppPath()), 'core', 'agency-agents');
            }
        } catch (_) {}
        return path.resolve(__dirname, '../../../core/agency-agents');
    }

    static resolveDefaultRootPath() {
        if (process.env.HEADROOM_AGENCY_AGENTS_PATH) {
            const envPath = path.resolve(process.env.HEADROOM_AGENCY_AGENTS_PATH);
            if (fs.existsSync(envPath) && fs.existsSync(path.join(envPath, 'divisions.json'))) {
                try {
                    return fs.realpathSync.native ? fs.realpathSync.native(envPath) : fs.realpathSync(envPath);
                } catch (_) {
                    return envPath;
                }
            }
        }

        const candidatePaths = [];

        // Production: Electron resources directory
        if (process.resourcesPath) {
            candidatePaths.push(path.join(process.resourcesPath, 'core', 'agency-agents'));
            candidatePaths.push(path.join(process.resourcesPath, 'agency-agents'));
        }

        // Production alternative: Electron app.getAppPath()
        try {
            const electron = require('electron');
            const app = electron?.app || electron?.remote?.app;
            if (app && typeof app.getAppPath === 'function') {
                const appPath = app.getAppPath();
                candidatePaths.push(path.join(path.dirname(appPath), 'core', 'agency-agents'));
                candidatePaths.push(path.join(path.dirname(appPath), 'agency-agents'));
                candidatePaths.push(path.join(appPath, 'core', 'agency-agents'));
            }
        } catch (_) {}

        // Development: Repository root relative to this service file
        candidatePaths.push(path.resolve(__dirname, '../../../core/agency-agents'));
        candidatePaths.push(path.resolve(__dirname, '../../../../core/agency-agents'));

        // Fallback: Working directory relative paths
        candidatePaths.push(path.resolve(process.cwd(), 'core', 'agency-agents'));
        candidatePaths.push(path.resolve(process.cwd(), 'agency-agents'));

        for (const candidate of candidatePaths) {
            const normalized = path.normalize(candidate);
            if (fs.existsSync(normalized) && fs.existsSync(path.join(normalized, 'divisions.json'))) {
                try {
                    return fs.realpathSync.native ? fs.realpathSync.native(normalized) : fs.realpathSync(normalized);
                } catch (_) {
                    return normalized;
                }
            }
        }

        const expectedPackagingLocation = AgencyProfileCatalog.getExpectedPackagingLocation();
        const diagnostic = {
            code: 'ENOENT',
            status: 'missing',
            searchedLocations: candidatePaths,
            expectedPackagingLocation,
            developmentLocation: path.resolve(__dirname, '../../../core/agency-agents'),
            message: `Agency agent catalog directory not found. Expected packaging location: "${expectedPackagingLocation}". ` +
                `Searched ${candidatePaths.length} candidate paths without finding "divisions.json". ` +
                `Please ensure "core/agency-agents" is included in electron-builder "extraResources" configuration.`
        };

        const error = new Error(diagnostic.message);
        error.code = 'ENOENT';
        error.diagnostic = diagnostic;
        error.expectedPackagingLocation = expectedPackagingLocation;
        error.searchedLocations = candidatePaths;
        throw error;
    }

    static diagnose(customPath) {
        try {
            const resolved = (customPath !== undefined && customPath !== null)
                ? path.resolve(customPath)
                : AgencyProfileCatalog.resolveDefaultRootPath();

            if (!fs.existsSync(resolved) || !fs.existsSync(path.join(resolved, 'divisions.json'))) {
                throw new Error(`Directory or divisions.json missing at: "${resolved}"`);
            }

            return {
                available: true,
                resolvedPath: resolved,
                expectedPackagingLocation: AgencyProfileCatalog.getExpectedPackagingLocation(),
                message: 'Agency agent catalog directory located successfully.'
            };
        } catch (err) {
            return err.diagnostic || {
                available: false,
                code: 'ENOENT',
                error: err.message,
                expectedPackagingLocation: AgencyProfileCatalog.getExpectedPackagingLocation()
            };
        }
    }

    loadDivisions() {
        const registryPath = path.join(this.rootPath, 'divisions.json');
        const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        if (!registry.divisions || typeof registry.divisions !== 'object') throw new Error('Agency division registry is invalid');
        return Object.freeze(Object.entries(registry.divisions).map(([id, division]) => {
            if (!/^[a-z0-9-]+$/.test(id) || typeof division?.label !== 'string') throw new Error('Agency division entry is invalid');
            return Object.freeze({ id, label: division.label });
        }));
    }

    loadProfiles() {
        const entries = [];
        for (const division of this.divisions) {
            const divisionPath = path.join(this.rootPath, division.id);
            const canonicalDivisionPath = fs.realpathSync.native(divisionPath);
            if (!this.isWithin(this.rootPath, canonicalDivisionPath)) throw new Error('Agency division escaped catalog root');
            this.collectProfiles(division, canonicalDivisionPath, '', entries);
        }
        return Object.freeze(entries.sort((a, b) => a.divisionId.localeCompare(b.divisionId) || a.name.localeCompare(b.name)));
    }

    collectProfiles(division, directoryPath, relativeDirectory, entries) {
        for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
            const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
            const entryPath = path.join(directoryPath, entry.name);
            if (entry.isSymbolicLink()) continue;
            if (entry.isDirectory()) {
                const canonicalPath = fs.realpathSync.native(entryPath);
                if (!this.isWithin(path.join(this.rootPath, division.id), canonicalPath)) {
                    throw new Error('Agency profile directory escaped its division');
                }
                this.collectProfiles(division, canonicalPath, relativePath, entries);
                continue;
            }
            if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.md') continue;
            const metadata = this.readMetadata(entryPath);
            if (!metadata) continue;
            entries.push(Object.freeze({
                id: `${division.id}/${relativePath}`,
                divisionId: division.id,
                divisionName: division.label,
                name: metadata.name || path.basename(entry.name, '.md').replace(/-/g, ' '),
                description: metadata.description || '',
                color: metadata.color || null,
                emoji: metadata.emoji || null,
                vibe: metadata.vibe || null
            }));
            if (entries.length > MAX_PROFILES) throw new Error('Agency profile catalog exceeds its profile limit');
        }
    }

    readMetadata(profilePath) {
        const text = fs.readFileSync(profilePath, 'utf8');
        const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
        if (!match) return null;
        const values = {};
        for (const line of match[1].split(/\r?\n/)) {
            const field = line.match(/^(name|description|color|emoji|vibe):\s*(.*?)\s*$/);
            if (field) values[field[1]] = this.scalar(field[2]);
        }
        return values;
    }

    scalar(value) {
        if (!value) return '';
        if (value.startsWith('"') && value.endsWith('"')) {
            try { return JSON.parse(value); } catch { return value.slice(1, -1); }
        }
        if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
        return value;
    }

    list({ divisionId, query, offset = 0, limit = 50 } = {}) {
        if (!Number.isSafeInteger(offset) || offset < 0
            || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE
            || (divisionId && !this.divisions.some(({ id }) => id === divisionId))
            || (query !== undefined && (typeof query !== 'string' || query.length > 200))) {
            throw new TypeError('Invalid Agency profile catalog query');
        }
        const term = (query || '').trim().toLocaleLowerCase();
        const matches = this.profiles.filter((profile) => (!divisionId || profile.divisionId === divisionId)
            && (!term || `${profile.name} ${profile.description} ${profile.divisionName}`.toLocaleLowerCase().includes(term)));
        return Object.freeze({ divisions: this.divisions, total: matches.length,
            profiles: Object.freeze(matches.slice(offset, offset + limit)) });
    }

    getProfile(id) {
        if (typeof id !== 'string' || id.length > 260 || !PROFILE_ID.test(id)) throw new TypeError('Invalid Agency profile id');
        const metadata = this.profiles.find((profile) => profile.id === id);
        if (!metadata) return null;
        const filePath = path.resolve(this.rootPath, ...id.split('/'));
        const canonicalPath = fs.realpathSync.native(filePath);
        if (!this.isWithin(this.rootPath, canonicalPath)) throw new Error('Agency profile escaped catalog root');
        const stats = fs.statSync(canonicalPath);
        if (!stats.isFile() || stats.size > MAX_PROFILE_BYTES) throw new Error('Agency profile exceeds the supported size limit');
        const source = fs.readFileSync(canonicalPath, 'utf8');
        const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').trim();
        return Object.freeze({ ...metadata, guidance: body, trust: 'untrusted-guidance' });
    }

    isWithin(root, target) {
        const relativePath = path.relative(root, target);
        return relativePath === '' || (relativePath !== '..'
            && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath));
    }
}

module.exports = AgencyProfileCatalog;
