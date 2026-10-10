import { describe, it, expect, beforeEach } from 'vitest';
const BudgetControlManager = require('../src/main/services/gateway/BudgetControlManager.js');
const GatewayService = require('../src/main/services/gateway/GatewayService.js');

describe('Budget & Spend Controls (PHASE-12: HR-078 through HR-084)', () => {
    let budgetManager;

    beforeEach(() => {
        budgetManager = new BudgetControlManager({
            defaultMonthlyCapUsd: 50.0,
            defaultTaskCapUsd: 2.0
        });
    });

    it('HR-078: configures multi-tier budget policies for task, mission, and monthly scopes', () => {
        budgetManager.setBudgetPolicy('task-900', {
            maxCostUsd: 1.50,
            maxTokens: 25000,
            scopeType: 'task'
        });

        budgetManager.setBudgetPolicy('mission-cloud-migration', {
            maxCostUsd: 20.00,
            maxTokens: 500000,
            scopeType: 'mission'
        });

        const taskPolicy = budgetManager.getBudgetPolicy('task-900');
        expect(taskPolicy).toBeDefined();
        expect(taskPolicy.maxCostUsd).toBe(1.50);
        expect(taskPolicy.maxTokens).toBe(25000);
        expect(taskPolicy.scopeType).toBe('task');

        const missionPolicy = budgetManager.getBudgetPolicy('mission-cloud-migration');
        expect(missionPolicy.maxCostUsd).toBe(20.00);
    });

    it('HR-079: performs pre-flight spend evaluation and blocks dispatches exceeding ceilings', () => {
        budgetManager.setBudgetPolicy('task-limit-check', {
            maxCostUsd: 0.50,
            maxTokens: 10000,
            scopeType: 'task'
        });

        // Safe preflight
        const pass = budgetManager.evaluatePreflightSpend({
            contextId: 'task-limit-check',
            estimatedTokens: 2000,
            estimatedCostUsd: 0.10
        });
        expect(pass.allowed).toBe(true);

        // Exceed token limit
        const failTokens = budgetManager.evaluatePreflightSpend({
            contextId: 'task-limit-check',
            estimatedTokens: 12000,
            estimatedCostUsd: 0.10
        });
        expect(failTokens.allowed).toBe(false);
        expect(failTokens.code).toBe('BUDGET_TOKENS_EXCEEDED');

        // Exceed cost limit
        const failCost = budgetManager.evaluatePreflightSpend({
            contextId: 'task-limit-check',
            estimatedTokens: 2000,
            estimatedCostUsd: 0.65
        });
        expect(failCost.allowed).toBe(false);
        expect(failCost.code).toBe('BUDGET_COST_EXCEEDED');
    });

    it('HR-080: calculates progressive warning thresholds at 80% and 95%', () => {
        budgetManager.setBudgetPolicy('task-warning', {
            maxCostUsd: 10.00,
            maxTokens: 100000,
            scopeType: 'task'
        });

        // 70% spend - no alert
        budgetManager.recordSpend({ contextId: 'task-warning', costUsd: 7.00, tokens: 5000 });
        expect(budgetManager.checkWarningThresholds('task-warning')).toBeNull();

        // 82% spend - warning alert
        budgetManager.recordSpend({ contextId: 'task-warning', costUsd: 1.20, tokens: 1000 });
        const warnAlert = budgetManager.checkWarningThresholds('task-warning');
        expect(warnAlert).toBeDefined();
        expect(warnAlert.severity).toBe('WARNING');
        expect(warnAlert.percentage).toBe(82);

        // 96% spend - critical alert
        budgetManager.recordSpend({ contextId: 'task-warning', costUsd: 1.40, tokens: 1000 });
        const critAlert = budgetManager.checkWarningThresholds('task-warning');
        expect(critAlert).toBeDefined();
        expect(critAlert.severity).toBe('CRITICAL');
        expect(critAlert.percentage).toBe(96);
    });

    it('HR-081: records spend consumption and tracks request velocity in ledger', () => {
        budgetManager.recordSpend({
            contextId: 'task-velocity',
            missionId: 'mission-alpha',
            tokens: 3500,
            costUsd: 0.08
        });

        const taskSummary = budgetManager.getSpendSummary('task-velocity');
        expect(taskSummary.consumedCostUsd).toBe(0.08);
        expect(taskSummary.consumedTokens).toBe(3500);
        expect(taskSummary.requestCount).toBe(1);

        const missionSummary = budgetManager.getSpendSummary('mission-alpha');
        expect(missionSummary.consumedCostUsd).toBe(0.08);

        const globalSummary = budgetManager.getSpendSummary();
        expect(globalSummary.monthlyConsumedCostUsd).toBe(0.08);
        expect(globalSummary.monthlyTotalRequests).toBe(1);
    });

    it('HR-082: enables CEO emergency override to elevate spend ceiling for mission tasks', () => {
        budgetManager.setBudgetPolicy('task-critical-hotfix', {
            maxCostUsd: 1.00,
            maxTokens: 20000,
            scopeType: 'task'
        });

        // Consume to $0.95
        budgetManager.recordSpend({ contextId: 'task-critical-hotfix', costUsd: 0.95, tokens: 1000 });

        // Would fail normally
        const rejected = budgetManager.evaluatePreflightSpend({
            contextId: 'task-critical-hotfix',
            estimatedCostUsd: 0.20
        });
        expect(rejected.allowed).toBe(false);

        // CEO grants emergency elevation to $5.00
        const override = budgetManager.grantExecutiveOverride({
            scopeId: 'task-critical-hotfix',
            elevatedCapUsd: 5.00,
            reason: 'Critical production hotfix deployment authorized by CEO',
            approvedBy: 'CEO'
        });
        expect(override.approvedCostUsd).toBe(5.00);

        // Now pre-flight passes under active override
        const approved = budgetManager.evaluatePreflightSpend({
            contextId: 'task-critical-hotfix',
            estimatedCostUsd: 0.20
        });
        expect(approved.allowed).toBe(true);

        const summary = budgetManager.getSpendSummary('task-critical-hotfix');
        expect(summary.executiveOverride).toBeDefined();
        expect(summary.executiveOverride.approvedCostUsd).toBe(5.00);

        // Revoke override
        budgetManager.revokeExecutiveOverride('task-critical-hotfix');
        const summaryRevoked = budgetManager.getSpendSummary('task-critical-hotfix');
        expect(summaryRevoked.executiveOverride).toBeNull();
    });

    it('HR-083 & HR-084: dispatches alerts to subscribers and integrates with GatewayService', () => {
        const alertsDispatched = [];
        budgetManager.onAlert((alert) => alertsDispatched.push(alert));

        budgetManager.setBudgetPolicy('task-subscriber-test', {
            maxCostUsd: 2.00,
            maxTokens: 10000
        });

        budgetManager.recordSpend({
            contextId: 'task-subscriber-test',
            costUsd: 1.70, // 85%
            tokens: 5000
        });

        expect(alertsDispatched.length).toBeGreaterThan(0);
        expect(alertsDispatched[0].severity).toBe('WARNING');

        // Verify GatewayService exposes all Phase 12 APIs
        const gateway = new GatewayService();
        expect(typeof gateway.setBudgetPolicy).toBe('function');
        expect(typeof gateway.getBudgetSummary).toBe('function');
        expect(typeof gateway.grantExecutiveBudgetOverride).toBe('function');
        expect(typeof gateway.revokeExecutiveBudgetOverride).toBe('function');
    });
});
