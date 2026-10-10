import { describe, it, expect, beforeEach } from 'vitest';
const IntegratedWorkforceEngine = require('../src/main/services/IntegratedWorkforceEngine.js');
const HeadroomAdapter = require('../src/main/services/HeadroomAdapter.js');

describe('Integrated Workforce Engine (PHASES 13 - 24: HR-085 through HR-168)', () => {
    let engine;
    let adapter;

    beforeEach(() => {
        adapter = new HeadroomAdapter();
        engine = adapter.getWorkforceEngine();
    });

    it('PHASE-13 (HR-085 - HR-091): decomposes executive mission into task DAG with workforce assignment', () => {
        const mission = engine.decomposeMission('Refactor token intelligence and integrate AST symbol table');
        expect(mission.missionId).toBeDefined();
        expect(mission.status).toBe('NEEDS_APPROVAL');
        expect(mission.tasks.length).toBe(3);
        expect(mission.tasks[0].position).toBe('Lead Architect');
        expect(mission.tasks[1].dependencies).toContain(mission.tasks[0].id);
    });

    it('PHASE-14 (HR-092 - HR-098): creates durable mission checkpoints with idempotency keys', () => {
        const chk = engine.saveCheckpoint('mission-alpha', 1, { filesModified: ['a.js'] }, 'idemp-key-1');
        expect(chk.idempotencyKey).toBe('idemp-key-1');

        const retrieved = engine.getCheckpoint('idemp-key-1');
        expect(retrieved).toBeDefined();
        expect(retrieved.state.filesModified).toContain('a.js');
    });

    it('PHASE-15 (HR-099 - HR-105): detects stale locks and supports crash resumption mutexes', () => {
        const lock1 = engine.acquireLock('file:src/engine.js', 'agent-worker-1');
        expect(lock1.acquired).toBe(true);

        const lockConflict = engine.acquireLock('file:src/engine.js', 'agent-worker-2');
        expect(lockConflict.acquired).toBe(false);
        expect(lockConflict.heldBy).toBe('agent-worker-1');

        // Stale lock expiry simulation
        engine.activeLocks.get('file:src/engine.js').lockedAt -= 70000;
        const cleared = engine.detectStaleLocks(60000);
        expect(cleared).toContain('file:src/engine.js');

        // Now can acquire
        const lock2 = engine.acquireLock('file:src/engine.js', 'agent-worker-2');
        expect(lock2.acquired).toBe(true);
        engine.releaseLock('file:src/engine.js', 'agent-worker-2');
    });

    it('PHASE-16 (HR-106 - HR-112): stores persistent project conventions and architectural decisions', () => {
        engine.setProjectMemory('codeStyle', '100% pure JavaScript, zero TypeScript');
        engine.setProjectMemory('gatewayPort', 41400);

        const memory = engine.getProjectMemory('codeStyle');
        expect(memory.value).toBe('100% pure JavaScript, zero TypeScript');

        const list = engine.listProjectMemories();
        expect(list.length).toBeGreaterThanOrEqual(2);
    });

    it('PHASE-17 (HR-113 - HR-119): reconstructs compact task context combining memories and repo state', () => {
        engine.setProjectMemory('architecture', 'Clean hexagonal services');
        const ctx = engine.reconstructTaskContext({
            taskId: 'task-10',
            missionId: 'mission-beta',
            files: ['src/main/services/gateway/UsageTracker.js'],
            diff: '+ Added cached token metrics\n- Removed mock'
        });

        expect(ctx.taskId).toBe('task-10');
        expect(ctx.conventions.some(c => c.includes('hexagonal'))).toBe(true);
        expect(ctx.activeFiles.length).toBe(1);
    });

    it('PHASE-18 (HR-120 - HR-126): indexes symbols and discovers code definition locations', () => {
        const code = `
            class TokenStreamManager {}
            function parseAstHeader() {}
            const gatewayVersion = '1.0.0';
        `;
        const found = engine.indexSymbols('src/tokens.js', code);
        expect(found.length).toBe(3);

        const locs = engine.findSymbolLocations('TokenStreamManager');
        expect(locs.length).toBe(1);
        expect(locs[0].file).toBe('src/tokens.js');
    });

    it('PHASE-19 (HR-127 - HR-133): applies multi-file atomic edits with syntax rollback protection', () => {
        const validEdits = [
            { filePath: 'a.js', oldContent: '', newContent: 'function foo() { return 1; }' },
            { filePath: 'b.js', oldContent: '', newContent: 'function bar() { return 2; }' }
        ];
        const resPass = engine.applyAtomicMultiFileEdits(validEdits);
        expect(resPass.success).toBe(true);

        const corruptEdits = [
            { filePath: 'broken.js', oldContent: '', newContent: 'function broken() { return true; ' } // Missing closing brace
        ];
        const resFail = engine.applyAtomicMultiFileEdits(corruptEdits);
        expect(resFail.success).toBe(false);
        expect(resFail.rolledBack).toBe(true);
    });

    it('PHASE-20 (HR-134 - HR-140): parses structured test results and diagnoses failure signals', () => {
        const rawOutput = `
            ✓ tests/a.test.js (5 tests)
            ✓ tests/b.test.js (3 tests)
            × tests/c.test.js (1 test | 1 failed)
        `;
        const res = engine.parseStructuredTestResults(rawOutput);
        expect(res.passed).toBeGreaterThan(0);
        expect(res.failed).toBeGreaterThan(0);
        expect(res.hasFailures).toBe(true);
    });

    it('PHASE-21 (HR-141 - HR-147): localizes execution failures to exact file, line, and column', () => {
        const stack = `TypeError: Cannot read properties of undefined
            at Object.runTask (D:/codex room/IDE/src/main/services/TaskRunner.js:42:15)
            at process.processTicksAndRejections (node:internal/process/task_queues:95:5)`;

        const loc = engine.localizeFailure(stack);
        expect(loc).toBeDefined();
        expect(loc.file).toContain('TaskRunner.js');
        expect(loc.line).toBe(42);
        expect(loc.column).toBe(15);
    });

    it('PHASE-22 (HR-148 - HR-154): performs pre-commit security audits on diff payloads', () => {
        const safeDiff = '+ const x = 42;';
        expect(engine.validatePreCommitSafety(safeDiff).safe).toBe(true);

        const unsafeDiff = '+ const apiKey = "sk-live-123456789012345678901234";';
        const audit = engine.validatePreCommitSafety(unsafeDiff);
        expect(audit.safe).toBe(false);
        expect(audit.issues[0]).toContain('Hardcoded plaintext API key');
    });

    it('PHASE-23 (HR-155 - HR-161): records collaborative agent handoffs with verification records', () => {
        const handoff = engine.recordAgentCollaborationHandoff('Lead Architect', 'Security Engineer', {
            spec: 'JWT rotation implementation verified'
        });
        expect(handoff.handoffId).toBeDefined();
        expect(handoff.verified).toBe(true);
        expect(handoff.fromAgent).toBe('Lead Architect');
        expect(handoff.toAgent).toBe('Security Engineer');
    });

    it('PHASE-24 (HR-162 - HR-168): enforces CEO emergency stop circuit breaker and halts operations', () => {
        expect(engine.isEmergencyStopped()).toBe(false);

        const stop = engine.triggerEmergencyStop('High risk file mutation detected');
        expect(stop.emergencyStopped).toBe(true);
        expect(engine.isEmergencyStopped()).toBe(true);

        // Mutex acquisition blocked under emergency stop
        expect(() => engine.acquireLock('res-1', 'worker')).toThrow(/Emergency Stop is active/);

        // Resume
        engine.resumeFromEmergencyStop();
        expect(engine.isEmergencyStopped()).toBe(false);
    });
});
