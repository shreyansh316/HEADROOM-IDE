/**
 * HEADROOM AI API Gateway — Orchestration Service
 *
 * Coordinates ModelRegistry, Provider Adapters, Intelligent Routing,
 * Resilience (Retries/Fallback), and Usage Tracking.
 * 100% Pure JavaScript.
 */

const ModelRegistry = require('./ModelRegistry.js');
const CredentialManager = require('./CredentialManager.js');
const ModelRouter = require('./ModelRouter.js');
const GatewayResilience = require('./GatewayResilience.js');
const UsageTracker = require('./UsageTracker.js');
const TokenEfficiencyEngine = require('./TokenEfficiencyEngine.js');
const BudgetControlManager = require('./BudgetControlManager.js');

const OpenAIAdapter = require('./adapters/OpenAIAdapter.js');
const AnthropicAdapter = require('./adapters/AnthropicAdapter.js');
const GeminiAdapter = require('./adapters/GeminiAdapter.js');
const CompatibleAdapter = require('./adapters/CompatibleAdapter.js');
const MockAdapter = require('./adapters/MockAdapter.js');

class GatewayService {
    constructor(options = {}) {
        this.storagePath = options.storagePath || null;
        this.sqliteConnection = options.sqliteConnection || null;

        this.registry = new ModelRegistry();
        this.credentialManager = new CredentialManager({ storagePath: this.storagePath, safeStorage: options.safeStorage });
        this.router = new ModelRouter(this.registry, this.credentialManager);
        this.resilience = new GatewayResilience({ maxRetries: 2 });
        this.usageTracker = new UsageTracker({
            sqliteConnection: this.sqliteConnection,
            modelRegistry: this.registry
        });
        this.tokenEfficiency = new TokenEfficiencyEngine();
        this.budgetControls = new BudgetControlManager({
            sqliteConnection: this.sqliteConnection
        });

        // Initialize adapters
        this.adapters = new Map();
        this.initAdapters();
    }

    initializeSecureStorage(storagePath, safeStorage) {
        const ready = this.credentialManager.initializeSecureStorage(storagePath, safeStorage);
        this.initAdapters();
        return ready;
    }

    initAdapters() {
        this.adapters.set('mock', new MockAdapter());
        this.adapters.set('openai', new OpenAIAdapter({
            apiKey: this.credentialManager.getCredential('openai')
        }));
        this.adapters.set('anthropic', new AnthropicAdapter({
            apiKey: this.credentialManager.getCredential('anthropic')
        }));
        this.adapters.set('gemini', new GeminiAdapter({
            apiKey: this.credentialManager.getCredential('gemini')
        }));
        this.adapters.set('compatible', new CompatibleAdapter({
            ...(this.credentialManager.getEndpointConfig('compatible') || {}),
            apiKey: this.credentialManager.getCredential('compatible') || ''
        }));
    }

    getAdapter(provider) {
        return this.adapters.get(provider) || null;
    }

    /**
     * Unified Chat Completion API with routing, fallback, resilience, and usage tracking.
     */
    async chatCompletion({
        request,
        policy = 'balanced',
        requirements = {},
        contextId = null,
        signal = null,
        onChunk = null
    } = {}) {
        const start = Date.now();

        // 1. Hierarchical Budget Pre-Flight Check (Task, Mission, Monthly)
        const budgetCheck = this.budgetControls.evaluatePreflightSpend({
            contextId,
            estimatedTokens: 1000,
            estimatedCostUsd: 0.01
        });
        if (!budgetCheck.allowed) {
            const err = new Error(budgetCheck.reason);
            err.code = budgetCheck.code;
            err.scopeId = budgetCheck.scopeId;
            throw err;
        }

        // 2. Intelligent Routing Decision
        const routingDecision = this.router.route({
            policy,
            modelOverride: request.model,
            requirements
        });

        const selectedModel = routingDecision.model;

        // 3. Prepare fallback candidate models under same policy
        const allCandidates = this.registry.getAllModels().filter(m => {
            if (m.id === selectedModel.id) return false;
            if (m.provider === 'mock') return true;
            return this.credentialManager.hasCredential(m.provider);
        });

        // 4. Execute with Resilience & Fallback
        const fallbackTrace = [];
        const result = await this.resilience.executeWithFallback({
            primaryModel: selectedModel,
            fallbackModels: allCandidates.slice(0, 2),
            signal,
            onFallback: (trace) => {
                fallbackTrace.push(trace);
            },
            executeFn: async (targetModel, attempt) => {
                const adapter = this.getAdapter(targetModel.provider);
                if (!adapter) {
                    throw new Error(`No adapter available for provider "${targetModel.provider}".`);
                }

                // Sync latest API key in case updated recently
                if (typeof adapter.setApiKey === 'function') {
                    adapter.setApiKey(this.credentialManager.getCredential(targetModel.provider));
                }

                const adaptedRequest = {
                    ...request,
                    model: targetModel.providerModelId || targetModel.id
                };

                return await adapter.chatCompletion({
                    request: adaptedRequest,
                    signal,
                    onChunk
                });
            }
        });

        const durationMs = Date.now() - start;

        // 5. Record Usage Telemetry & Budget Consumption
        const usageRecord = this.usageTracker.recordRequestUsage({
            requestId: result.id,
            modelId: result.routingMeta?.modelUsed || selectedModel.id,
            provider: selectedModel.provider,
            usage: result.usage,
            durationMs,
            success: true,
            contextId
        });

        this.budgetControls.recordSpend({
            contextId,
            tokens: usageRecord.totalTokens,
            costUsd: usageRecord.estimatedCost
        });

        // Annotate response with gateway routing metadata
        result.headroomGateway = {
            routingPolicy: policy,
            selectedModel: selectedModel.id,
            actualModel: result.routingMeta?.modelUsed || selectedModel.id,
            routingReason: routingDecision.reason,
            fellBack: Boolean(result.routingMeta?.fellBack),
            fallbackTrace,
            durationMs,
            estimatedCost: usageRecord.estimatedCost,
            costCurrency: 'USD'
        };

        return result;
    }

    /**
     * Test connection for a given provider.
     */
    async testProviderConnection(provider) {
        const adapter = this.getAdapter(provider);
        if (!adapter) {
            return { ok: false, error: `Provider "${provider}" is not supported.` };
        }

        if (typeof adapter.setApiKey === 'function') {
            adapter.setApiKey(this.credentialManager.getCredential(provider));
        }

        return await adapter.testConnection();
    }

    /**
     * Update provider credential.
     */
    setProviderCredential(provider, apiKey) {
        this.credentialManager.setCredential(provider, apiKey);
        const adapter = this.getAdapter(provider);
        if (adapter && typeof adapter.setApiKey === 'function') {
            adapter.setApiKey(apiKey);
        }
    }

    /**
     * Configure OpenAI-compatible endpoint.
     */
    setCompatibleEndpoint(config) {
        if (!config || typeof config !== 'object' || Array.isArray(config)) {
            throw new TypeError('A compatible endpoint configuration object is required.');
        }
        const { apiKey, ...endpointConfig } = config;
        if (apiKey !== undefined) this.credentialManager.setCredential('compatible', apiKey);
        this.credentialManager.setEndpointConfig('compatible', endpointConfig);
        const adapter = this.getAdapter('compatible');
        if (adapter) {
            adapter.setEndpoint({ ...endpointConfig, apiKey: this.credentialManager.getCredential('compatible') || '' });
        }
    }

    /**
     * Return safe provider statuses for renderer.
     */
    getSafeProviderStatus() {
        return this.credentialManager.getSafeStatus();
    }

    /**
     * Return registered models.
     */
    getModels() {
        return this.registry.getAllModels();
    }

    /**
     * Return usage telemetry summary.
     */
    getUsageStats(contextId) {
        return this.usageTracker.getSummary(contextId);
    }

    /**
     * Export usage telemetry in CSV or JSON.
     */
    exportUsage(format = 'json', contextId = null) {
        return this.usageTracker.exportRecords(format, contextId);
    }

    /**
     * Phase 11: Token Intelligence & Context Pruning
     */
    pruneContext(messages, tokenLimit) {
        return this.tokenEfficiency.pruneContext(messages, tokenLimit);
    }

    deduplicateContext(messages) {
        return this.tokenEfficiency.deduplicateMessages(messages);
    }

    compressHandoff(handoffState) {
        return this.tokenEfficiency.compressHandoff(handoffState);
    }

    estimateTokens(text) {
        return this.tokenEfficiency.estimateTokens(text);
    }

    /**
     * Phase 12: Budget & Spend Controls
     */
    setBudgetPolicy(scopeId, policy) {
        return this.budgetControls.setBudgetPolicy(scopeId, policy);
    }

    getBudgetSummary(scopeId) {
        return this.budgetControls.getSpendSummary(scopeId);
    }

    grantExecutiveBudgetOverride(overrideParams) {
        return this.budgetControls.grantExecutiveOverride(overrideParams);
    }

    revokeExecutiveBudgetOverride(scopeId) {
        return this.budgetControls.revokeExecutiveOverride(scopeId);
    }
}

module.exports = GatewayService;
