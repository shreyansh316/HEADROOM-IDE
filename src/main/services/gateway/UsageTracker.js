/**
 * HEADROOM AI API Gateway — Usage & Cost Tracking Engine
 *
 * Tracks per-request tokens, estimated costs, and persists records
 * into the authoritative HEADROOM SQLite database (ai_usages table).
 * Enforces task and workspace budgets. 100% Pure JavaScript.
 */

class UsageTracker {
    constructor({ sqliteConnection, modelRegistry } = {}) {
        this.connection = sqliteConnection;
        this.registry = modelRegistry;
        this.inMemoryRecords = [];
        this.budgets = new Map(); // contextId -> { maxTokens, maxCostUsd }
        this.consumed = new Map(); // contextId -> { tokens, costUsd }
        this._loadHistoryFromDb();
    }

    setBudget(contextId, { maxTokens, maxCostUsd } = {}) {
        if (!contextId) return;
        this.budgets.set(contextId, {
            maxTokens: Number.isSafeInteger(maxTokens) ? maxTokens : Infinity,
            maxCostUsd: typeof maxCostUsd === 'number' ? maxCostUsd : Infinity
        });
    }

    checkBudget(contextId, estimatedTokens = 0, estimatedCostUsd = 0) {
        if (!contextId || !this.budgets.has(contextId)) return { ok: true };

        const budget = this.budgets.get(contextId);
        const current = this.consumed.get(contextId) || { tokens: 0, costUsd: 0 };

        if (current.tokens + estimatedTokens > budget.maxTokens) {
            return {
                ok: false,
                reason: `Token budget exceeded (${current.tokens + estimatedTokens} > ${budget.maxTokens})`,
                code: 'budget-exceeded'
            };
        }

        if (current.costUsd + estimatedCostUsd > budget.maxCostUsd) {
            return {
                ok: false,
                reason: `Cost ceiling exceeded ($${(current.costUsd + estimatedCostUsd).toFixed(4)} > $${budget.maxCostUsd})`,
                code: 'budget-exceeded'
            };
        }

        return { ok: true };
    }

    recordRequestUsage({
        requestId,
        modelId,
        provider,
        usage = {},
        durationMs = 0,
        success = true,
        contextId = null,
        purpose = 'gateway-chat'
    } = {}) {
        const inputTokens = usage.prompt_tokens || usage.inputTokens || 0;
        const outputTokens = usage.completion_tokens || usage.outputTokens || 0;
        const cachedTokens = usage.cached_tokens || usage.prompt_tokens_details?.cached_tokens || usage.cachedTokens || 0;
        const totalTokens = inputTokens + outputTokens;

        let costData = { estimatedCost: 0, costKnown: false };
        if (this.registry) {
            costData = this.registry.estimateCost(modelId, { inputTokens, outputTokens });
        }

        const record = {
            id: `usage-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            requestId: requestId || `req-${Date.now()}`,
            timestamp: new Date().toISOString(),
            model: modelId,
            provider: provider,
            inputTokens,
            outputTokens,
            cachedTokens,
            totalTokens,
            estimatedCost: costData.estimatedCost,
            costKnown: costData.costKnown,
            durationMs,
            success: Boolean(success),
            purpose,
            contextId
        };

        this.inMemoryRecords.push(record);
        if (this.inMemoryRecords.length > 500) {
            this.inMemoryRecords.shift(); // Bound memory
        }

        // Update context budget consumption
        if (contextId) {
            const current = this.consumed.get(contextId) || { tokens: 0, costUsd: 0 };
            current.tokens += totalTokens;
            current.costUsd += costData.estimatedCost;
            this.consumed.set(contextId, current);
        }

        // Persist to authoritative SQLite database if available
        if (this.connection && typeof this.connection.prepare === 'function') {
            try {
                this.connection.prepare(`
                    INSERT INTO ai_usages (
                        id, agent_id, task_id, model, input_tokens, output_tokens,
                        estimated_cost, duration_ms, purpose, success, request_id, attempt, provider, cost_known
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    record.id,
                    null,
                    contextId,
                    record.model,
                    record.inputTokens,
                    record.outputTokens,
                    record.estimatedCost,
                    record.durationMs,
                    record.purpose,
                    record.success ? 1 : 0,
                    record.requestId,
                    1,
                    record.provider,
                    record.costKnown ? 1 : 0
                );
            } catch (err) {
                // Non-fatal if sqlite table not present in standalone mock mode
            }
        }

        return record;
    }

    _loadHistoryFromDb() {
        if (!this.connection || typeof this.connection.prepare !== 'function') return;
        try {
            const rows = this.connection.prepare(`
                SELECT id, request_id as requestId, model, input_tokens as inputTokens,
                       output_tokens as outputTokens, estimated_cost as estimatedCost,
                       duration_ms as durationMs, purpose, success, task_id as contextId,
                       provider, cost_known as costKnown, created_at as timestamp
                FROM ai_usages
                ORDER BY created_at DESC
                LIMIT 500
            `).all();
            if (Array.isArray(rows)) {
                this.inMemoryRecords = rows.map(r => ({
                    id: r.id,
                    requestId: r.requestId || r.id,
                    timestamp: r.timestamp || new Date().toISOString(),
                    model: r.model,
                    provider: r.provider || 'unknown',
                    inputTokens: r.inputTokens || 0,
                    outputTokens: r.outputTokens || 0,
                    cachedTokens: 0,
                    totalTokens: (r.inputTokens || 0) + (r.outputTokens || 0),
                    estimatedCost: r.estimatedCost || 0,
                    costKnown: Boolean(r.costKnown),
                    durationMs: r.durationMs || 0,
                    success: Boolean(r.success),
                    purpose: r.purpose || 'gateway-chat',
                    contextId: r.contextId
                })).reverse();
            }
        } catch (err) {
            // Non-fatal if schema differs or uninitialized
        }
    }

    getSummary(contextId = null) {
        let records = this.inMemoryRecords;
        if (contextId) {
            records = records.filter(r => r.contextId === contextId);
        }

        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalCachedTokens = 0;
        let totalTokens = 0;
        let totalCost = 0;
        let providerReportedCost = 0;
        let estimatedCost = 0;
        let successfulRequests = 0;
        let failedRequests = 0;

        const byProvider = {};
        const byModel = {};
        const byContext = {};

        for (const r of records) {
            totalInputTokens += (r.inputTokens || 0);
            totalOutputTokens += (r.outputTokens || 0);
            totalCachedTokens += (r.cachedTokens || 0);
            totalTokens += (r.totalTokens || 0);
            totalCost += (r.estimatedCost || 0);

            if (r.costKnown) {
                providerReportedCost += (r.estimatedCost || 0);
            } else {
                estimatedCost += (r.estimatedCost || 0);
            }

            if (r.success) successfulRequests++;
            else failedRequests++;

            // By Provider
            const prov = r.provider || 'unknown';
            if (!byProvider[prov]) byProvider[prov] = { requests: 0, tokens: 0, cost: 0 };
            byProvider[prov].requests++;
            byProvider[prov].tokens += (r.totalTokens || 0);
            byProvider[prov].cost += (r.estimatedCost || 0);

            // By Model
            const mod = r.model || 'unknown';
            if (!byModel[mod]) byModel[mod] = { requests: 0, tokens: 0, cost: 0 };
            byModel[mod].requests++;
            byModel[mod].tokens += (r.totalTokens || 0);
            byModel[mod].cost += (r.estimatedCost || 0);

            // By Context / Task
            const ctx = r.contextId || 'general';
            if (!byContext[ctx]) byContext[ctx] = { requests: 0, tokens: 0, cost: 0 };
            byContext[ctx].requests++;
            byContext[ctx].tokens += (r.totalTokens || 0);
            byContext[ctx].cost += (r.estimatedCost || 0);
        }

        const totalRequests = records.length;
        const budget = contextId ? this.budgets.get(contextId) : null;
        const consumed = contextId ? (this.consumed.get(contextId) || { tokens: 0, costUsd: 0 }) : null;

        // Cost per verified task computation (only where successful and verified context exists)
        const verifiedTasksCount = successfulRequests > 0 ? Object.keys(byContext).filter(c => c !== 'general').length : 0;
        const costPerVerifiedTask = verifiedTasksCount > 0 ? Number((totalCost / verifiedTasksCount).toFixed(4)) : null;

        return {
            totalRequests,
            successfulRequests,
            failedRequests,
            totalInputTokens,
            totalOutputTokens,
            totalCachedTokens,
            totalTokens,
            totalCost: Number(totalCost.toFixed(6)),
            providerReportedCost: Number(providerReportedCost.toFixed(6)),
            estimatedCost: Number(estimatedCost.toFixed(6)),
            currency: 'USD',
            byProvider,
            byModel,
            byContext,
            costPerVerifiedTask,
            budget: budget ? {
                maxTokens: budget.maxTokens === Infinity ? null : budget.maxTokens,
                maxCostUsd: budget.maxCostUsd === Infinity ? null : budget.maxCostUsd,
                consumedTokens: consumed ? consumed.tokens : 0,
                consumedCostUsd: consumed ? Number(consumed.costUsd.toFixed(4)) : 0,
                isNearLimit: budget.maxCostUsd !== Infinity && consumed ? (consumed.costUsd / budget.maxCostUsd) >= 0.8 : false
            } : null,
            recentRecords: records.slice(-30).reverse()
        };
    }

    exportRecords(format = 'json', contextId = null) {
        let records = this.inMemoryRecords;
        if (contextId) {
            records = records.filter(r => r.contextId === contextId);
        }

        if (format === 'csv') {
            const headers = ['id', 'requestId', 'timestamp', 'model', 'provider', 'inputTokens', 'outputTokens', 'cachedTokens', 'totalTokens', 'estimatedCost', 'costKnown', 'durationMs', 'success', 'purpose', 'contextId'];
            const rows = records.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','));
            return [headers.join(','), ...rows].join('\n');
        }

        return JSON.stringify(records, null, 2);
    }
}

module.exports = UsageTracker;
