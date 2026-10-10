import { describe, it, expect, beforeEach } from 'vitest';
import HeadroomAdapter from '../src/main/services/HeadroomAdapter.js';

describe('HeadroomAdapter', () => {
    let adapter;

    beforeEach(() => {
        adapter = new HeadroomAdapter();
    });

    it('loads the full workforce of 80 positions across 4 offices and 20 departments', () => {
        const hierarchy = adapter.getWorkforceHierarchy();
        expect(hierarchy.totalOffices).toBe(4);
        expect(hierarchy.totalDepartments).toBe(20);
        expect(hierarchy.totalPositions).toBe(80);

        let totalDepts = 0;
        let totalEmps = 0;

        for (const office of hierarchy.offices) {
            totalDepts += office.departments.length;
            for (const dept of office.departments) {
                expect(dept.employees.length).toBe(4);
                totalEmps += dept.employees.length;
            }
        }

        expect(totalDepts).toBe(20);
        expect(totalEmps).toBe(80);
    });

    it('submits an objective and decomposes it into a structured plan awaiting CEO approval', () => {
        const plan = adapter.submitObjective('Add unit tests for payment authorization gateway');
        expect(plan.id).toBeDefined();
        expect(plan.status).toBe('NEEDS_APPROVAL');
        expect(plan.tasks.length).toBe(3);

        const tasks = adapter.getTasks();
        expect(tasks.length).toBe(3);
        expect(tasks[0].status).toBe('ASSIGNED');
        expect(tasks[1].status).toBe('QUEUED');
    });

    it('allows the CEO to approve a plan and start task execution', () => {
        const plan = adapter.submitObjective('Refactor database index strategy');
        const approvedPlan = adapter.approvePlan(plan.id);
        expect(approvedPlan.status).toBe('APPROVED');

        const activeTask = approvedPlan.tasks[0];
        expect(activeTask.status).toBe('IN_PROGRESS');
        expect(activeTask.progress).toBe(25);
    });

    it('allows the CEO to reject a plan with a stated reason', () => {
        const plan = adapter.submitObjective('High-risk production change');
        const rejected = adapter.rejectPlan(plan.id, 'Too risky for release cycle');
        expect(rejected.status).toBe('REJECTED');
        expect(rejected.rejectionReason).toBe('Too risky for release cycle');
    });

    it('advances task progress and activates subsequent dependent tasks upon completion', () => {
        const plan = adapter.submitObjective('Fix memory leak in websocket handler');
        adapter.approvePlan(plan.id);

        const task1 = plan.tasks[0];
        const task2 = plan.tasks[1];
        expect(task2.status).toBe('QUEUED');

        // Complete task 1
        const updated1 = adapter.advanceTaskProgress(task1.id, 100, 'COMPLETED', 'Root cause identified and tested');
        expect(updated1.status).toBe('COMPLETED');

        // Task 2 should now be activated in the updated plan
        const updatedPlan = adapter.getPlanById(plan.id);
        const updatedTask2 = updatedPlan.tasks.find(t => t.id === task2.id);
        expect(updatedTask2.status).toBe('IN_PROGRESS');
    });

    it('records audit log entries for all executive actions', () => {
        adapter.submitObjective('Implement audit trail test');
        const logs = adapter.getAuditLogs(10);
        expect(logs.length).toBeGreaterThan(0);
        expect(logs.some(l => l.actor === 'CEO')).toBe(true);
        expect(logs.some(l => l.actor === 'DIRECTOR')).toBe(true);
    });
});
