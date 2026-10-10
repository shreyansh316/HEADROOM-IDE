/**
 * HEADROOM AI Gateway — Budget & Spend Control Manager
 * Phase 12: HR-078 through HR-084
 *
 * Provides hierarchical budget enforcement (Workspace, Mission, Task, Monthly),
 * multi-tier threshold warning alerts (80%, 95%), hard spend ceilings,
 * emergency executive CEO approvals for budget elevations, and spend velocity tracking.
 * 100% Pure JavaScript. No TypeScript.
 */

class BudgetControlManager {
    constructor({ sqliteConnection = null, defaultMonthlyCapUsd = 100.0, defaultTaskCapUsd = 5.0 } = {}) {
        this.connection = sqliteConnection;
        this.defaultMonthlyCapUsd = defaultMonthlyCapUsd;
        this.defaultTaskCapUsd = defaultTaskCapUsd;

        // Context budget policies: scope -> { maxTokens, maxCostUsd, scopeType, monthly }
        this.policies = new Map();
        // Consumed spend: scope -> { tokens, costUsd, requestCount, lastActive }
        this.spendLedger = new Map();
        // Threshold alert subscribers / events
        this.alertListeners = [];
        // Emergency CEO overrides: scope -> { approvedCostUsd, reason, approvedAt, approvedBy }
        this.executiveOverrides = new Map();

        this._initLedger();
    }

    _initLedger() {
        // Default root workspace and monthly global policy
        this.setBudgetPolicy('global:monthly', {
            maxCostUsd: this.defaultMonthlyCapUsd,
            maxTokens: 50000000,
            scopeType: 'monthly'
        });
    }

    /**
     * HR-078: Multi-Tier Budget Configuration
     * Configures budget parameters for workspace, mission, task, or monthly window.
     */
    setBudgetPolicy(scopeId, { maxCostUsd, maxTokens, scopeType = 'task' } = {}) {
        if (!scopeId) return;
        this.policies.set(scopeId, {
            scopeId,
            scopeType, // 'workspace' | 'mission' | 'task' | 'monthly'
            maxCostUsd: typeof maxCostUsd === 'number' && maxCostUsd >= 0 ? maxCostUsd : Infinity,
            maxTokens: Number.isSafeInteger(maxTokens) && maxTokens >= 0 ? maxTokens : Infinity,
            updatedAt: new Date().toISOString()
        });
    }

    getBudgetPolicy(scopeId) {
        return this.policies.get(scopeId) || null;
    }

    /**
     * HR-079: Pre-Flight Spend Check & Enforcement
     * Evaluates all applicable scopes before a model invocation is dispatched.
     */
    evaluatePreflightSpend({ contextId, missionId, estimatedTokens = 0, estimatedCostUsd = 0 } = {}) {
        const scopesToCheck = [];

        if (contextId) scopesToCheck.push({ id: contextId, type: 'task' });
        if (missionId) scopesToCheck.push({ id: missionId, type: 'mission' });
        scopesToCheck.push({ id: 'global:monthly', type: 'monthly' });

        for (const scope of scopesToCheck) {
            const policy = this.policies.get(scope.id);
            if (!policy) continue;

            const override = this.executiveOverrides.get(scope.id);
            const effectiveMaxCost = override ? override.approvedCostUsd : policy.maxCostUsd;
            const current = this.spendLedger.get(scope.id) || { tokens: 0, costUsd: 0 };

            const projectedTokens = current.tokens + estimatedTokens;
            const projectedCost = Number((current.costUsd + estimatedCostUsd).toFixed(6));

            // Token limit check
            if (projectedTokens > policy.maxTokens) {
                return {
                    allowed: false,
                    scopeId: scope.id,
                    scopeType: scope.type,
                    reason: `Token limit exceeded on ${scope.type} "${scope.id}" (${projectedTokens} > ${policy.maxTokens})`,
                    code: 'BUDGET_TOKENS_EXCEEDED',
                    currentTokens: current.tokens,
                    maxTokens: policy.maxTokens
                };
            }

            // Cost limit check
            if (projectedCost > effectiveMaxCost) {
                return {
                    allowed: false,
                    scopeId: scope.id,
                    scopeType: scope.type,
                    reason: `Spend ceiling exceeded on ${scope.type} "${scope.id}" ($${projectedCost.toFixed(4)} > $${effectiveMaxCost.toFixed(4)})`,
                    code: 'BUDGET_COST_EXCEEDED',
                    currentCostUsd: current.costUsd,
                    maxCostUsd: effectiveMaxCost,
                    overrideActive: Boolean(override)
                };
            }
        }

        return { allowed: true };
    }

    /**
     * HR-080: Progressive Warning Thresholds (80% and 95%)
     * Triggers warning notifications as spend approaches the hard ceiling.
     */
    checkWarningThresholds(scopeId) {
        const policy = this.policies.get(scopeId);
        if (!policy || policy.maxCostUsd === Infinity) return null;

        const current = this.spendLedger.get(scopeId) || { tokens: 0, costUsd: 0 };
        const ratio = current.costUsd / policy.maxCostUsd;

        if (ratio >= 0.95) {
            return {
                severity: 'CRITICAL',
                percentage: Math.min(100, Math.round(ratio * 100)),
                message: `Critical budget alert: ${policy.scopeType} "${scopeId}" has reached ${(ratio * 100).toFixed(1)}% of its $${policy.maxCostUsd} limit.`
            };
        }

        if (ratio >= 0.80) {
            return {
                severity: 'WARNING',
                percentage: Math.round(ratio * 100),
                message: `Budget warning: ${policy.scopeType} "${scopeId}" is at ${(ratio * 100).toFixed(1)}% of budget ceiling ($${current.costUsd.toFixed(2)} / $${policy.maxCostUsd}).`
            };
        }

        return null;
    }

    /**
     * HR-081: Spend Consumption Recording & Velocity Tracking
     */
    recordSpend({ contextId, missionId, tokens = 0, costUsd = 0 } = {}) {
        const scopes = [];
        if (contextId) scopes.push(contextId);
        if (missionId && missionId !== contextId) scopes.push(missionId);
        scopes.push('global:monthly');

        const alertsTriggered = [];

        for (const scopeId of scopes) {
            let entry = this.spendLedger.get(scopeId);
            if (!entry) {
                entry = { tokens: 0, costUsd: 0, requestCount: 0, firstActive: new Date().toISOString() };
                this.spendLedger.set(scopeId, entry);
            }

            entry.tokens += tokens;
            entry.costUsd = Number((entry.costUsd + costUsd).toFixed(6));
            entry.requestCount += 1;
            entry.lastActive = new Date().toISOString();

            const warning = this.checkWarningThresholds(scopeId);
            if (warning) {
                alertsTriggered.push({ scopeId, ...warning });
                this._notifyListeners({ scopeId, ...warning });
            }
        }

        return {
            updatedScopes: scopes,
            alertsTriggered
        };
    }

    /**
     * HR-082: Executive CEO Emergency Override
     * Allows CEO authorization to temporarily elevate the spend ceiling for a critical task or mission.
     */
    grantExecutiveOverride({ scopeId, elevatedCapUsd, reason, approvedBy = 'CEO' } = {}) {
        if (!scopeId || typeof elevatedCapUsd !== 'number' || elevatedCapUsd <= 0) {
            throw new Error('Executive override requires a valid scopeId and positive elevatedCapUsd.');
        }

        const override = {
            scopeId,
            approvedCostUsd: elevatedCapUsd,
            reason: reason || 'Executive mission override granted by CEO',
            approvedBy,
            approvedAt: new Date().toISOString()
        };

        this.executiveOverrides.set(scopeId, override);
        return override;
    }

    revokeExecutiveOverride(scopeId) {
        return this.executiveOverrides.delete(scopeId);
    }

    /**
     * HR-083: Spend Summary & Projection Report
     */
    getSpendSummary(scopeId = null) {
        if (scopeId) {
            const policy = this.policies.get(scopeId);
            const current = this.spendLedger.get(scopeId) || { tokens: 0, costUsd: 0, requestCount: 0 };
            const override = this.executiveOverrides.get(scopeId);
            const effectiveMax = override ? override.approvedCostUsd : (policy ? policy.maxCostUsd : null);

            return {
                scopeId,
                scopeType: policy ? policy.scopeType : 'custom',
                consumedCostUsd: current.costUsd,
                consumedTokens: current.tokens,
                requestCount: current.requestCount,
                maxCostUsd: effectiveMax,
                percentageConsumed: effectiveMax && effectiveMax !== Infinity ? Math.min(100, (current.costUsd / effectiveMax) * 100) : null,
                isHardCeilingReached: effectiveMax && effectiveMax !== Infinity ? current.costUsd >= effectiveMax : false,
                executiveOverride: override || null
            };
        }

        // Aggregate summary
        const globalMonthly = this.spendLedger.get('global:monthly') || { tokens: 0, costUsd: 0, requestCount: 0 };
        const monthlyPolicy = this.policies.get('global:monthly');

        return {
            monthlyConsumedCostUsd: globalMonthly.costUsd,
            monthlyConsumedTokens: globalMonthly.tokens,
            monthlyTotalRequests: globalMonthly.requestCount,
            monthlyLimitUsd: monthlyPolicy ? monthlyPolicy.maxCostUsd : this.defaultMonthlyCapUsd,
            activePoliciesCount: this.policies.size,
            activeOverridesCount: this.executiveOverrides.size,
            scopesTracked: Array.from(this.spendLedger.keys())
        };
    }

    /**
     * HR-084: Alert Subscriber Mechanism
     */
    onAlert(callback) {
        if (typeof callback === 'function') {
            this.alertListeners.push(callback);
        }
    }

    _notifyListeners(alert) {
        for (const cb of this.alertListeners) {
            try {
                cb(alert);
            } catch (err) {
                // Ignore listener exceptions
            }
        }
    }
}

module.exports = BudgetControlManager;
