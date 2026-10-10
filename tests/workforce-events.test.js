import { describe, it, expect, beforeEach } from 'vitest';
import HeadroomAdapter from '../src/main/services/HeadroomAdapter.js';
import WorkforceEventBridge from '../src/main/services/WorkforceEventBridge.js';

describe('WorkforceEventBridge', () => {
    let bridge;

    beforeEach(() => {
        bridge = new WorkforceEventBridge();
    });

    it('publishes events in strict monotonic sequence order', () => {
        const e1 = bridge.publish({ type: 'TASK_CREATED', taskId: 't-1' });
        const e2 = bridge.publish({ type: 'TASK_STARTED', taskId: 't-1' });
        const e3 = bridge.publish({ type: 'TASK_COMPLETED', taskId: 't-1' });

        expect(e1.sequence).toBe(1);
        expect(e2.sequence).toBe(2);
        expect(e3.sequence).toBe(3);
        expect(e2.sequence).toBeGreaterThan(e1.sequence);
    });

    it('handles duplicate event prevention based on eventId', () => {
        const e1 = bridge.publish({ id: 'evt-unique-123', type: 'TASK_PROGRESS', taskId: 't-1' });
        const e2 = bridge.publish({ id: 'evt-unique-123', type: 'TASK_PROGRESS', taskId: 't-1' });

        expect(e1).not.toBeNull();
        expect(e2).toBeNull();
        expect(bridge.events.length).toBe(1);
    });

    it('sanitizes secrets and sensitive tokens from event payload', () => {
        const event = bridge.publish({
            type: 'TASK_EXECUTION_ACTIVITY',
            taskId: 't-1',
            payload: {
                apiKey: 'sk-secret-ai-token-12345',
                bearer: 'Bearer secret_auth_token_xyz',
                normalField: 'verified clean value'
            }
        });

        expect(event.payload.apiKey).toBe('[REDACTED]');
        expect(event.payload.normalField).toBe('verified clean value');
    });

    it('recovers ordered events since a previous sequence number', () => {
        bridge.publish({ type: 'E1' });
        bridge.publish({ type: 'E2' });
        bridge.publish({ type: 'E3' });
        bridge.publish({ type: 'E4' });

        const recovered = bridge.getEventsSince(2, 10);
        expect(recovered.length).toBe(2);
        expect(recovered[0].type).toBe('E3');
        expect(recovered[1].type).toBe('E4');
    });

    it('attaches and detaches Electron windows with automatic cleanup', () => {
        const sent = [];
        let closeHandler = null;

        const fakeWindow = {
            isDestroyed: () => false,
            webContents: {
                send: (channel, data) => sent.push({ channel, data })
            },
            on: (event, handler) => {
                if (event === 'closed') closeHandler = handler;
            }
        };

        bridge.attachWindow(fakeWindow);
        expect(bridge.attachedWindows.size).toBe(1);

        bridge.publish({ type: 'TASK_STARTED', taskId: 't-1' });
        expect(sent.length).toBe(1);
        expect(sent[0].channel).toBe('headroom:event');
        expect(sent[0].data.type).toBe('TASK_STARTED');

        // Trigger window close cleanup
        closeHandler();
        expect(bridge.attachedWindows.size).toBe(0);
    });
});

describe('Live Workforce Event Integration in HeadroomAdapter', () => {
    let adapter;

    beforeEach(() => {
        adapter = new HeadroomAdapter();
    });

    it('emits PLAN_PROPOSED and TASK_CREATED events when objective is submitted', () => {
        const events = [];
        adapter.getEventBridge().on('event', e => events.push(e));

        const plan = adapter.submitObjective('Build login authentication module');
        expect(plan.status).toBe('NEEDS_APPROVAL');

        expect(events.some(e => e.type === 'PLAN_PROPOSED' && e.planId === plan.id)).toBe(true);
        expect(events.some(e => e.type === 'TASK_CREATED')).toBe(true);
    });

    it('emits PLAN_APPROVED and activates first task with events', () => {
        const events = [];
        adapter.getEventBridge().on('event', e => events.push(e));

        const plan = adapter.submitObjective('Setup postgres database schema');
        adapter.approvePlan(plan.id);

        expect(events.some(e => e.type === 'PLAN_APPROVED' && e.planId === plan.id)).toBe(true);
        expect(events.some(e => e.type === 'TASK_STARTED')).toBe(true);
    });

    it('emits PLAN_REJECTED and cancels pending tasks on CEO rejection', () => {
        const events = [];
        adapter.getEventBridge().on('event', e => events.push(e));

        const plan = adapter.submitObjective('Drop production customer tables');
        adapter.rejectPlan(plan.id, 'High risk destructive operation denied');

        expect(events.some(e => e.type === 'PLAN_REJECTED')).toBe(true);
        const rejectedPlan = adapter.getPlanById(plan.id);
        expect(rejectedPlan.status).toBe('REJECTED');
    });

    it('executes task through real employee lifecycle, recording tool activity and diff', async () => {
        const events = [];
        adapter.getEventBridge().on('event', e => events.push(e));

        const plan = adapter.submitObjective('Refactor auth session verification');
        adapter.approvePlan(plan.id);

        const firstTask = plan.tasks[0];
        const result = await adapter.executeTask(firstTask.id, {
            command: 'node -v'
        });

        expect(result.completed).toBe(true);
        expect(result.evidence).toContain('node -v');
        expect(result.diff).toBeDefined();

        // Check task diff retrieval
        const retrievedDiff = adapter.getTaskDiff(firstTask.id);
        expect(retrievedDiff).toBe(result.diff);

        // Verify emitted events
        expect(events.some(e => e.type === 'TASK_EXECUTION_ACTIVITY' && e.toolActivity?.source === 'command')).toBe(true);
        expect(events.some(e => e.type === 'TASK_COMPLETED' && e.taskId === firstTask.id)).toBe(true);
    });

    it('cancels assigned task and emits TASK_CANCELLED event', () => {
        const events = [];
        adapter.getEventBridge().on('event', e => events.push(e));

        const plan = adapter.submitObjective('Optimize cache headers');
        adapter.approvePlan(plan.id);

        const firstTask = plan.tasks[0];
        const cancelled = adapter.cancelTask(firstTask.id, 'No longer needed');

        expect(cancelled.status).toBe('CANCELLED');
        expect(events.some(e => e.type === 'TASK_CANCELLED' && e.taskId === firstTask.id)).toBe(true);
    });
});
