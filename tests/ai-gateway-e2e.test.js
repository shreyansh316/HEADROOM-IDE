import { describe, it, expect, beforeEach, afterEach } from 'vitest';
const GatewayService = require('../src/main/services/gateway/GatewayService.js');
const GatewayServer = require('../src/main/services/gateway/GatewayServer.js');
const ModelRegistry = require('../src/main/services/gateway/ModelRegistry.js');
const ModelRouter = require('../src/main/services/gateway/ModelRouter.js');
const CredentialManager = require('../src/main/services/gateway/CredentialManager.js');
const GatewayResilience = require('../src/main/services/gateway/GatewayResilience.js');
const UsageTracker = require('../src/main/services/gateway/UsageTracker.js');
const CompatibleAdapter = require('../src/main/services/gateway/adapters/CompatibleAdapter.js');

describe('HEADROOM AI API Gateway E2E & Unit Test Suite', () => {

    describe('1. Model Registry & Pricing Provenance', () => {
        it('initializes with authoritative models and genuine pricing', () => {
            const registry = new ModelRegistry();
            const models = registry.getAllModels();
            expect(models.length).toBeGreaterThanOrEqual(7);

            const geminiFlash = registry.getModel('gemini/gemini-1.5-flash');
            expect(geminiFlash).toBeDefined();
            expect(geminiFlash.contextWindow).toBe(1048576);
            expect(geminiFlash.pricing.inputPerMillion).toBe(0.075);
            expect(geminiFlash.pricing.unit).toBe('USD');

            const gpt4o = registry.getModel('openai/gpt-4o');
            expect(gpt4o.contextWindow).toBe(128000);
            expect(gpt4o.capabilities.tools).toBe(true);
        });

        it('calculates cost estimates accurately based on model pricing', () => {
            const registry = new ModelRegistry();
            // gpt-4o: $2.50 / 1M input, $10.00 / 1M output
            const cost = registry.estimateCost('openai/gpt-4o', { inputTokens: 100000, outputTokens: 50000 });
            expect(cost.costKnown).toBe(true);
            // 0.1 * 2.50 = 0.25; 0.05 * 10.00 = 0.50 => 0.75
            expect(cost.estimatedCost).toBe(0.75);
        });
    });

    describe('2. Intelligent Model Routing Policies', () => {
        let registry, creds, router;

        beforeEach(() => {
            registry = new ModelRegistry();
            creds = new CredentialManager();
            creds.setCredential('openai', 'sk-mock-key-1234');
            creds.setCredential('anthropic', 'sk-ant-mock-key');
            creds.setCredential('gemini', 'mock-gemini-key');
            router = new ModelRouter(registry, creds);
        });

        it('routes to lowest-cost candidate under economy policy', () => {
            const decision = router.route({ policy: 'economy' });
            expect(decision.model).toBeDefined();
            // Gemini 1.5 flash has lowest input/output cost among cloud models
            expect(decision.model.id).toBe('gemini/gemini-1.5-flash');
            expect(decision.reason).toContain('economy');
        });

        it('routes to highest capability benchmark model under quality policy', () => {
            const decision = router.route({ policy: 'quality' });
            expect(decision.model).toBeDefined();
            expect(['openai/gpt-4o', 'anthropic/claude-3-5-sonnet']).toContain(decision.model.id);
            expect(decision.reason).toContain('quality');
        });

        it('routes to reasoning model under reasoning policy', () => {
            const decision = router.route({ policy: 'reasoning' });
            expect(decision.model.capabilities.reasoning).toBe(true);
            expect(decision.model.id).toBe('openai/o1-mini');
        });

        it('falls back to deterministic local mock when no cloud keys are provided', () => {
            const emptyCreds = new CredentialManager();
            const localRouter = new ModelRouter(registry, emptyCreds);
            const decision = localRouter.route({ policy: 'balanced' });
            expect(decision.model.id).toBe('mock/deterministic-workforce');
            expect(decision.reason).toContain('local workforce deterministic sandbox');
        });
    });

    describe('3. SSRF Protection & Compatible Adapter Security', () => {
        it('blocks access to cloud metadata IP addresses', () => {
            expect(() => {
                new CompatibleAdapter({ baseUrl: 'http://169.254.169.254/v1' });
            }).toThrow(/cloud metadata/i);
        });

        it('blocks access to Google internal metadata', () => {
            expect(() => {
                new CompatibleAdapter({ baseUrl: 'http://metadata.google.internal/computeMetadata/v1' });
            }).toThrow(/cloud metadata/i);
        });

        it('allows valid external or loopback inference endpoints with proper protocols', () => {
            const adapter = new CompatibleAdapter({ baseUrl: 'http://127.0.0.1:11434/v1' });
            expect(adapter.baseUrl).toBe('http://127.0.0.1:11434/v1');
        });
    });

    describe('4. Gateway Resilience, Retries & Fallback', () => {
        it('retries transient 429 rate limit error and succeeds on subsequent attempt', async () => {
            const resilience = new GatewayResilience({ maxRetries: 2, baseDelayMs: 20 });
            let attempts = 0;

            const res = await resilience.executeWithRetry(async (attempt) => {
                attempts++;
                if (attempt === 0) {
                    const err = new Error('Rate limit exceeded');
                    err.status = 429;
                    err.retryable = true;
                    throw err;
                }
                return { success: true, attempt };
            });

            expect(res.success).toBe(true);
            expect(attempts).toBe(2);
        });

        it('cascades to fallback model when primary encounters permanent failure', async () => {
            const resilience = new GatewayResilience({ maxRetries: 1, baseDelayMs: 10 });
            const primary = { id: 'primary-model', provider: 'test' };
            const fallback = { id: 'fallback-model', provider: 'test' };

            const res = await resilience.executeWithFallback({
                primaryModel: primary,
                fallbackModels: [fallback],
                executeFn: async (targetModel) => {
                    if (targetModel.id === 'primary-model') {
                        const err = new Error('Primary provider outage');
                        err.status = 503;
                        err.retryable = false;
                        throw err;
                    }
                    return { ok: true, model: targetModel.id };
                }
            });

            expect(res.ok).toBe(true);
            expect(res.routingMeta.fellBack).toBe(true);
            expect(res.routingMeta.modelUsed).toBe('fallback-model');
        });
    });

    describe('5. Usage Tracking & Budget Enforcement', () => {
        it('enforces token budget and rejects requests exceeding ceiling', () => {
            const registry = new ModelRegistry();
            const tracker = new UsageTracker({ modelRegistry: registry });

            tracker.setBudget('task-100', { maxTokens: 1000, maxCostUsd: 1.0 });
            const check1 = tracker.checkBudget('task-100', 500);
            expect(check1.ok).toBe(true);

            tracker.recordRequestUsage({
                requestId: 'r1',
                modelId: 'openai/gpt-4o',
                provider: 'openai',
                usage: { prompt_tokens: 400, completion_tokens: 400 },
                contextId: 'task-100'
            });

            const check2 = tracker.checkBudget('task-100', 300); // 800 + 300 = 1100 > 1000
            expect(check2.ok).toBe(false);
            expect(check2.code).toBe('budget-exceeded');
        });

        it('tracks cached tokens and calculates multi-dimensional breakdown', () => {
            const registry = new ModelRegistry();
            const tracker = new UsageTracker({ modelRegistry: registry });

            tracker.recordRequestUsage({
                requestId: 'req-cached-1',
                modelId: 'anthropic/claude-3-5-sonnet',
                provider: 'anthropic',
                usage: {
                    inputTokens: 2000,
                    outputTokens: 500,
                    cachedTokens: 1500
                },
                durationMs: 450,
                success: true,
                contextId: 'task-build-compiler'
            });

            tracker.recordRequestUsage({
                requestId: 'req-failed-1',
                modelId: 'openai/gpt-4o',
                provider: 'openai',
                usage: { inputTokens: 500, outputTokens: 0 },
                durationMs: 120,
                success: false,
                contextId: 'task-build-compiler'
            });

            const summary = tracker.getSummary();
            expect(summary.totalRequests).toBe(2);
            expect(summary.successfulRequests).toBe(1);
            expect(summary.failedRequests).toBe(1);
            expect(summary.totalInputTokens).toBe(2500);
            expect(summary.totalOutputTokens).toBe(500);
            expect(summary.totalCachedTokens).toBe(1500);
            expect(summary.totalTokens).toBe(3000);
            expect(summary.byProvider['anthropic'].requests).toBe(1);
            expect(summary.byProvider['anthropic'].tokens).toBe(2500);
            expect(summary.byProvider['openai'].requests).toBe(1);
            expect(summary.byModel['anthropic/claude-3-5-sonnet'].requests).toBe(1);
            expect(summary.byContext['task-build-compiler'].requests).toBe(2);
            expect(summary.costPerVerifiedTask).toBeGreaterThan(0);
        });

        it('exports usage telemetry in CSV and JSON formats', () => {
            const registry = new ModelRegistry();
            const tracker = new UsageTracker({ modelRegistry: registry });

            tracker.recordRequestUsage({
                requestId: 'req-export-test',
                modelId: 'gemini/gemini-1.5-flash',
                provider: 'gemini',
                usage: { prompt_tokens: 100, completion_tokens: 50, cached_tokens: 20 },
                contextId: 'task-export'
            });

            const jsonStr = tracker.exportRecords('json');
            const parsed = JSON.parse(jsonStr);
            expect(Array.isArray(parsed)).toBe(true);
            expect(parsed.length).toBe(1);
            expect(parsed[0].cachedTokens).toBe(20);

            const csvStr = tracker.exportRecords('csv');
            expect(csvStr).toContain('inputTokens,outputTokens,cachedTokens,totalTokens');
            expect(csvStr).toContain('gemini/gemini-1.5-flash');
            expect(csvStr).toContain('task-export');
        });

        it('recovers historical records from SQLite persistence across restarts', () => {
            const mockDb = {
                prepare: (sql) => ({
                    all: () => [
                        {
                            id: 'usage-db-1',
                            requestId: 'req-db-1',
                            model: 'openai/gpt-4o',
                            inputTokens: 1200,
                            outputTokens: 400,
                            estimatedCost: 0.007,
                            durationMs: 320,
                            purpose: 'agent-tooling',
                            success: 1,
                            contextId: 'task-sqlite-recovery',
                            provider: 'openai',
                            costKnown: 1,
                            timestamp: '2026-10-10T12:00:00.000Z'
                        }
                    ]
                })
            };

            const registry = new ModelRegistry();
            const tracker = new UsageTracker({ sqliteConnection: mockDb, modelRegistry: registry });
            const summary = tracker.getSummary();

            expect(summary.totalRequests).toBe(1);
            expect(summary.totalInputTokens).toBe(1200);
            expect(summary.totalOutputTokens).toBe(400);
            expect(summary.totalTokens).toBe(1600);
            expect(summary.byProvider['openai'].requests).toBe(1);
            expect(summary.recentRecords[0].requestId).toBe('req-db-1');
        });
    });

    describe('6. End-to-End Chat Completion & HTTP Server with SSE Streaming', () => {
        let service, server;
        const testPort = 41419;

        beforeEach(async () => {
            service = new GatewayService();
            server = new GatewayServer(service, { port: testPort, host: '127.0.0.1' });
            await server.start();
        });

        afterEach(async () => {
            if (server) await server.stop();
        });

        it('serves GET /health with active provider statuses', async () => {
            const res = await fetch(`http://127.0.0.1:${testPort}/health`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.status).toBe('healthy');
            expect(data.gateway).toBe('HEADROOM AI Gateway');
            expect(Array.isArray(data.providers)).toBe(true);
        });

        it('serves GET /v1/models listing genuine registered models', async () => {
            const res = await fetch(`http://127.0.0.1:${testPort}/v1/models`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.object).toBe('list');
            expect(data.data.length).toBeGreaterThanOrEqual(7);
            const foundMock = data.data.find(m => m.id === 'mock/deterministic-workforce');
            expect(foundMock).toBeDefined();
        });

        it('handles POST /v1/chat/completions non-streaming through deterministic sandbox', async () => {
            const res = await fetch(`http://127.0.0.1:${testPort}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'mock/deterministic-workforce',
                    messages: [{ role: 'user', content: 'Execute task analysis.' }]
                })
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.choices[0].message.content).toContain('HEADROOM Sandbox Response');
            expect(data.headroomGateway).toBeDefined();
            expect(data.headroomGateway.selectedModel).toBe('mock/deterministic-workforce');
        });

        it('handles POST /v1/chat/completions with SSE streaming chunks', async () => {
            const res = await fetch(`http://127.0.0.1:${testPort}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'mock/deterministic-workforce',
                    messages: [{ role: 'user', content: 'Stream test message' }],
                    stream: true
                })
            });

            expect(res.status).toBe(200);
            expect(res.headers.get('content-type')).toContain('text/event-stream');
            const text = await res.text();
            expect(text).toContain('data:');
            expect(text).toContain('[DONE]');
            expect(text).toContain('chat.completion.chunk');
        });
    });
});
