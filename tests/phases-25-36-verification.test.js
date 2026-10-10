import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import HeadroomAdapter from '../src/main/services/HeadroomAdapter.js';
import SecurityHardeningService from '../src/main/services/SecurityHardeningService.js';
import ExtensionService from '../src/main/services/ExtensionService.js';
import TerminalService from '../src/main/services/TerminalService.js';
import NotificationService from '../src/main/services/NotificationService.js';
import SettingsProfileService from '../src/main/services/SettingsProfileService.js';
import PerformanceOptimizationService from '../src/main/services/PerformanceOptimizationService.js';
import MobileRemoteGatewayService from '../src/main/services/MobileRemoteGatewayService.js';
import MobileUiShellService from '../src/main/services/MobileUiShellService.js';
import DevicePairingService from '../src/main/services/DevicePairingService.js';
import ContinuitySyncService from '../src/main/services/ContinuitySyncService.js';
import OfflineRecoveryService from '../src/main/services/OfflineRecoveryService.js';
import EngineeringWorkflowService from '../src/main/services/EngineeringWorkflowService.js';

describe('Phases 25 to 36 Comprehensive Verification (HR-169 through HR-252)', () => {
    let adapter;

    beforeEach(() => {
        adapter = new HeadroomAdapter(':memory:');
    });

    // ==========================================
    // PHASE-25: Security Hardening & Zero-Leak Isolation (HR-169 - HR-175)
    // ==========================================
    describe('PHASE-25: Security Hardening & Zero-Leak Isolation', () => {
        const security = new SecurityHardeningService({ workspaceRoot: process.cwd() });

        it('HR-169: blocks SSRF private subnets and allows safe public URLs', () => {
            expect(security.isSafeOutboundUrl('http://169.254.169.254/latest/meta-data').safe).toBe(false);
            expect(security.isSafeOutboundUrl('http://10.0.0.1/admin').safe).toBe(false);
            expect(security.isSafeOutboundUrl('http://192.168.1.100/config').safe).toBe(false);
            expect(security.isSafeOutboundUrl('https://api.openai.com/v1/models').safe).toBe(true);
        });

        it('HR-170 & HR-171: sanitizes shell arguments and enforces path sandbox confinement', () => {
            expect(security.sanitizeShellArg('hello world')).toBe('"hello world"');
            expect(security.sanitizeShellArg('safe_arg')).toBe('safe_arg');

            const valid = security.validatePathConfinement('src/main/index.js');
            expect(valid.confined).toBe(true);

            const escapeAttempt = security.validatePathConfinement('../../windows/system32');
            expect(escapeAttempt.confined).toBe(false);
        });

        it('HR-172 & HR-173: redacts sensitive secrets in logs and creates isolated env', () => {
            const logged = 'Connecting with sk-1234567890abcdef123456 and token ghp_1234567890123456789012';
            const redacted = security.redactSecrets(logged);
            expect(redacted).not.toContain('sk-1234567890abcdef123456');
            expect(redacted).not.toContain('ghp_1234567890123456789012');
            expect(redacted).toContain('[REDACTED_SECRET]');

            process.env.OPENAI_API_KEY = 'secret-key';
            const isolatedEnv = security.createIsolatedEnvironment({ CUSTOM_FLAG: '1' });
            expect(isolatedEnv.OPENAI_API_KEY).toBeUndefined();
            expect(isolatedEnv.CUSTOM_FLAG).toBe('1');
            delete process.env.OPENAI_API_KEY;
        });

        it('HR-174 & HR-175: validates strict CSP, webview sandboxes, and zero-leak output', () => {
            const csp = security.getCspPolicy(false);
            expect(csp).toContain("default-src 'self'");
            expect(csp).not.toContain('unsafe-eval');

            const safeWebview = security.validateWebviewSandbox('allow-scripts allow-forms');
            expect(safeWebview.valid).toBe(true);

            const unsafeWebview = security.validateWebviewSandbox('allow-scripts allow-top-navigation');
            expect(unsafeWebview.valid).toBe(false);

            const leakCheck = security.validateZeroLeakOutbound({ text: 'Bearer sk-abcdef1234567890abcdef' });
            expect(leakCheck.passed).toBe(false);
        });
    });

    // ==========================================
    // PHASE-26: Extension & Marketplace System (HR-176 - HR-182)
    // ==========================================
    describe('PHASE-26: Extension & Marketplace System', () => {
        const extService = new ExtensionService();

        it('HR-176: caches marketplace catalogs and resolves best version', () => {
            extService.cacheCatalog('themes', [{ id: 'theme-1' }], 10000);
            const cached = extService.getCachedCatalog('themes');
            expect(cached).toEqual([{ id: 'theme-1' }]);

            const resolved = extService.resolveBestVersion(['1.0.0', '1.1.0', '2.0.0'], '^1.0.0');
            expect(resolved).toBe('1.0.0');
        });

        it('HR-182: audits extension manifests for permission boundaries', () => {
            const safeManifest = {
                publisher: 'headroom',
                name: 'dark-theme',
                contributes: { themes: [] }
            };
            const safeAudit = extService.auditExtensionPermissions(safeManifest);
            expect(safeAudit.isSandboxed).toBe(true);
            expect(safeAudit.status).toBe('ALLOWED');

            const riskyManifest = {
                publisher: 'unknown',
                name: 'dangerous-ext',
                contributes: { nativeNodeModules: true, arbitraryCommandExecution: true }
            };
            const riskyAudit = extService.auditExtensionPermissions(riskyManifest);
            expect(riskyAudit.isSandboxed).toBe(false);
            expect(riskyAudit.status).toBe('NEEDS_EXECUTIVE_APPROVAL');
        });
    });

    // ==========================================
    // PHASE-27: Terminal & Tool Execution (HR-183 - HR-189)
    // ==========================================
    describe('PHASE-27: Terminal & Tool Execution', () => {
        const termService = new TerminalService();

        afterEach(() => {
            termService.closeAll();
        });

        it('HR-184 - HR-189: executes tool commands with output capture and audit history', async () => {
            const isWindows = process.platform === 'win32';
            const cmd = isWindows ? 'cmd.exe' : 'echo';
            const args = isWindows ? ['/c', 'echo', 'headroom-terminal-ok'] : ['headroom-terminal-ok'];

            const result = await termService.executeToolCommand(cmd, args, {
                timeoutMs: 5000,
                cwd: process.cwd()
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain('headroom-terminal-ok');
            expect(result.timedOut).toBe(false);
            expect(result.durationMs).toBeGreaterThan(0);

            const history = termService.getExecutionHistory();
            expect(history.length).toBeGreaterThan(0);
            expect(history[history.length - 1].command).toBe(cmd);
        });

        it('HR-186: enforces process timeout when execution exceeds limit', async () => {
            const isWindows = process.platform === 'win32';
            const cmd = isWindows ? 'ping' : 'sleep';
            const args = isWindows ? ['127.0.0.1', '-n', '5'] : ['5'];

            const result = await termService.executeToolCommand(cmd, args, {
                timeoutMs: 200, // force fast timeout
                cwd: process.cwd()
            });

            expect(result.timedOut).toBe(true);
        });
    });

    // ==========================================
    // PHASE-28: Notifications & Activity Center (HR-190 - HR-196)
    // ==========================================
    describe('PHASE-28: Notifications & Activity Center', () => {
        let notifs;

        beforeEach(() => {
            notifs = new NotificationService();
        });

        it('HR-190 - HR-194: categorizes notifications and manages badge counters', () => {
            notifs.addNotification({ title: 'Build', message: 'Build succeeded', priority: 'INFO' });
            notifs.addNotification({ title: 'Error', message: 'Syntax error', priority: 'ERROR' });

            expect(notifs.getUnreadCount()).toBe(2);
            const history = notifs.getHistory({ priority: 'ERROR' });
            expect(history.items.length).toBe(1);

            notifs.markAllRead();
            expect(notifs.getUnreadCount()).toBe(0);
        });

        it('HR-192: creates approval notifications and handles executive decision', () => {
            let decisionResult = null;
            const req = notifs.createApprovalNotification({
                actionName: 'Deploy Prod',
                summary: 'Deploy to AWS'
            }, (approved, notes) => {
                decisionResult = { approved, notes };
            });

            expect(req.priority).toBe('CRITICAL');
            notifs.resolveApproval(req.metadata.requestId, true, 'Approved by CEO');
            expect(decisionResult).toEqual({ approved: true, notes: 'Approved by CEO' });
        });

        it('HR-193 & HR-196: triggers budget alerts and dispatches toasts', () => {
            const tracker = { currentCost: 8.5, maxBudget: 10.0 };
            const alert = notifs.checkBudgetThreshold(tracker, 80);
            expect(alert).not.toBeNull();
            expect(alert.priority).toBe('WARNING');

            const toast = notifs.dispatchToast('Settings saved', 'success', 1000);
            expect(toast.id).toBeDefined();
            expect(notifs.dismissToast(toast.id)).toBe(true);
        });
    });

    // ==========================================
    // PHASE-29: Settings & Workspace Profiles (HR-197 - HR-203)
    // ==========================================
    describe('PHASE-29: Settings & Workspace Profiles', () => {
        let settings;

        beforeEach(() => {
            settings = new SettingsProfileService();
        });

        it('HR-197 & HR-198: enforces schema validation and layered hierarchy', () => {
            expect(settings.get('editor.fontSize')).toBe(14); // system default

            settings.set('editor.fontSize', 18, 'user');
            expect(settings.get('editor.fontSize')).toBe(18); // user override

            settings.set('editor.fontSize', 20, 'workspace');
            expect(settings.get('editor.fontSize')).toBe(20); // workspace override

            expect(() => settings.set('editor.fontSize', 999)).toThrow(); // exceeds schema max
        });

        it('HR-199 & HR-200: switches profiles and detects keybinding conflicts', () => {
            settings.switchProfile('agentic-heavy');
            expect(settings.get('gateway.budgetLimit')).toBe(50.0);

            const result = settings.setKeybinding('workbench.action.custom', 'ctrl+s');
            expect(result.hasConflict).toBe(true);
            expect(result.conflictingCommands).toContain('workbench.action.save');
        });

        it('HR-201 & HR-202: exports and imports settings bundles', () => {
            settings.set('editor.tabSize', 2, 'user');
            const exported = settings.exportSettings();
            expect(exported.version).toBe('2.0.0');

            const freshService = new SettingsProfileService();
            const imported = freshService.importSettings(exported);
            expect(imported.success).toBe(true);
            expect(freshService.get('editor.tabSize')).toBe(2);
        });
    });

    // ==========================================
    // PHASE-30: Performance & Startup Optimization (HR-204 - HR-210)
    // ==========================================
    describe('PHASE-30: Performance & Startup Optimization', () => {
        let perf;

        beforeEach(() => {
            perf = new PerformanceOptimizationService();
        });

        it('HR-204 & HR-205: tracks startup milestones and registers lazy services', () => {
            perf.recordMilestone('ui_mounted');
            const milestones = perf.getMilestones();
            expect(milestones.some(m => m.name === 'ui_mounted')).toBe(true);

            let factoryCalled = false;
            perf.registerLazyService('heavyMath', () => {
                factoryCalled = true;
                return { calculate: () => 42 };
            });

            expect(factoryCalled).toBe(false);
            const service = perf.getService('heavyMath');
            expect(factoryCalled).toBe(true);
            expect(service.calculate()).toBe(42);
        });

        it('HR-206 & HR-207: provides memory metrics and stream backpressure buffer', () => {
            const mem = perf.getMemoryMetrics();
            expect(mem.rssMb).toBeGreaterThan(0);
            expect(mem.heapUsedMb).toBeGreaterThan(0);

            const buffer = perf.createBackpressureBuffer(2);
            expect(buffer.push('chunk1')).toBe(true);
            expect(buffer.push('chunk2')).toBe(false); // paused on threshold
            expect(buffer.isPaused()).toBe(true);
            expect(buffer.pull()).toBe('chunk1');
        });

        it('HR-208 & HR-209: reads large files in virtualized windows and audits bundle size', () => {
            const pkgPath = path.resolve('package.json');
            const windowData = perf.readFileWindow(pkgPath, 0, 50);
            expect(windowData.length).toBe(50);
            expect(windowData.content.length).toBe(50);

            const audit = perf.auditBundleSize(path.resolve('src/main/services'), 100 * 1024 * 1024);
            expect(audit.compliant).toBe(true);
            expect(audit.fileCount).toBeGreaterThan(5);
        });
    });

    // ==========================================
    // PHASE-31: Secure Mobile API & Gateway Remote (HR-211 - HR-217)
    // ==========================================
    describe('PHASE-31: Secure Mobile API & Gateway Remote', () => {
        let gateway;

        afterEach(async () => {
            if (gateway) await gateway.stop();
        });

        it('HR-211 - HR-217: starts loopback server with bearer auth and discovery beacon', async () => {
            gateway = new MobileRemoteGatewayService({ port: 0, host: '127.0.0.1' });
            const addr = await gateway.start();

            expect(addr.port).toBeGreaterThan(0);
            expect(addr.token).toBeDefined();

            const beacon = gateway.getDiscoveryBeacon();
            expect(beacon.serviceName).toBe('HEADROOM-IDE-Remote-Gateway');
            expect(beacon.authRequired).toBe(true);
        });
    });

    // ==========================================
    // PHASE-32: Mobile Command Center Responsive UI (HR-218 - HR-224)
    // ==========================================
    describe('PHASE-32: Mobile Command Center Responsive UI', () => {
        const shell = new MobileUiShellService();

        it('HR-218 - HR-224: generates complete responsive mobile HTML shell', () => {
            const html = shell.generateMobileShellHtml({ appTitle: 'Mobile Test', gatewayUrl: 'http://127.0.0.1:4000' });
            expect(html).toContain('Mobile Test');
            expect(html).toContain('EMERGENCY STOP');
            expect(html).toContain('offlineBanner');
            expect(html).toContain('approvalCard');
            expect(html).toContain('diffContainer');
        });
    });

    // ==========================================
    // PHASE-33: Device Pairing & Revocation (HR-225 - HR-231)
    // ==========================================
    describe('PHASE-33: Device Pairing & Revocation', () => {
        let pairing;

        beforeEach(() => {
            pairing = new DevicePairingService();
        });

        it('HR-226 - HR-228: generates pairing PIN and completes handshake with permissions', () => {
            const challenge = pairing.generatePairingChallenge('EXECUTIVE_APPROVER');
            expect(challenge.pin.length).toBe(6);

            const paired = pairing.completePairingHandshake(challenge.pin, 'Pixel 9 Pro');
            expect(paired.deviceId).toBeDefined();
            expect(paired.scope).toBe('EXECUTIVE_APPROVER');

            const auth = pairing.authenticateDeviceToken(paired.deviceId, paired.sessionToken);
            expect(auth.authenticated).toBe(true);
        });

        it('HR-229: revokes device immediately disconnecting sessions', () => {
            const ch = pairing.generatePairingChallenge();
            const dev = pairing.completePairingHandshake(ch.pin, 'iPad Pro');

            expect(pairing.revokeDevice(dev.deviceId)).toBe(true);
            const auth = pairing.authenticateDeviceToken(dev.deviceId, dev.sessionToken);
            expect(auth.authenticated).toBe(false);
        });
    });

    // ==========================================
    // PHASE-34: Desktop & Mobile Continuity (HR-232 - HR-238)
    // ==========================================
    describe('PHASE-34: Desktop & Mobile Continuity', () => {
        let continuity;

        beforeEach(() => {
            continuity = new ContinuitySyncService();
        });

        it('HR-232 & HR-233: synchronizes state and pushes approval requests to mobile', () => {
            continuity.updateDesktopState({ activeFile: 'app.js', missionStatus: 'RUNNING' });
            expect(continuity.getSnapshot().activeFile).toBe('app.js');

            const appReq = continuity.dispatchApprovalToMobile({
                requestId: 'req-deploy',
                action: 'DEPLOY_PROD',
                summary: 'Deploy v2'
            });

            expect(appReq.id).toBe('req-deploy');
            const result = continuity.reconcileMobileDecision('req-deploy', 'APPROVE');
            expect(result.status).toBe('APPROVED');
        });

        it('HR-236: propagates mobile emergency pause to desktop state', () => {
            const res = continuity.triggerMobileEmergencyPause('SUSPICIOUS_DIFF');
            expect(res.paused).toBe(true);
            expect(continuity.getSnapshot().isEmergencyPaused).toBe(true);
            expect(continuity.getSnapshot().missionStatus).toBe('EMERGENCY_STOPPED');
        });
    });

    // ==========================================
    // PHASE-35: Offline & Network Recovery (HR-239 - HR-245)
    // ==========================================
    describe('PHASE-35: Offline & Network Recovery', () => {
        let offline;

        beforeEach(() => {
            offline = new OfflineRecoveryService({ initialOnline: false });
        });

        it('HR-239 - HR-243: enqueues operations while offline and flushes on reconnect', async () => {
            expect(offline.getNetworkStatus().isOnline).toBe(false);

            const res1 = offline.enqueueOperation('SYNC_DIFF', { file: 'a.js' }, 'key-1');
            expect(res1.enqueued).toBe(true);

            // Suppress duplicate
            const res2 = offline.enqueueOperation('SYNC_DIFF', { file: 'a.js' }, 'key-1');
            expect(res2.enqueued).toBe(false);

            const processedItems = [];
            offline.setOnlineStatus(true);
            expect(offline.getNetworkStatus().isOnline).toBe(true);

            const flushResult = await offline.flushQueue(async (op) => {
                processedItems.push(op);
            });

            expect(flushResult.flushed).toBe(1);
            expect(processedItems.length).toBe(1);
        });
    });

    // ==========================================
    // PHASE-36: Specialized Engineering Workflows (HR-246 - HR-252)
    // ==========================================
    describe('PHASE-36: Specialized Engineering Workflows', () => {
        let workflow;

        beforeEach(() => {
            workflow = new EngineeringWorkflowService();
        });

        it('HR-246 - HR-251: loads default specialized engineering recipes', () => {
            const list = workflow.listRecipes();
            expect(list.length).toBeGreaterThanOrEqual(5);

            expect(workflow.getRecipe('refactor-modernize')).toBeDefined();
            expect(workflow.getRecipe('security-audit-scan')).toBeDefined();
            expect(workflow.getRecipe('api-docs-generator')).toBeDefined();
            expect(workflow.getRecipe('test-coverage-booster')).toBeDefined();
            expect(workflow.getRecipe('perf-profiler-optimize')).toBeDefined();
        });

        it('HR-252: instantiates recipe with parameters into executable DAG mission', () => {
            const mission = workflow.instantiateRecipe('security-audit-scan', { target: 'src/main' });
            expect(mission.missionId).toContain('mission-recipe-security-audit-scan');
            expect(mission.tasks.length).toBe(4);
            expect(mission.tasks[0].role).toBe('SECURITY_ENGINEER');

            const artifacts = workflow.packageRecipeArtifacts(mission.missionId, [
                { name: 'AuditReport.md', content: '# Audit Clean' }
            ]);
            expect(artifacts.artifactCount).toBe(1);
        });
    });
});
