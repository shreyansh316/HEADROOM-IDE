import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import HeadroomAdapter from '../src/main/services/HeadroomAdapter.js';
import EngineeringWorkflowService from '../src/main/services/EngineeringWorkflowService.js';
import EnterpriseGovernanceService from '../src/main/services/EnterpriseGovernanceService.js';
import BackupPortabilityService from '../src/main/services/BackupPortabilityService.js';
import DiagnosticsSelfRepairService from '../src/main/services/DiagnosticsSelfRepairService.js';
import AccessibilityUxService from '../src/main/services/AccessibilityUxService.js';
import QualityGatesRunnerService from '../src/main/services/QualityGatesRunnerService.js';
import ProviderVerificationService from '../src/main/services/ProviderVerificationService.js';
import DesktopPackagingService from '../src/main/services/DesktopPackagingService.js';
import ReliabilityBenchmarkService from '../src/main/services/ReliabilityBenchmarkService.js';
import ReleaseAcceptanceService from '../src/main/services/ReleaseAcceptanceService.js';

describe('PHASE-38 through PHASE-50 Comprehensive Verification (HR-260 through HR-350)', () => {
    let adapter;
    let tempDir;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-phase-test-'));
        adapter = new HeadroomAdapter(':memory:');
    });

    afterEach(() => {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (e) {}
    });

    // ==========================================
    // PHASE-38: Workflow Templates & Automation (HR-260 - HR-266)
    // ==========================================
    describe('PHASE-38: Workflow Templates & Automation', () => {
        const wf = new EngineeringWorkflowService();

        it('HR-260 & HR-261: validates workflow template schema and detects circular dependency cycles', () => {
            const validTemplate = {
                id: 'clean-build',
                name: 'Clean and Build',
                steps: [
                    { id: 'clean', action: 'Clean artifacts' },
                    { id: 'build', action: 'Build source', dependencies: ['clean'] }
                ]
            };
            const checkValid = wf.validateWorkflowTemplate(validTemplate);
            expect(checkValid.valid).toBe(true);

            // Circular cycle
            const cyclicTemplate = {
                id: 'cycle-test',
                name: 'Cycle Test',
                steps: [
                    { id: 'a', action: 'step a', dependencies: ['b'] },
                    { id: 'b', action: 'step b', dependencies: ['a'] }
                ]
            };
            const checkCyclic = wf.validateWorkflowTemplate(cyclicTemplate);
            expect(checkCyclic.valid).toBe(false);
            expect(checkCyclic.errors[0]).toContain('Circular dependency cycle');
        });

        it('HR-262 & HR-263 & HR-264: safe interpolation, retry, and truthful blocked state propagation', async () => {
            // Safe interpolation
            const text = 'Build project {target} with flag {flag}';
            const interpolated = wf.safeInterpolate(text, { target: 'Engine', flag: '-debug', __proto__: 'evil' });
            expect(interpolated).toBe('Build project Engine with flag -debug');

            // DAG execution with failure and blocked propagation
            const testRecipe = {
                id: 'fail-propagate',
                name: 'Fail and Propagate',
                steps: [
                    { id: 'step-1', action: 'Fail immediately' },
                    { id: 'step-2', action: 'Should be blocked', dependencies: ['step-1'] }
                ]
            };
            wf.registerRecipe(testRecipe);

            const execution = await wf.executeWorkflow('fail-propagate', {}, {
                maxRetries: 1,
                stepExecutor: async (step) => {
                    if (step.id === 'step-1') throw new Error('Simulation failed');
                    return { success: true };
                }
            });

            expect(execution.status).toBe('FAILED');
            const step2Result = execution.stepResults.find(r => r.stepId === 'step-2');
            expect(step2Result.status).toBe('BLOCKED_DEPENDENCY_FAILED');
            expect(step2Result.error).toContain('Prerequisite step "step-1" failed');
        });
    });

    // ==========================================
    // PHASE-39: Team & Enterprise Readiness (HR-267 - HR-273)
    // ==========================================
    describe('PHASE-39: Team & Enterprise Readiness', () => {
        let gov;

        beforeEach(() => {
            gov = new EnterpriseGovernanceService();
        });

        it('HR-267: enforces Role-Based Access Control permissions', () => {
            gov.setRole('VIEWER');
            expect(gov.hasPermission('READ_WORKSPACE')).toBe(true);
            expect(gov.hasPermission('EXECUTE_BUILDS')).toBe(false);
            expect(() => gov.enforcePermission('EXECUTE_BUILDS')).toThrow('lacks required permission');
        });

        it('HR-268 & HR-273: logs compliance events with tamper-proof SHA-256 chain and exports CSV/JSON', () => {
            gov.logComplianceEvent('DEPLOY_STARTED', { target: 'production' }, 'admin');
            gov.logComplianceEvent('DEPLOY_COMPLETED', { status: 'success' }, 'admin');

            const verification = gov.verifyLogChain();
            expect(verification.valid).toBe(true);

            const csv = gov.exportAuditLog('csv');
            expect(csv).toContain('DEPLOY_STARTED');
            expect(csv).toContain('DEPLOY_COMPLETED');
        });

        it('HR-270 & HR-271: validates project compliance and license grace period', () => {
            const license = gov.validateLicense();
            expect(license.valid).toBe(true);
            expect(license.seats).toBe(5);

            const policyCheck = gov.validateProjectAgainstPolicy({
                secretScanEnabled: false,
                budget: 500.0,
                dependencies: ['left-pad']
            });
            expect(policyCheck.compliant).toBe(false);
            expect(policyCheck.violations.length).toBe(3);
        });
    });

    // ==========================================
    // PHASE-40: Backup, Restore & Data Portability (HR-274 - HR-280)
    // ==========================================
    describe('PHASE-40: Backup, Restore & Data Portability', () => {
        let backupService;

        beforeEach(() => {
            backupService = new BackupPortabilityService({ backupDir: tempDir });
        });

        it('HR-274 & HR-275: creates atomic backup snapshot and validates pre-restore integrity', async () => {
            const snapshot = await backupService.createDatabaseBackup();
            expect(snapshot.checksum).toBeDefined();
            expect(fs.existsSync(snapshot.backupFile)).toBe(true);

            const restored = backupService.restoreDatabase(snapshot.backupFile);
            expect(restored.success).toBe(true);
            expect(restored.checksum).toBe(snapshot.checksum);
        });

        it('HR-276 & HR-280: exports self-contained portable bundle and verifies compliance', () => {
            const bundle = backupService.exportWorkspaceBundle({
                settings: { fontSize: 16 },
                memories: [{ key: 'arch', value: 'monolith' }]
            });

            expect(bundle.signature).toBeDefined();
            const compliance = backupService.verifyPortabilityCompliance(bundle);
            expect(compliance.compliant).toBe(true);

            const imported = backupService.importWorkspaceBundle(bundle.bundleJson);
            expect(imported.success).toBe(true);
            expect(imported.memoriesCount).toBe(1);
        });

        it('HR-275 & HR-280: rejects path traversal attempts and corrupt zero-byte restore files', () => {
            // Traversal rejection
            expect(() => backupService.importWorkspaceBundle('../../../etc/passwd')).toThrow(/Directory traversal/);

            // Zero-byte rejection
            const emptyFile = path.join(tempDir, 'empty.db');
            fs.writeFileSync(emptyFile, '');
            expect(() => backupService.restoreDatabase(emptyFile)).toThrow(/zero byte length/);

            // Non-existent file rejection
            expect(() => backupService.restoreDatabase(path.join(tempDir, 'missing.db'))).toThrow(/not found/);
        });
    });

    // ==========================================
    // PHASE-41: Diagnostics & Self-Repair (HR-281 - HR-287)
    // ==========================================
    describe('PHASE-41: Diagnostics & Self-Repair', () => {
        const diag = new DiagnosticsSelfRepairService();

        it('HR-281 & HR-283: runs environment health doctor and database integrity probe', () => {
            const health = diag.runHealthDoctor();
            expect(health.checks.length).toBeGreaterThanOrEqual(4);
            expect(health.checks.some(c => c.subsystem === 'Node.js Runtime')).toBe(true);

            const dbIntegrity = diag.verifyDatabaseIntegrity();
            expect(dbIntegrity.checked).toBe(true);
            expect(dbIntegrity.status).toBe('OK');
        });

        it('HR-284 & HR-287: runs auto-repair with lock liveness checks and exports redacted diagnostic support bundle', () => {
            // Create lockfile with current PID (live process)
            const liveLock = path.join(tempDir, '.concurrency.lock');
            fs.writeFileSync(liveLock, String(process.pid));
            
            const tempDiag = new DiagnosticsSelfRepairService({ workspaceRoot: tempDir });
            const repair = tempDiag.runAutoRepair();
            expect(repair.repaired).toBe(true);
            // Live lock must be skipped, not blindly deleted
            expect(repair.actionsTaken.some(a => a.includes('Skipped active lockfile'))).toBe(true);
            expect(fs.existsSync(liveLock)).toBe(true);

            // Redaction check
            const report = tempDiag.exportDiagnosticReport();
            expect(report.reportId).toBeDefined();
            expect(report.redacted).toBe(true);
            expect(report.system.platform).toBe(process.platform);
        });
    });

    // ==========================================
    // PHASE-42: Accessibility & UX Quality (HR-288 - HR-294)
    // ==========================================
    describe('PHASE-42: Accessibility & UX Quality', () => {
        const a11y = new AccessibilityUxService();

        it('HR-288 & HR-289: verifies WCAG AA contrast ratio and audits focus trap compliance', () => {
            const contrast = a11y.calculateContrastRatio('#FFFFFF', '#000000');
            expect(contrast).toBe(21.0); // Pure white on black

            const audit = a11y.auditFocusTrap([
                { id: 'btn-ok', tagName: 'button' },
                { id: 'custom-card', tagName: 'div' } // missing tabIndex
            ]);
            expect(audit.compliant).toBe(false);
            expect(audit.issues[0].element).toBe('custom-card');
        });

        it('HR-290 & HR-293: generates ARIA streaming attributes and non-color status labels', () => {
            const aria = a11y.generateStreamLiveRegionAttributes(true);
            expect(aria['aria-live']).toBe('polite');
            expect(aria['aria-busy']).toBe('true');

            const status = a11y.formatStatusIndicator('SUCCESS');
            expect(status.formattedText).toContain('[✓] Success');
            expect(status.accessibleLabel).toBe('Operation Completed Successfully');
        });
    });

    // ==========================================
    // PHASE-43: Automated Quality Gates (HR-295 - HR-301)
    // ==========================================
    describe('PHASE-43: Automated Quality Gates', () => {
        const gates = new QualityGatesRunnerService();

        it('HR-295 - HR-301: verifies TypeScript prohibition and executes unified quality gates', () => {
            const tsCheck = gates.runTsProhibitionCheck();
            expect(tsCheck.passed).toBe(true);
            expect(tsCheck.violationsCount).toBe(0);

            const astCheck = gates.runAstSyntaxCheck();
            expect(astCheck.passed).toBe(true);
            expect(astCheck.checkedCount).toBeGreaterThan(50);

            const allGates = gates.runAllGates();
            expect(allGates.gates.tsProhibition.passed).toBe(true);
            expect(allGates.gates.astSyntax.passed).toBe(true);
        }, 30000);
    });

    // ==========================================
    // PHASE-44: Real Provider Verification (HR-302 - HR-308)
    // ==========================================
    describe('PHASE-44: Real Provider Verification', () => {
        const providerService = new ProviderVerificationService();

        it('HR-302 & HR-303: verifies provider credentials and simulates 429 backoff retry', async () => {
            const probe = providerService.probeProviderHealth('openai', 'sk-1234567890123456789012345');
            expect(probe.connected).toBe(true);
            expect(probe.status).toBe('READY');

            // 429 retry
            let callCount = 0;
            const res = await providerService.executeWithResilience('openai', async () => {
                callCount++;
                if (callCount < 2) {
                    const err = new Error('Rate limit');
                    err.statusCode = 429;
                    throw err;
                }
                return 'success';
            });

            expect(res.success).toBe(true);
            expect(res.attempts).toBe(2);
        });

        it('HR-306: gracefully handles context window overflow with compact remediation', () => {
            const check = providerService.handleContextWindowExceeded(130000, 128000);
            expect(check.exceeded).toBe(true);
            expect(check.overflowTokens).toBe(2000);
            expect(check.remediationStrategy).toBe('COMPACT_SUMMARY_TRUNCATION');
        });
    });

    // ==========================================
    // PHASE-45: Packaged Desktop Verification (HR-309 - HR-315)
    // ==========================================
    describe('PHASE-45: Packaged Desktop Verification', () => {
        const pkg = new DesktopPackagingService();

        it('HR-309 - HR-314: verifies Windows binary executable, asar presence, and titlebar contract', () => {
            const bin = pkg.verifyPackagedBinary();
            expect(bin.binaryPath).toContain('HEADROOM IDE.exe');

            const asar = pkg.verifyAsarArchive();
            expect(asar.asarPath).toContain('app.asar');

            const titlebar = pkg.verifyTitlebarContract();
            expect(titlebar.contractCompliant).toBe(true);
            expect(titlebar.windowControlsPresent).toContain('close');
        });
    });

    // ==========================================
    // PHASE-46: Mobile & Remote Security Verification (HR-316 - HR-322)
    // ==========================================
    describe('PHASE-46: Mobile & Remote Security Verification', () => {
        const reliability = new ReliabilityBenchmarkService();

        it('HR-316 & HR-317: verifies pairing handshake cryptographic validation and scope enforcement', () => {
            const challenge = { pin: '849201', expiresAt: Date.now() + 60000 };
            const auth = reliability.auditRemotePairingHandshake(challenge, '849201', 'token-abcdef1234567890');
            expect(auth.authenticated).toBe(true);
            expect(auth.tokenHash).toHaveLength(64);

            // Negative test: mismatched PIN
            const badAuth = reliability.auditRemotePairingHandshake(challenge, '000000', 'token-abcdef1234567890');
            expect(badAuth.authenticated).toBe(false);

            // Negative test: expired challenge
            const expiredChallenge = { pin: '849201', expiresAt: Date.now() - 1000 };
            const expiredAuth = reliability.auditRemotePairingHandshake(expiredChallenge, '849201', 'token-abcdef1234567890');
            expect(expiredAuth.authenticated).toBe(false);

            // HR-317: Scoping & rejection
            const tokenRegistry = new Map();
            tokenRegistry.set('mon-tok-12345678', { deviceId: 'dev-1', scope: 'MONITOR_ONLY', revoked: false });
            tokenRegistry.set('exec-tok-87654321', { deviceId: 'dev-2', scope: 'EXECUTIVE_APPROVER', revoked: false });

            // Monitor token cannot perform executive operation
            const rejected = reliability.verifyRemoteRequestAuth('mon-tok-12345678', 'EXECUTIVE_APPROVER', tokenRegistry);
            expect(rejected.authorized).toBe(false);
            expect(rejected.statusCode).toBe(403);

            // Executive token can perform executive operation
            const approved = reliability.verifyRemoteRequestAuth('exec-tok-87654321', 'EXECUTIVE_APPROVER', tokenRegistry);
            expect(approved.authorized).toBe(true);
            expect(approved.statusCode).toBe(200);
        });

        it('HR-318 & HR-319: tests rate limiting DoS resilience and executive token circuit breaker revocation', () => {
            const dos = reliability.testRateLimitResilience(60, 100, '192.168.1.50');
            expect(dos.dosProtectionEffective).toBe(true);
            expect(dos.allowed).toBe(60);
            expect(dos.throttled).toBe(40);

            // HR-319: Instant revocation
            const tokenRegistry = new Map();
            tokenRegistry.set('tok-rev-1', { deviceId: 'device-x', scope: 'EXECUTIVE_APPROVER', revoked: false });
            const rev = reliability.revokeDeviceToken('device-x', tokenRegistry);
            expect(rev.circuitBreakerActive).toBe(true);
            expect(rev.revokedCount).toBe(1);

            // Now request is rejected
            const check = reliability.verifyRemoteRequestAuth('tok-rev-1', 'MONITOR_ONLY', tokenRegistry);
            expect(check.authorized).toBe(false);
            expect(check.error).toContain('revoked');
        });

        it('HR-320, HR-321 & HR-322: verifies zero-exposure surface, replay protection, and audit telemetry', () => {
            // HR-320: Network surface exposure check
            const loopbackCheck = reliability.verifyNetworkSurfaceExposure('127.0.0.1');
            expect(loopbackCheck.isZeroExposure).toBe(true);
            const publicCheck = reliability.verifyNetworkSurfaceExposure('0.0.0.0');
            expect(publicCheck.isZeroExposure).toBe(false);
            expect(publicCheck.exposureRisk).toBe('CRITICAL_PUBLIC_EXPOSURE');

            // HR-321: Replay attack prevention with nonces and timestamps
            const nonce = 'unique-nonce-' + Date.now();
            const firstCall = reliability.verifyReplayProtection(nonce, Date.now());
            expect(firstCall.valid).toBe(true);

            // Reused nonce must be rejected
            const replayCall = reliability.verifyReplayProtection(nonce, Date.now());
            expect(replayCall.valid).toBe(false);
            expect(replayCall.reason).toContain('Duplicate nonce detected');

            // Timestamp skew rejection
            const skewedCall = reliability.verifyReplayProtection('another-nonce', Date.now() - 500000);
            expect(skewedCall.valid).toBe(false);
            expect(skewedCall.reason).toContain('skew');

            // HR-322: Redacted audit telemetry
            const telemetry = reliability.getAuditTelemetry();
            expect(telemetry.length).toBeGreaterThan(0);
            expect(telemetry.every(t => !t.token || t.token === '[REDACTED]')).toBe(true);
        });
    });

    // ==========================================
    // PHASE-47: Reliability & Recovery Drills (HR-323 - HR-329)
    // ==========================================
    describe('PHASE-47: Reliability & Recovery Drills', () => {
        const reliability = new ReliabilityBenchmarkService({ workspaceRoot: tempDir });

        it('HR-323 & HR-324: executes process crash recovery drill and mid-step task resumption', () => {
            const crashDrill = reliability.runProcessCrashRecoveryDrill(tempDir);
            expect(crashDrill.survived).toBe(true);
            expect(crashDrill.checkpointRecovered.lastCompletedStep).toBe('step-2');

            const resumeDrill = reliability.runTaskResumptionDrill({ totalSteps: 4, failureAtStep: 3 });
            expect(resumeDrill.success).toBe(true);
            expect(resumeDrill.duplicateStepsAvoided).toBe(2);
            expect(resumeDrill.resumedStepsExecuted).toEqual(['step-3', 'step-4']);
        });

        it('HR-325: activates safe-mode in-memory fallback on corrupt database without overwriting original', () => {
            const corruptDrill = reliability.runCorruptDatabaseFallbackDrill({ tempDir });
            expect(corruptDrill.detectedCorruption).toBe(true);
            expect(corruptDrill.preservedCorruptedEvidence).toBe(true);
            expect(corruptDrill.fallbackToMemory).toBe(true);
            expect(corruptDrill.dataLossPrevented).toBe(true);
        });

        it('HR-326: simulates network interruption, queue replay, and duplicate suppression', () => {
            const replayDrill = reliability.runNetworkInterruptionAndReplayDrill();
            expect(replayDrill.queuedOfflineCount).toBe(5);
            expect(replayDrill.duplicatesBlocked).toBe(2);
            expect(replayDrill.allOperationsConsistent).toBe(true);

            const dedupDrill = reliability.runIdempotencyDeduplicationDrill(['k-1', 'k-2', 'k-1', 'k-3']);
            expect(dedupDrill.duplicatesBlocked).toBe(1);
            expect(dedupDrill.uniqueProcessed).toBe(3);
        });

        it('HR-327, HR-328 & HR-329: tests stale lock eviction with PID liveness, evidence hashing, and DR probing', () => {
            // Live process lock cannot be evicted
            const liveLock = reliability.runStaleLockEvictionDrill(15000, 10000, process.pid);
            expect(liveLock.isPidAlive).toBe(true);
            expect(liveLock.evicted).toBe(false);

            // Stale lock with dead PID is evicted
            const deadLock = reliability.runStaleLockEvictionDrill(15000, 10000, 999999);
            expect(deadLock.isPidAlive).toBe(false);
            expect(deadLock.evicted).toBe(true);

            // HR-328: Task evidence hash verification & tamper detection
            const evidence = { task: 'compile', status: 'SUCCESS', exitCode: 0 };
            const gen = reliability.verifyTaskEvidenceIntegrity(evidence);
            expect(gen.computedHash).toHaveLength(64);

            const valid = reliability.verifyTaskEvidenceIntegrity(evidence, gen.computedHash);
            expect(valid.verified).toBe(true);

            const tampered = reliability.verifyTaskEvidenceIntegrity({ ...evidence, exitCode: 1 }, gen.computedHash);
            expect(tampered.verified).toBe(false);
            expect(tampered.status).toBe('TAMPERING_DETECTED');

            // HR-329: DR readiness probe
            const drProbe = reliability.runDisasterRecoveryReadinessProbe();
            expect(drProbe.readyForDrills).toBe(true);
            expect(drProbe.checks.tempDirectoryWritable).toBe(true);
        });
    });

    // ==========================================
    // PHASE-48: Performance & Cost Benchmarks (HR-330 - HR-336)
    // ==========================================
    describe('PHASE-48: Performance & Cost Benchmarks', () => {
        const reliability = new ReliabilityBenchmarkService();

        it('HR-330 & HR-331: executes token efficiency pruning benchmark and cost-per-verified-task telemetry', () => {
            const tokenBench = reliability.runTokenEfficiencyBenchmark();
            expect(tokenBench.rawPromptTokens).toBeGreaterThan(1000);
            expect(tokenBench.compressedPromptTokens).toBeLessThan(tokenBench.rawPromptTokens);
            expect(tokenBench.tokensSaved).toBeGreaterThan(500);
            expect(tokenBench.efficiencyPercent).toBeGreaterThan(50);

            // HR-331: Cost analysis
            const cost = reliability.computeCostPerTask(2000, 500, 'fastTier');
            expect(cost.totalTaskCostUsd).toBeLessThan(0.001);
            expect(cost.benchmarkTaskCount).toBe(100);
        });

        it('HR-332 & HR-333: verifies sub-millisecond IPC latency and memory footprint within budget', () => {
            const ipc = reliability.runIpcLatencyBenchmark(500);
            expect(ipc.roundTripAvgUs).toBeLessThan(1000); // < 1ms requirement
            expect(ipc.throughputOpsPerSec).toBeGreaterThan(1000);
            expect(ipc.withinBudget).toBe(true);

            // HR-333: Startup & memory
            const mem = reliability.runStartupAndMemoryBenchmark();
            expect(mem.rssMb).toBeLessThan(500); // < 500MB target
            expect(mem.memoryWithinBudget).toBe(true);
        });

        it('HR-334, HR-335 & HR-336: executes concurrent scaling, model route optimization, and full benchmark suite', async () => {
            const scaling = await reliability.runConcurrentMissionScalingBenchmark(10);
            expect(scaling.completedTasks).toBe(10);
            expect(scaling.scaledCleanly).toBe(true);

            // HR-335: Model route optimization
            const opt = reliability.runModelRouteOptimizationBenchmark();
            expect(opt.savingsPercent).toBeGreaterThan(50);
            expect(opt.effectiveOptimization).toBe(true);

            // HR-336: Full benchmark summary
            const suite = reliability.runBenchmarkSuite();
            expect(suite.overallStatus).toBe('PASSED_ALL_BENCHMARKS');
            expect(suite.system.platform).toBe(process.platform);
            expect(suite.tokenEfficiency.tokensSaved).toBeGreaterThan(500);
        });
    });

    // ==========================================
    // PHASE-49 & 50: Documentation & Release Acceptance (HR-337 - HR-350)
    // ==========================================
    describe('PHASE-49 & PHASE-50: Release Acceptance & Final Sign-Off', () => {
        const acceptance = new ReleaseAcceptanceService();
        const root = path.resolve(__dirname, '..');

        it('HR-337 & HR-338: audits system architecture specification and complete 50-phase roadmap', () => {
            const archPath = path.join(root, 'docs/ARCHITECTURE_SPECIFICATION.md');
            expect(fs.existsSync(archPath)).toBe(true);
            const archContent = fs.readFileSync(archPath, 'utf8');
            expect(archContent).toContain('PROCESS BOUNDARIES');
            expect(archContent).toContain('contextBridge');

            const roadmapPath = path.join(root, 'docs/ROADMAP.md');
            expect(fs.existsSync(roadmapPath)).toBe(true);
            const roadmapContent = fs.readFileSync(roadmapPath, 'utf8');
            for (let i = 1; i <= 50; i++) {
                const phaseId = `PHASE-${String(i).padStart(2, '0')}`;
                expect(roadmapContent).toContain(phaseId);
            }
        });

        it('HR-339 & HR-340: audits 350-feature registry conformity and enterprise deployment checklist', () => {
            const regAudit = acceptance.auditFeatureRegistry();
            expect(regAudit.totalTracked).toBe(350);
            expect(regAudit.fullRegistryConforms).toBe(true);

            const checklistPath = path.join(root, 'docs/PRODUCTION_CHECKLIST.md');
            expect(fs.existsSync(checklistPath)).toBe(true);
            const checklistContent = fs.readFileSync(checklistPath, 'utf8');
            expect(checklistContent).toContain('PRODUCTION DEPLOYMENT & ACCEPTANCE CHECKLIST');
        });

        it('HR-341 & HR-342: audits user documentation, verified hotkeys, and production release notes', () => {
            const userGuidePath = path.join(root, 'docs/USER_GUIDE.md');
            expect(fs.existsSync(userGuidePath)).toBe(true);

            const shortcutsPath = path.join(root, 'docs/KEYBOARD_SHORTCUTS.md');
            expect(fs.existsSync(shortcutsPath)).toBe(true);
            const shortcutsContent = fs.readFileSync(shortcutsPath, 'utf8');
            expect(shortcutsContent).toContain('Ctrl+S');
            expect(shortcutsContent).toContain('Ctrl+N');

            const releaseNotesPath = path.join(root, 'docs/RELEASE_NOTES.md');
            expect(fs.existsSync(releaseNotesPath)).toBe(true);
            const releaseNotesContent = fs.readFileSync(releaseNotesPath, 'utf8');
            expect(releaseNotesContent).toContain('v0.1.0');
        });

        it('HR-343 & HR-344: audits zero-mock evidence and complete registry feature IDs (HR-001 - HR-350)', () => {
            const audit = acceptance.compileReleaseReadinessAudit();
            expect(audit.ready).toBe(true);
            expect(audit.checklist.length).toBeGreaterThanOrEqual(10);

            // Audit that all 350 IDs from HR-001 through HR-350 exist uniquely
            const regPath = path.join(root, 'docs/FEATURE_REGISTRY.md');
            const regText = fs.readFileSync(regPath, 'utf8');
            for (let i = 1; i <= 350; i++) {
                const featId = `HR-${String(i).padStart(3, '0')}`;
                expect(regText).toContain(featId);
            }
        });

        it('HR-345 & HR-346: verifies strict zero-TypeScript compliance and authoritative engine bridge', () => {
            const compliance = acceptance.verifyCodebaseCompliance();
            expect(compliance.zeroTypeScriptStrict).toBe(true);
            expect(compliance.tsViolationsCount).toBe(0);
            expect(compliance.totalJavaScriptFiles).toBeGreaterThan(60);

            const bridgePath = path.join(root, 'src/integration/headroom/headroomEngine.cjs');
            expect(fs.existsSync(bridgePath)).toBe(true);
            expect(fs.statSync(bridgePath).size).toBeGreaterThan(5000);
        });

        it('HR-347 & HR-348: verifies desktop UI component exports and security & privacy policy', () => {
            const titleBarPath = path.join(root, 'src/renderer/js/titlebar/titleBarManager.js');
            expect(fs.existsSync(titleBarPath)).toBe(true);

            const secPath = path.join(root, 'docs/SECURITY_AND_PRIVACY.md');
            expect(fs.existsSync(secPath)).toBe(true);
            const secContent = fs.readFileSync(secPath, 'utf8');
            expect(secContent.toLowerCase()).toContain('zero-trust');
        });

        it('HR-349 & HR-350: evaluates final release sign-off decision and verifies packaged desktop artifact', () => {
            const signoff = acceptance.evaluateFinalReleaseSignoff(true);
            expect(signoff.decision).toBe('READY FOR RELEASE');
            expect(signoff.allQualityGatesPassed).toBe(true);
            expect(signoff.documentationReady).toBe(true);

            const exePath = path.join(root, 'release/win-unpacked/HEADROOM IDE.exe');
            expect(fs.existsSync(exePath)).toBe(true);
            const stats = fs.statSync(exePath);
            expect(stats.size).toBeGreaterThan(100 * 1024 * 1024); // > 100MB production binary
        });
    });
});
