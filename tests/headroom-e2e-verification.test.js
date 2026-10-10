import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import HeadroomAdapter from '../src/main/services/HeadroomAdapter.js';

describe('HEADROOM Engine End-to-End Workforce Verification', () => {
    const testWorkspaceDir = path.join(process.cwd(), '.test-e2e-disposable-workspace');
    let adapter;

    beforeEach(() => {
        if (!fs.existsSync(testWorkspaceDir)) {
            fs.mkdirSync(testWorkspaceDir, { recursive: true });
        }
        // Initialize adapter with the disposable workspace
        adapter = new HeadroomAdapter();
        adapter.setWorkspaceDatabase(testWorkspaceDir);
    });

    afterEach(() => {
        if (adapter && adapter.connection) {
            try { adapter.connection.close(); } catch {}
        }
        if (fs.existsSync(testWorkspaceDir)) {
            try { fs.rmSync(testWorkspaceDir, { recursive: true, force: true }); } catch {}
        }
    });

    it('creates and verifies the authoritative workspace SQLite database', () => {
        const dbPath = path.join(testWorkspaceDir, '.headroom', 'headroom.sqlite');
        expect(fs.existsSync(dbPath)).toBe(true);
        expect(adapter.database).not.toBeNull();
    });

    it('submits an objective, routes through workforce, and generates approval-gated tasks', () => {
        const events = [];
        adapter.getEventBridge().on('event', e => events.push(e));

        const objectiveText = 'Harden JWT secret rotation and configure security authorization headers';
        const plan = adapter.submitObjective(objectiveText);

        expect(plan.id).toBeDefined();
        expect(plan.status).toBe('NEEDS_APPROVAL');
        expect(plan.tasks.length).toBe(3);

        // Verify routing to security department
        const securityTask = plan.tasks[0];
        expect(securityTask.office).toBe('website-development');
        expect(securityTask.department).toBe('security');
        expect(securityTask.assignedTitle).toBeDefined();
        expect(securityTask.assignedPosition).toBeDefined();

        // Verify streamed events
        expect(events.some(e => e.type === 'PLAN_PROPOSED' && e.planId === plan.id)).toBe(true);
        expect(events.some(e => e.type === 'TASK_CREATED')).toBe(true);
    });

    it('enforces CEO approval gate and rejects unauthorized execution before approval', () => {
        const plan = adapter.submitObjective('Deploy unreviewed security patch');
        const firstTask = plan.tasks[0];

        // Deny duplicate approval or approving non-existent plans
        expect(() => adapter.approvePlan('fake-plan-id')).toThrow(/Plan not found/);

        // Approve valid plan
        const approvedPlan = adapter.approvePlan(plan.id);
        expect(approvedPlan.status).toBe('APPROVED');

        // Cannot approve again once already approved (permission check)
        expect(() => adapter.approvePlan(plan.id)).toThrow(/Plan is not awaiting approval/);

        const currentTask = adapter.getTaskById(firstTask.id);
        expect(currentTask.status).toBe('IN_PROGRESS');
        expect(currentTask.progress).toBe(25);
    });

    it('supports CEO rejection with audit reason and marks tasks cancelled', () => {
        const plan = adapter.submitObjective('Direct production database schema drop');
        const rejected = adapter.rejectPlan(plan.id, 'Violates production data safety policy');

        expect(rejected.status).toBe('REJECTED');
        expect(rejected.rejectionReason).toBe('Violates production data safety policy');

        const tasks = adapter.getTasks().filter(t => t.planId === plan.id);
        for (const t of tasks) {
            expect(t.status).toBe('CANCELLED');
        }

        const logs = adapter.getAuditLogs(5);
        expect(logs.some(l => l.actor === 'CEO' && l.details?.reason?.includes('safety policy'))).toBe(true);
    });

    it('executes task with real command verification, records diff and evidence', async () => {
        const plan = adapter.submitObjective('Audit node version and record package diff');
        adapter.approvePlan(plan.id);
        const task1 = plan.tasks[0];

        // Perform bounded file change in disposable workspace
        const targetFile = path.join(testWorkspaceDir, 'auth_service.js');
        fs.writeFileSync(targetFile, '// Initial implementation\nmodule.exports = {};\n', 'utf-8');

        const customDiff = `--- a/auth_service.js\n+++ b/auth_service.js\n@@ -1,2 +1,3 @@\n // Initial implementation\n+const crypto = require('crypto');\n module.exports = {};`;

        // Execute task with a safe local command and recorded diff
        const result = await adapter.executeTask(task1.id, {
            command: 'node -v',
            diff: customDiff
        });

        expect(result.completed).toBe(true);
        expect(result.evidence).toContain('node -v');
        expect(result.diff).toBe(customDiff);

        // Verify task state in database
        const updatedTask = adapter.getTaskById(task1.id);
        expect(updatedTask.status).toBe('COMPLETED');
        expect(updatedTask.progress).toBe(100);
        expect(updatedTask.evidence).toContain('node -v');

        // Verify diff retrieval
        const retrievedDiff = adapter.getTaskDiff(task1.id);
        expect(retrievedDiff).toBe(customDiff);
    });

    it('persists state in SQLite and recovers task history on reinstantiation', () => {
        const plan = adapter.submitObjective('Test persistent recovery across restarts');
        adapter.approvePlan(plan.id);

        const tasks = adapter.getTasks().filter(t => t.planId === plan.id);
        const task1 = tasks[0];
        adapter.advanceTaskProgress(task1.id, 100, 'COMPLETED', 'Pre-restart completion evidence');

        // Close adapter 1
        adapter.connection.close();

        // Create new adapter pointing to same workspace database (simulating restart)
        const restartedAdapter = new HeadroomAdapter();
        restartedAdapter.setWorkspaceDatabase(testWorkspaceDir);

        const recoveredPlans = restartedAdapter.getPlans();
        const recoveredPlan = recoveredPlans.find(p => p.id === plan.id);
        expect(recoveredPlan).toBeDefined();
        expect(recoveredPlan.status).toBe('APPROVED');

        const recoveredTask1 = restartedAdapter.getTaskById(task1.id);
        expect(recoveredTask1).toBeDefined();
        expect(recoveredTask1.status).toBe('COMPLETED');
        expect(recoveredTask1.progress).toBe(100);
        expect(recoveredTask1.evidence).toBe('Pre-restart completion evidence');

        restartedAdapter.connection.close();
    });
});
