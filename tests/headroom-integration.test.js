import { describe, it, expect, beforeEach } from 'vitest';
import { HeadroomEngineAdapter, engine } from '../src/integration/headroom/index.js';

describe('Authoritative HEADROOM Repository Integration', () => {
    let adapter;

    beforeEach(() => {
        adapter = new HeadroomEngineAdapter(':memory:');
    });

    it('loads the full 80-position workforce directly from the authoritative engine', () => {
        expect(engine.POSITION_CATALOG.length).toBe(80);
        const hierarchy = adapter.getWorkforceHierarchy();
        expect(hierarchy.totalOffices).toBe(4);
        expect(hierarchy.totalDepartments).toBe(20);
        expect(hierarchy.totalPositions).toBe(80);
    });

    it('initializes authoritative schema migrations on database connection', () => {
        expect(adapter.database).not.toBeNull();
        expect(adapter.repos.objective).toBeDefined();
        expect(adapter.repos.task).toBeDefined();
        expect(adapter.repos.audit).toBeDefined();

        // Verify tables exist
        const tables = adapter.database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
        expect(tables).toContain('organizations');
        expect(tables).toContain('offices');
        expect(tables).toContain('departments');
        expect(tables).toContain('agents');
        expect(tables).toContain('objectives');
        expect(tables).toContain('tasks');
        expect(tables).toContain('events');
        expect(tables).toContain('schema_migrations');
    });

    it('appends domain events to SqliteEventBus and streams to WorkforceEventBridge', () => {
        const streamed = [];
        adapter.getEventBridge().on('event', e => streamed.push(e));

        const plan = adapter.submitObjective('Integrate security vulnerability scanner');
        expect(plan.status).toBe('NEEDS_APPROVAL');

        // Check SqliteEventBus
        const eventRows = adapter.database.prepare('SELECT * FROM events').all();
        expect(eventRows.length).toBeGreaterThan(0);
        expect(eventRows[0].type).toBe(engine.EventType.PLAN_CREATED);

        // Check streaming bridge
        expect(streamed.some(e => e.type === 'PLAN_PROPOSED' && e.planId === plan.id)).toBe(true);
        expect(streamed.some(e => e.type === 'TASK_CREATED')).toBe(true);
    });

    it('executes task through full lifecycle and records tool operations in ExecutionActivityFeed', async () => {
        const streamed = [];
        adapter.getEventBridge().on('event', e => streamed.push(e));

        const plan = adapter.submitObjective('Verify parser AST integrity');
        adapter.approvePlan(plan.id);

        const firstTask = plan.tasks[0];
        const result = await adapter.executeTask(firstTask.id, {
            command: 'node -v'
        });

        expect(result.completed).toBe(true);
        expect(result.evidence).toContain('node -v');

        // Verify activity feed has recorded tool activity
        const recentActivity = adapter.activityFeed.listRecent({ limit: 10 });
        expect(recentActivity.length).toBeGreaterThan(0);
        expect(recentActivity.some(a => a.source === 'workspace' || a.source === 'command')).toBe(true);

        // Verify task state updated to COMPLETED
        const completedTask = adapter.getTaskById(firstTask.id);
        expect(completedTask.status).toBe('COMPLETED');
        expect(completedTask.progress).toBe(100);
    });

    it('supports persistent state recovery via getEventHistory', () => {
        adapter.submitObjective('State recovery verification test');
        const history = adapter.getEventBridge().getEventsSince(0, 50);
        expect(history.length).toBeGreaterThan(0);
        expect(history[0].sequence).toBe(1);
    });
});
