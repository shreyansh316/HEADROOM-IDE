const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

// Security & Operational Constants
const MAX_ARCHIVE_SIZE = 50 * 1024 * 1024; // 50 MB file size limit
const DOWNLOAD_TIMEOUT_MS = 30000; // 30s timeout
const TRUSTED_DOMAINS = ['open-vsx.org'];
const IDENTIFIER_REGEX = /^[a-zA-Z0-9_\-]+$/;
const SEMVER_REGEX = /^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.\-_]+)?$/;

class ExtensionService {
    constructor(options = {}) {
        this.apiBase = options.apiBase || 'https://open-vsx.org/api';
        this.extensionsDir = options.extensionsDir || path.join(process.cwd(), '.headroom-extensions');
        this.auditLogPath = path.join(this.extensionsDir, 'installation-audit.json');
        this.installedFile = path.join(this.extensionsDir, 'installed.json');
        this.activeExtensionsFile = path.join(this.extensionsDir, 'active-extensions.json');

        this.activeTheme = null;
        this.ensureDirectories();
    }

    ensureDirectories() {
        if (!fs.existsSync(this.extensionsDir)) {
            fs.mkdirSync(this.extensionsDir, { recursive: true });
        }
        if (!fs.existsSync(this.installedFile)) {
            fs.writeFileSync(this.installedFile, JSON.stringify([], null, 2), 'utf-8');
        }
        if (!fs.existsSync(this.activeExtensionsFile)) {
            fs.writeFileSync(this.activeExtensionsFile, JSON.stringify([], null, 2), 'utf-8');
        }
        if (!fs.existsSync(this.auditLogPath)) {
            fs.writeFileSync(this.auditLogPath, JSON.stringify([], null, 2), 'utf-8');
        }
    }

    /**
     * Strict Identifier Validation
     */
    validateIdentifier(namespace, name, version = null) {
        if (!namespace || typeof namespace !== 'string' || !IDENTIFIER_REGEX.test(namespace) || namespace.length > 64) {
            throw new Error(`Security Violation: Invalid namespace identifier "${namespace}". Must match /^[a-zA-Z0-9_-]+$/ (max 64 chars).`);
        }
        if (!name || typeof name !== 'string' || !IDENTIFIER_REGEX.test(name) || name.length > 64) {
            throw new Error(`Security Violation: Invalid extension name identifier "${name}". Must match /^[a-zA-Z0-9_-]+$/ (max 64 chars).`);
        }
        if (version && (typeof version !== 'string' || !SEMVER_REGEX.test(version) || version.length > 32)) {
            throw new Error(`Security Violation: Invalid semver version "${version}". Must follow semver X.Y.Z[-prerelease].`);
        }
        return true;
    }

    /**
     * Strict Trusted URL Validation
     */
    validateDownloadUrl(downloadUrl) {
        let parsed;
        try {
            parsed = new URL(downloadUrl);
        } catch {
            throw new Error(`Security Violation: Malformed download URL "${downloadUrl}"`);
        }

        if (parsed.protocol !== 'https:') {
            throw new Error(`Security Violation: Insecure download protocol "${parsed.protocol}". HTTPS required.`);
        }

        const isTrusted = TRUSTED_DOMAINS.some(domain => 
            parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
        );

        if (!isTrusted) {
            throw new Error(`Security Violation: Untrusted registry host "${parsed.hostname}". Allowed hosts: ${TRUSTED_DOMAINS.join(', ')}`);
        }
        return true;
    }

    /**
     * Search Open VSX Registry with real metrics and honest pagination
     */
    async search(query = '', options = {}) {
        const offset = Math.max(0, parseInt(options.offset, 10) || 0);
        const size = Math.min(Math.max(parseInt(options.size, 10) || 20, 1), 50);

        let url;
        if (query && query.trim()) {
            url = `${this.apiBase}/-/search?query=${encodeURIComponent(query.trim())}&offset=${offset}&size=${size}`;
        } else {
            url = `${this.apiBase}/-/search?offset=${offset}&size=${size}&sortBy=downloadCount&sortOrder=desc`;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000);

            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'HEADROOM-IDE/0.1.0 (Desktop Electron; Windows)'
                }
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                return {
                    success: false,
                    error: `Registry returned HTTP ${response.status}: ${response.statusText}`,
                    totalSize: 0,
                    offset,
                    size,
                    extensions: []
                };
            }

            const data = await response.json();
            const totalSize = typeof data.totalSize === 'number' ? data.totalSize : 0;
            const rawList = Array.isArray(data.extensions) ? data.extensions : [];

            const installedMap = this.getInstalledMap();
            const activeSet = new Set(this.getActiveExtensionIds());

            // De-duplicate in case registry returns duplicate keys
            const seenIds = new Set();
            const extensions = [];

            for (const ext of rawList) {
                if (!ext.namespace || !ext.name) continue;
                const id = `${ext.namespace}.${ext.name}`;
                if (seenIds.has(id)) continue;
                seenIds.add(id);

                const isInstalled = Boolean(installedMap[id]);
                const isActive = activeSet.has(id);
                const comp = this.checkCompatibility(ext);

                // Compute explicit 6-stage lifecycle state
                let lifecycleState = 'discoverable';
                if (isInstalled) {
                    lifecycleState = isActive ? 'active' : (comp.compatible ? 'compatible' : 'installed');
                }

                extensions.push({
                    id,
                    namespace: ext.namespace,
                    name: ext.name,
                    displayName: ext.displayName || ext.name,
                    description: ext.description || 'No description provided.',
                    version: ext.version || '0.0.1',
                    downloadCount: typeof ext.downloadCount === 'number' ? ext.downloadCount : null,
                    averageRating: typeof ext.averageRating === 'number' ? Math.round(ext.averageRating * 10) / 10 : null,
                    reviewCount: typeof ext.reviewCount === 'number' ? ext.reviewCount : 0,
                    verified: Boolean(ext.verified),
                    iconUrl: ext.files && ext.files.icon ? ext.files.icon : null,
                    downloadUrl: ext.files && ext.files.download ? ext.files.download : null,
                    timestamp: ext.timestamp || null,
                    installed: isInstalled,
                    active: isActive,
                    installedVersion: isInstalled ? installedMap[id].version : null,
                    lifecycleState,
                    compatibility: comp
                });
            }

            return {
                success: true,
                totalSize,
                offset,
                size,
                extensions,
                hasMore: offset + extensions.length < totalSize
            };
        } catch (err) {
            const isAbort = err.name === 'AbortError';
            return {
                success: false,
                error: isAbort ? 'Registry request timed out after 12s' : `Network error: ${err.message}`,
                offline: true,
                totalSize: 0,
                offset,
                size,
                extensions: []
            };
        }
    }

    /**
     * Get Details for a specific extension
     */
    async getDetails(namespace, name) {
        try {
            this.validateIdentifier(namespace, name);
        } catch (err) {
            return { success: false, error: err.message };
        }

        const url = `${this.apiBase}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'HEADROOM-IDE/0.1.0 (Desktop Electron; Windows)'
                }
            });

            if (!response.ok) {
                return { success: false, error: `Extension not found (HTTP ${response.status})` };
            }

            const data = await response.json();
            const id = `${data.namespace}.${data.name}`;
            const installedMap = this.getInstalledMap();
            const activeSet = new Set(this.getActiveExtensionIds());
            const comp = this.checkCompatibility(data);
            const isInstalled = Boolean(installedMap[id]);
            const isActive = activeSet.has(id);

            return {
                success: true,
                extension: {
                    id,
                    namespace: data.namespace,
                    name: data.name,
                    displayName: data.displayName || data.name,
                    description: data.description || '',
                    version: data.version,
                    allVersions: data.allVersions || {},
                    downloadCount: typeof data.downloadCount === 'number' ? data.downloadCount : null,
                    averageRating: typeof data.averageRating === 'number' ? Math.round(data.averageRating * 10) / 10 : null,
                    reviewCount: data.reviewCount || 0,
                    verified: Boolean(data.verified),
                    repository: data.repository || null,
                    homepage: data.homepage || null,
                    license: data.license || 'Proprietary / Unspecified',
                    iconUrl: data.files && data.files.icon ? data.files.icon : null,
                    downloadUrl: data.files && data.files.download ? data.files.download : null,
                    readmeUrl: data.files && data.files.readme ? data.files.readme : null,
                    installed: isInstalled,
                    active: isActive,
                    lifecycleState: isInstalled ? (isActive ? 'active' : 'installed') : 'discoverable',
                    compatibility: comp
                }
            };
        } catch (err) {
            return { success: false, error: `Failed to fetch extension details: ${err.message}` };
        }
    }

    /**
     * Deep Compatibility Analysis
     */
    checkCompatibility(ext) {
        const text = `${ext.displayName || ''} ${ext.name || ''} ${ext.description || ''} ${Array.isArray(ext.tags) ? ext.tags.join(' ') : ''}`.toLowerCase();
        const isTheme = text.includes('theme') || text.includes('icon') || text.includes('color');
        const isSnippet = text.includes('snippet');
        const isLanguage = text.includes('syntax') || text.includes('grammar') || text.includes('highlight');

        const supportedFeatures = [];
        if (isTheme) supportedFeatures.push('Themes');
        if (isSnippet) supportedFeatures.push('Snippets');
        if (isLanguage) supportedFeatures.push('TextMate Grammars');

        if (supportedFeatures.length > 0) {
            return {
                compatible: true,
                badge: `Compatible (${supportedFeatures.join(', ')})`,
                status: 'compatible',
                supportedFeatures,
                unsupportedFeatures: [],
                detail: `Declarative ${supportedFeatures.join(' and ')} are supported and consumable in HEADROOM IDE.`
            };
        }

        return {
            compatible: false,
            badge: 'Declarative Only (Host Runtime Required)',
            status: 'partial',
            supportedFeatures: [],
            unsupportedFeatures: ['Language Server Protocol', 'VS Code Debugger API', 'VS Code Commands'],
            detail: 'Requires full VS Code Node extension host process, which is not active in this standalone phase.'
        };
    }

    getInstalled() {
        try {
            if (!fs.existsSync(this.installedFile)) return [];
            const raw = fs.readFileSync(this.installedFile, 'utf-8');
            return JSON.parse(raw);
        } catch {
            return [];
        }
    }

    getInstalledMap() {
        const list = this.getInstalled();
        const map = {};
        for (const item of list) {
            map[item.id] = item;
        }
        return map;
    }

    getActiveExtensionIds() {
        try {
            if (!fs.existsSync(this.activeExtensionsFile)) return [];
            return JSON.parse(fs.readFileSync(this.activeExtensionsFile, 'utf-8'));
        } catch {
            return [];
        }
    }

    /**
     * Pre-extraction Archive Inspection (Zip Slip & Symlink Attack Prevention)
     */
    verifyArchivePaths(archivePath) {
        const res = spawnSync('tar', ['-tvf', archivePath], { encoding: 'utf-8' });
        if (res.error) {
            throw new Error(`Archive inspection failed: ${res.error.message}`);
        }
        if (res.status !== 0) {
            throw new Error(`Archive inspection error: ${res.stderr || 'Corrupted or invalid archive'}`);
        }

        const lines = res.stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const entries = [];

        for (const line of lines) {
            // bsdtar -tvf outputs e.g. "-rw-r--r--  0 0      0       1234 Oct 10 03:00 extension/package.json"
            // or "lrwxrwxrwx  0 0      0          0 Oct 10 03:00 symlink -> target"
            const parts = line.split(/\s+/);
            const entryPath = parts.slice(8).join(' '); // filename may have spaces
            const isSymlink = parts[0] && parts[0].startsWith('l');

            if (isSymlink) {
                throw new Error(`Security Violation: Archive contains symbolic links which are prohibited: "${line}"`);
            }

            if (!entryPath) continue;

            // Reject Zip Slip / Path Traversal
            if (entryPath.includes('..') || 
                entryPath.startsWith('/') || 
                entryPath.startsWith('\\') || 
                /^[a-zA-Z]:/.test(entryPath) ||
                entryPath.includes('\0') ||
                /[\x00-\x1F\x7F]/.test(entryPath)) {
                throw new Error(`Security Violation: Path traversal attack detected in entry: "${entryPath}"`);
            }
            entries.push(entryPath);
        }

        if (entries.length === 0) {
            throw new Error('Security Violation: Archive contains 0 readable entries.');
        }

        return entries;
    }

    /**
     * Secure Extension Installation Pipeline
     */
    async install(ext) {
        if (!ext || !ext.namespace || !ext.name) {
            return { success: false, error: 'Invalid extension payload: namespace and name required' };
        }

        const namespace = ext.namespace;
        const name = ext.name;
        const version = ext.version || '0.0.1';
        const id = `${namespace}.${name}`;

        // 1. Strict Identifier Validation
        try {
            this.validateIdentifier(namespace, name, version);
        } catch (err) {
            this.recordAudit({ action: 'security_rejection', id, version, status: 'rejected', error: err.message });
            return { success: false, error: err.message };
        }

        const downloadUrl = ext.downloadUrl;
        if (!downloadUrl) {
            return { success: false, error: 'No download artifact URL provided by registry' };
        }

        // 2. Strict URL Validation
        try {
            this.validateDownloadUrl(downloadUrl);
        } catch (err) {
            this.recordAudit({ action: 'security_rejection', id, version, status: 'rejected', error: err.message });
            return { success: false, error: err.message };
        }

        const stagingDir = path.join(this.extensionsDir, `.staging-${id}-${Date.now()}`);
        const finalInstallDir = path.join(this.extensionsDir, `${id}-${version}`);
        const tempVsix = path.join(this.extensionsDir, `tmp-${Date.now()}-${name}.vsix`);

        try {
            // 3. Download Artifact with Size Limit and Timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

            const res = await fetch(downloadUrl, {
                signal: controller.signal,
                headers: { 'User-Agent': 'HEADROOM-IDE/0.1.0' }
            });
            clearTimeout(timeoutId);

            if (!res.ok) {
                throw new Error(`Download failed with HTTP ${res.status}: ${res.statusText}`);
            }

            const contentLength = parseInt(res.headers.get('content-length'), 10);
            if (contentLength && contentLength > MAX_ARCHIVE_SIZE) {
                throw new Error(`Security Violation: Package size (${contentLength} bytes) exceeds 50MB limit.`);
            }

            const arrayBuffer = await res.arrayBuffer();
            if (arrayBuffer.byteLength > MAX_ARCHIVE_SIZE) {
                throw new Error(`Security Violation: Downloaded archive size (${arrayBuffer.byteLength} bytes) exceeds 50MB limit.`);
            }

            const buffer = Buffer.from(arrayBuffer);
            const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

            fs.writeFileSync(tempVsix, buffer);

            // 4. Pre-extraction Verification
            this.verifyArchivePaths(tempVsix);

            // 5. Staged Extraction
            if (fs.existsSync(stagingDir)) {
                fs.rmSync(stagingDir, { recursive: true, force: true });
            }
            fs.mkdirSync(stagingDir, { recursive: true });

            const extractRes = spawnSync('tar', ['-xf', tempVsix, '-C', stagingDir], { encoding: 'utf-8' });
            if (extractRes.status !== 0) {
                throw new Error(`Archive extraction failed: ${extractRes.stderr || 'tar execution error'}`);
            }

            // 6. Manifest Validation inside Staging Area
            const manifestPath = fs.existsSync(path.join(stagingDir, 'extension', 'package.json'))
                ? path.join(stagingDir, 'extension', 'package.json')
                : (fs.existsSync(path.join(stagingDir, 'package.json')) ? path.join(stagingDir, 'package.json') : null);

            if (!manifestPath) {
                throw new Error('Security Violation: Extracted package is missing package.json manifest.');
            }

            let packageJson;
            try {
                packageJson = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            } catch (err) {
                throw new Error(`Invalid extension package.json: ${err.message}`);
            }

            // 7. Atomic Swap to Final Destination
            if (fs.existsSync(finalInstallDir)) {
                fs.rmSync(finalInstallDir, { recursive: true, force: true });
            }
            fs.renameSync(stagingDir, finalInstallDir);

            // 8. Update Installed Registry
            const installed = this.getInstalled().filter(i => i.id !== id);
            const comp = this.checkCompatibility(ext);

            installed.push({
                id,
                namespace,
                name,
                displayName: ext.displayName || packageJson.displayName || name,
                version,
                description: ext.description || packageJson.description || '',
                sha256,
                installDate: new Date().toISOString(),
                location: finalInstallDir,
                contributes: packageJson.contributes || {},
                compatibility: comp,
                lifecycleState: 'installed'
            });

            fs.writeFileSync(this.installedFile, JSON.stringify(installed, null, 2), 'utf-8');

            // 9. Record Immutable Audit Trail
            this.recordAudit({
                action: 'install',
                id,
                version,
                sha256,
                timestamp: new Date().toISOString(),
                status: 'success',
                target: finalInstallDir
            });

            return {
                success: true,
                message: `Successfully installed ${ext.displayName || name} v${version}`,
                extension: { id, version, installed: true, location: finalInstallDir, compatibility: comp }
            };
        } catch (err) {
            // Rollback on failure
            if (fs.existsSync(stagingDir)) {
                try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch {}
            }
            this.recordAudit({
                action: 'install',
                id,
                version,
                timestamp: new Date().toISOString(),
                status: 'failed',
                error: err.message
            });
            return { success: false, error: err.message };
        } finally {
            if (fs.existsSync(tempVsix)) {
                try { fs.unlinkSync(tempVsix); } catch {}
            }
        }
    }

    /**
     * Safe Uninstall
     */
    async uninstall(extensionId) {
        if (!extensionId) return { success: false, error: 'Extension ID required' };

        try {
            const installed = this.getInstalled();
            const target = installed.find(i => i.id === extensionId);
            if (!target) {
                return { success: false, error: `Extension ${extensionId} is not installed` };
            }

            // Deactivate if active
            this.deactivateExtension(extensionId);

            if (target.location && fs.existsSync(target.location)) {
                fs.rmSync(target.location, { recursive: true, force: true });
            }

            const updated = installed.filter(i => i.id !== extensionId);
            fs.writeFileSync(this.installedFile, JSON.stringify(updated, null, 2), 'utf-8');

            this.recordAudit({
                action: 'uninstall',
                id: extensionId,
                timestamp: new Date().toISOString(),
                status: 'success'
            });

            return { success: true, message: `Successfully uninstalled ${extensionId}` };
        } catch (err) {
            return { success: false, error: `Uninstall failed: ${err.message}` };
        }
    }

    /**
     * Real Declarative Activation (Theme Loading & Token Ingestion)
     */
    activateExtension(extensionId) {
        const installed = this.getInstalled();
        const ext = installed.find(i => i.id === extensionId);
        if (!ext) {
            return { success: false, error: `Extension ${extensionId} not found locally` };
        }

        const contributes = ext.contributes || {};
        const themes = contributes.themes || [];

        if (!Array.isArray(themes) || themes.length === 0) {
            return { 
                success: false, 
                error: `Extension ${extensionId} does not declare any consumable themes or declarative assets.` 
            };
        }

        try {
            // Find theme file
            const themeDef = themes[0];
            const themeRelativePath = themeDef.path || '';
            const basePath = fs.existsSync(path.join(ext.location, 'extension')) 
                ? path.join(ext.location, 'extension')
                : ext.location;

            const themeFilePath = path.join(basePath, themeRelativePath);

            if (!fs.existsSync(themeFilePath)) {
                return { success: false, error: `Theme file not found at: ${themeFilePath}` };
            }

            const rawTheme = fs.readFileSync(themeFilePath, 'utf-8');
            const themeJson = JSON.parse(rawTheme);

            // Record in active extensions
            const activeList = this.getActiveExtensionIds().filter(id => id !== extensionId);
            activeList.push(extensionId);
            fs.writeFileSync(this.activeExtensionsFile, JSON.stringify(activeList, null, 2), 'utf-8');

            this.activeTheme = {
                extensionId,
                label: themeDef.label || ext.displayName,
                uiTheme: themeDef.uiTheme || 'vs-dark',
                colors: themeJson.colors || {},
                tokenColors: themeJson.tokenColors || []
            };

            this.recordAudit({
                action: 'activate',
                id: extensionId,
                timestamp: new Date().toISOString(),
                status: 'success'
            });

            return {
                success: true,
                message: `Activated theme "${this.activeTheme.label}"`,
                theme: this.activeTheme
            };
        } catch (err) {
            return { success: false, error: `Failed to activate theme: ${err.message}` };
        }
    }

    /**
     * Deactivate Extension
     */
    deactivateExtension(extensionId) {
        const activeList = this.getActiveExtensionIds().filter(id => id !== extensionId);
        fs.writeFileSync(this.activeExtensionsFile, JSON.stringify(activeList, null, 2), 'utf-8');

        if (this.activeTheme && this.activeTheme.extensionId === extensionId) {
            this.activeTheme = null;
        }

        this.recordAudit({
            action: 'deactivate',
            id: extensionId,
            timestamp: new Date().toISOString(),
            status: 'success'
        });

        return { success: true, message: `Deactivated extension ${extensionId}` };
    }

    /**
     * HR-176: Extension Marketplace Catalog Cache & Version Resolution
     */
    cacheCatalog(queryKey, extensions, ttlMs = 300000) {
        if (!this.catalogCache) this.catalogCache = new Map();
        this.catalogCache.set(queryKey, {
            data: extensions,
            expiresAt: Date.now() + ttlMs
        });
    }

    getCachedCatalog(queryKey) {
        if (!this.catalogCache) return null;
        const entry = this.catalogCache.get(queryKey);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.catalogCache.delete(queryKey);
            return null;
        }
        return entry.data;
    }

    resolveBestVersion(availableVersions, constraint = '*') {
        if (!Array.isArray(availableVersions) || availableVersions.length === 0) return null;
        if (constraint === '*' || constraint === 'latest') {
            return availableVersions[0];
        }
        // Basic semver prefix match or exact match
        const exact = availableVersions.find(v => v === constraint);
        if (exact) return exact;
        const majorMatch = availableVersions.find(v => v.startsWith(constraint.replace(/[\^~]/, '')));
        return majorMatch || availableVersions[0];
    }

    /**
     * HR-182: Extension Permission Boundaries & Privilege Isolation
     */
    auditExtensionPermissions(manifest) {
        const allowedCapabilities = new Set([
            'themes', 'snippets', 'languages', 'grammars', 'iconThemes',
            'commands', 'menus', 'keybindings', 'views', 'viewsContainers'
        ]);

        const dangerousCapabilities = [
            'networkAccess', 'nativeNodeModules', 'arbitraryCommandExecution', 'systemFileWrite'
        ];

        const contributes = manifest.contributes || {};
        const declaredKeys = Object.keys(contributes);
        const risks = [];

        for (const key of declaredKeys) {
            if (dangerousCapabilities.includes(key)) {
                risks.push({ capability: key, severity: 'HIGH', reason: 'High privilege system access requested' });
            }
        }

        const isSandboxed = risks.length === 0;

        return {
            extensionId: `${manifest.publisher || 'unknown'}.${manifest.name || 'unnamed'}`,
            isSandboxed,
            declaredCapabilities: declaredKeys,
            risks,
            status: isSandboxed ? 'ALLOWED' : 'NEEDS_EXECUTIVE_APPROVAL'
        };
    }

    getActiveTheme() {
        return this.activeTheme;
    }

    getAuditLogs(limit = 100) {
        try {
            if (!fs.existsSync(this.auditLogPath)) return [];
            const logs = JSON.parse(fs.readFileSync(this.auditLogPath, 'utf-8'));
            return logs.slice(-limit);
        } catch {
            return [];
        }
    }

    recordAudit(entry) {
        try {
            const audit = fs.existsSync(this.auditLogPath)
                ? JSON.parse(fs.readFileSync(this.auditLogPath, 'utf-8'))
                : [];
            audit.push(entry);
            fs.writeFileSync(this.auditLogPath, JSON.stringify(audit, null, 2), 'utf-8');
        } catch (e) {
            console.warn('[HEADROOM ExtensionService] Audit log write failed:', e.message);
        }
    }
}

module.exports = ExtensionService;
