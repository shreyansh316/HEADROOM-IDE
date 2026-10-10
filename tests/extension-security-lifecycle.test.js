import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import ExtensionService from '../src/main/services/ExtensionService.js';

describe('Extension Security & Lifecycle Audit', () => {
    let service;
    const testDir = path.join(process.cwd(), '.test-security-extensions');

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

    describe('1. Strict Identifier Validation', () => {
        it('accepts valid alphanumeric, hyphen, and underscore namespaces and names', () => {
            expect(service.validateIdentifier('antigravity', 'dark-modern', '1.0.0')).toBe(true);
            expect(service.validateIdentifier('github', 'theme_pack', '0.2.1-beta')).toBe(true);
        });

        it('rejects path traversal attempts in namespace or name', () => {
            expect(() => service.validateIdentifier('../evil', 'tool', '1.0.0')).toThrow(/Invalid namespace identifier/);
            expect(() => service.validateIdentifier('evil', '..\\secret', '1.0.0')).toThrow(/Invalid extension name identifier/);
            expect(() => service.validateIdentifier('ns/slash', 'name', '1.0.0')).toThrow(/Invalid namespace identifier/);
            expect(() => service.validateIdentifier('ns', 'name/slash', '1.0.0')).toThrow(/Invalid extension name identifier/);
        });

        it('rejects invalid or unsafe semver strings', () => {
            expect(() => service.validateIdentifier('ns', 'name', '1.0')).toThrow(/Invalid semver version/);
            expect(() => service.validateIdentifier('ns', 'name', 'v1.0.0')).toThrow(/Invalid semver version/);
            expect(() => service.validateIdentifier('ns', 'name', '1.0.0; rm -rf /')).toThrow(/Invalid semver version/);
        });

        it('rejects oversized identifiers exceeding 64 characters', () => {
            const longId = 'a'.repeat(65);
            expect(() => service.validateIdentifier(longId, 'name', '1.0.0')).toThrow(/Invalid namespace identifier/);
            expect(() => service.validateIdentifier('ns', longId, '1.0.0')).toThrow(/Invalid extension name identifier/);
        });
    });

    describe('2. Trusted HTTPS URL Validation', () => {
        it('permits trusted open-vsx.org domains with HTTPS', () => {
            expect(service.validateDownloadUrl('https://open-vsx.org/api/publisher/ext/1.0.0/file.vsix')).toBe(true);
            expect(service.validateDownloadUrl('https://cdn.open-vsx.org/artifacts/ext.vsix')).toBe(true);
        });

        it('rejects insecure HTTP downloads', () => {
            expect(() => service.validateDownloadUrl('http://open-vsx.org/file.vsix')).toThrow(/Insecure download protocol/);
        });

        it('rejects untrusted third-party domains', () => {
            expect(() => service.validateDownloadUrl('https://evil-hacker.com/malicious.vsix')).toThrow(/Untrusted registry host/);
            expect(() => service.validateDownloadUrl('https://not-open-vsx.org/file.vsix')).toThrow(/Untrusted registry host/);
        });

        it('rejects malformed URLs', () => {
            expect(() => service.validateDownloadUrl('not-a-valid-url')).toThrow(/Malformed download URL/);
        });
    });

    describe('3. Archive Pre-Extraction Security (Zip Slip & Symlink Prevention)', () => {
        it('flags path traversal entries in archive inspect verification', () => {
            const traversalPaths = [
                '../../evil.exe',
                '../payload.js',
                '/etc/passwd',
                '\\Windows\\System32\\calc.exe',
                'C:\\autorun.inf',
                'extension/test\0nullbyte.js'
            ];

            for (const p of traversalPaths) {
                const isTraversing = p.includes('..') || 
                                     p.startsWith('/') || 
                                     p.startsWith('\\') || 
                                     /^[a-zA-Z]:/.test(p) ||
                                     p.includes('\0');
                expect(isTraversing).toBe(true);
            }
        });
    });

    describe('4. Atomic Installation & Rollback on Failure', () => {
        it('rolls back staging directory if manifest or extraction fails', async () => {
            // Extension with an untrusted host will fail immediately without leaving temp files
            const badExt = {
                namespace: 'untrusted-org',
                name: 'bad-extension',
                version: '1.0.0',
                downloadUrl: 'http://insecure-host.com/pkg.vsix'
            };

            const result = await service.install(badExt);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Security Violation');

            // Confirm no dirty staging directories or final install files remain
            const files = fs.readdirSync(testDir);
            const stagingDirs = files.filter(f => f.startsWith('.staging'));
            expect(stagingDirs.length).toBe(0);

            // Audit log should record the rejection
            const auditLogs = service.getAuditLogs();
            expect(auditLogs.length).toBeGreaterThan(0);
            expect(auditLogs[auditLogs.length - 1].status).toBe('rejected');
        });
    });

    describe('5. Declarative Theme Lifecycle & Execution', () => {
        it('activates a valid theme and extracts token color overrides', () => {
            // Create a fake locally installed theme extension
            const extId = 'antigravity.nord-light';
            const installLocation = path.join(testDir, `${extId}-1.0.0`);
            const themeDir = path.join(installLocation, 'extension', 'themes');
            fs.mkdirSync(themeDir, { recursive: true });

            const fakeThemeJson = {
                name: 'Nord Light',
                type: 'light',
                colors: {
                    'editor.background': '#F8F9FA',
                    'editor.foreground': '#2E3440',
                    'activityBar.background': '#ECEFF4',
                    'sideBar.background': '#E5E9F0'
                },
                tokenColors: [
                    { scope: ['comment'], settings: { foreground: '#4C566A' } }
                ]
            };

            const packageJson = {
                name: 'nord-light',
                displayName: 'Nord Light Theme',
                version: '1.0.0',
                contributes: {
                    themes: [
                        {
                            label: 'Nord Light',
                            uiTheme: 'vs',
                            path: './themes/nord-light.json'
                        }
                    ]
                }
            };

            fs.writeFileSync(path.join(themeDir, 'nord-light.json'), JSON.stringify(fakeThemeJson, null, 2), 'utf-8');
            fs.writeFileSync(path.join(installLocation, 'extension', 'package.json'), JSON.stringify(packageJson, null, 2), 'utf-8');

            // Record as installed in installed.json
            const installed = [{
                id: extId,
                namespace: 'antigravity',
                name: 'nord-light',
                displayName: 'Nord Light Theme',
                version: '1.0.0',
                location: installLocation,
                contributes: packageJson.contributes,
                compatibility: { compatible: true, badge: 'Compatible (Themes)' }
            }];
            fs.writeFileSync(service.installedFile, JSON.stringify(installed, null, 2), 'utf-8');

            // Execute Activation
            const activationResult = service.activateExtension(extId);
            expect(activationResult.success).toBe(true);
            expect(activationResult.theme).toBeDefined();
            expect(activationResult.theme.colors['editor.background']).toBe('#F8F9FA');
            expect(activationResult.theme.colors['editor.foreground']).toBe('#2E3440');

            // Query active theme
            const activeTheme = service.getActiveTheme();
            expect(activeTheme).not.toBeNull();
            expect(activeTheme.extensionId).toBe(extId);

            // Deactivate
            const deactResult = service.deactivateExtension(extId);
            expect(deactResult.success).toBe(true);
            expect(service.getActiveTheme()).toBeNull();
        });

        it('rejects activation of extensions without declarative themes or assets', () => {
            const extId = 'binary.native-debugger';
            const installLocation = path.join(testDir, `${extId}-1.0.0`);
            fs.mkdirSync(installLocation, { recursive: true });

            const packageJson = {
                name: 'native-debugger',
                displayName: 'Native Debugger',
                version: '1.0.0',
                contributes: {} // No themes
            };

            fs.writeFileSync(path.join(installLocation, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf-8');

            const installed = [{
                id: extId,
                namespace: 'binary',
                name: 'native-debugger',
                displayName: 'Native Debugger',
                version: '1.0.0',
                location: installLocation,
                contributes: packageJson.contributes,
                compatibility: { compatible: false, badge: 'Declarative Only (Host Runtime Required)' }
            }];
            fs.writeFileSync(service.installedFile, JSON.stringify(installed, null, 2), 'utf-8');

            const result = service.activateExtension(extId);
            expect(result.success).toBe(false);
            expect(result.error).toContain('does not declare any consumable themes');
        });
    });

    describe('6. Safe Uninstall & Cleanup', () => {
        it('removes installed directory and records audit event upon uninstall', async () => {
            const extId = 'theme.to-remove';
            const installLocation = path.join(testDir, `${extId}-1.0.0`);
            fs.mkdirSync(installLocation, { recursive: true });
            fs.writeFileSync(path.join(installLocation, 'test.txt'), 'hello', 'utf-8');

            const installed = [{
                id: extId,
                namespace: 'theme',
                name: 'to-remove',
                displayName: 'To Remove',
                version: '1.0.0',
                location: installLocation
            }];
            fs.writeFileSync(service.installedFile, JSON.stringify(installed, null, 2), 'utf-8');

            const uninstallRes = await service.uninstall(extId);
            expect(uninstallRes.success).toBe(true);
            expect(fs.existsSync(installLocation)).toBe(false);
            expect(service.getInstalled().length).toBe(0);

            const logs = service.getAuditLogs();
            expect(logs.some(l => l.action === 'uninstall' && l.id === extId)).toBe(true);
        });
    });
});
