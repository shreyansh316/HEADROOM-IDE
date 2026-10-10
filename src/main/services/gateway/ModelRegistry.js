/**
 * HEADROOM AI API Gateway — Authoritative Model Registry
 *
 * Stores genuine model metadata, capabilities, context limits, and pricing provenance
 * across supported providers (OpenAI, Anthropic, Gemini, OpenAI-compatible).
 * 100% Pure JavaScript.
 */

class ModelRegistry {
    constructor() {
        this.models = new Map();
        this.initDefaultModels();
    }

    initDefaultModels() {
        const defaultModels = [
            // 1. Google Gemini
            {
                id: 'gemini/gemini-1.5-flash',
                provider: 'gemini',
                providerModelId: 'gemini-1.5-flash',
                name: 'Gemini 1.5 Flash',
                contextWindow: 1048576,
                maxOutputTokens: 8192,
                capabilities: {
                    modalities: ['text', 'image', 'audio', 'video'],
                    tools: true,
                    streaming: true,
                    structuredOutput: true,
                    reasoning: false
                },
                pricing: {
                    inputPerMillion: 0.075,
                    outputPerMillion: 0.30,
                    unit: 'USD',
                    source: 'Google Cloud Pricing (Oct 2024)'
                },
                availability: 'configured'
            },
            {
                id: 'gemini/gemini-1.5-pro',
                provider: 'gemini',
                providerModelId: 'gemini-1.5-pro',
                name: 'Gemini 1.5 Pro',
                contextWindow: 2097152,
                maxOutputTokens: 8192,
                capabilities: {
                    modalities: ['text', 'image', 'audio', 'video'],
                    tools: true,
                    streaming: true,
                    structuredOutput: true,
                    reasoning: false
                },
                pricing: {
                    inputPerMillion: 1.25,
                    outputPerMillion: 5.00,
                    unit: 'USD',
                    source: 'Google Cloud Pricing (Oct 2024)'
                },
                availability: 'configured'
            },

            // 2. OpenAI
            {
                id: 'openai/gpt-4o-mini',
                provider: 'openai',
                providerModelId: 'gpt-4o-mini',
                name: 'GPT-4o Mini',
                contextWindow: 128000,
                maxOutputTokens: 16384,
                capabilities: {
                    modalities: ['text', 'image'],
                    tools: true,
                    streaming: true,
                    structuredOutput: true,
                    reasoning: false
                },
                pricing: {
                    inputPerMillion: 0.15,
                    outputPerMillion: 0.60,
                    unit: 'USD',
                    source: 'OpenAI Pricing (July 2024)'
                },
                availability: 'configured'
            },
            {
                id: 'openai/gpt-4o',
                provider: 'openai',
                providerModelId: 'gpt-4o',
                name: 'GPT-4o',
                contextWindow: 128000,
                maxOutputTokens: 16384,
                capabilities: {
                    modalities: ['text', 'image'],
                    tools: true,
                    streaming: true,
                    structuredOutput: true,
                    reasoning: false
                },
                pricing: {
                    inputPerMillion: 2.50,
                    outputPerMillion: 10.00,
                    unit: 'USD',
                    source: 'OpenAI Pricing (Aug 2024)'
                },
                availability: 'configured'
            },
            {
                id: 'openai/o1-mini',
                provider: 'openai',
                providerModelId: 'o1-mini',
                name: 'o1-mini (Reasoning)',
                contextWindow: 128000,
                maxOutputTokens: 65536,
                capabilities: {
                    modalities: ['text'],
                    tools: false,
                    streaming: true,
                    structuredOutput: true,
                    reasoning: true
                },
                pricing: {
                    inputPerMillion: 3.00,
                    outputPerMillion: 12.00,
                    unit: 'USD',
                    source: 'OpenAI Pricing (Sept 2024)'
                },
                availability: 'configured'
            },

            // 3. Anthropic
            {
                id: 'anthropic/claude-3-5-sonnet',
                provider: 'anthropic',
                providerModelId: 'claude-3-5-sonnet-20241022',
                name: 'Claude 3.5 Sonnet',
                contextWindow: 200000,
                maxOutputTokens: 8192,
                capabilities: {
                    modalities: ['text', 'image'],
                    tools: true,
                    streaming: true,
                    structuredOutput: true,
                    reasoning: false
                },
                pricing: {
                    inputPerMillion: 3.00,
                    outputPerMillion: 15.00,
                    unit: 'USD',
                    source: 'Anthropic Pricing (Oct 2024)'
                },
                availability: 'configured'
            },
            {
                id: 'anthropic/claude-3-5-haiku',
                provider: 'anthropic',
                providerModelId: 'claude-3-5-haiku-20241022',
                name: 'Claude 3.5 Haiku',
                contextWindow: 200000,
                maxOutputTokens: 8192,
                capabilities: {
                    modalities: ['text'],
                    tools: true,
                    streaming: true,
                    structuredOutput: true,
                    reasoning: false
                },
                pricing: {
                    inputPerMillion: 0.80,
                    outputPerMillion: 4.00,
                    unit: 'USD',
                    source: 'Anthropic Pricing (Nov 2024)'
                },
                availability: 'configured'
            },

            // 4. Mock / Local Deterministic Sandbox
            {
                id: 'mock/deterministic-workforce',
                provider: 'mock',
                providerModelId: 'deterministic-workforce-engine',
                name: 'Local Workforce Engine (Offline Sandbox)',
                contextWindow: 64000,
                maxOutputTokens: 4096,
                capabilities: {
                    modalities: ['text'],
                    tools: true,
                    streaming: true,
                    structuredOutput: true,
                    reasoning: true
                },
                pricing: {
                    inputPerMillion: 0.00,
                    outputPerMillion: 0.00,
                    unit: 'USD',
                    source: 'Local Zero-Cost Execution'
                },
                availability: 'active'
            }
        ];

        for (const model of defaultModels) {
            this.models.set(model.id, Object.freeze(model));
        }
    }

    getModel(id) {
        if (!id) return null;
        // Direct match
        if (this.models.has(id)) return this.models.get(id);

        // Fallback: match by providerModelId
        for (const model of this.models.values()) {
            if (model.providerModelId === id) return model;
        }
        return null;
    }

    getAllModels() {
        return Array.from(this.models.values());
    }

    getModelsByProvider(provider) {
        return Array.from(this.models.values()).filter(m => m.provider === provider);
    }

    registerModel(modelDefinition) {
        if (!modelDefinition || !modelDefinition.id || !modelDefinition.provider) {
            throw new Error('Model registration requires valid id and provider.');
        }

        const normalized = {
            id: String(modelDefinition.id).trim(),
            provider: String(modelDefinition.provider).trim(),
            providerModelId: String(modelDefinition.providerModelId || modelDefinition.id).trim(),
            name: String(modelDefinition.name || modelDefinition.id).trim(),
            contextWindow: Number.isSafeInteger(modelDefinition.contextWindow) ? modelDefinition.contextWindow : 32000,
            maxOutputTokens: Number.isSafeInteger(modelDefinition.maxOutputTokens) ? modelDefinition.maxOutputTokens : 4096,
            capabilities: {
                modalities: Array.isArray(modelDefinition.capabilities?.modalities) ? modelDefinition.capabilities.modalities : ['text'],
                tools: Boolean(modelDefinition.capabilities?.tools),
                streaming: modelDefinition.capabilities?.streaming !== false,
                structuredOutput: Boolean(modelDefinition.capabilities?.structuredOutput),
                reasoning: Boolean(modelDefinition.capabilities?.reasoning)
            },
            pricing: {
                inputPerMillion: typeof modelDefinition.pricing?.inputPerMillion === 'number' ? modelDefinition.pricing.inputPerMillion : 0,
                outputPerMillion: typeof modelDefinition.pricing?.outputPerMillion === 'number' ? modelDefinition.pricing.outputPerMillion : 0,
                unit: 'USD',
                source: modelDefinition.pricing?.source || 'Custom Admin Registration'
            },
            availability: modelDefinition.availability || 'configured'
        };

        this.models.set(normalized.id, Object.freeze(normalized));
        return normalized;
    }

    estimateCost(modelId, { inputTokens = 0, outputTokens = 0 } = {}) {
        const model = this.getModel(modelId);
        if (!model || !model.pricing) return { estimatedCost: 0, costKnown: false };

        const inputCost = (inputTokens / 1000000) * model.pricing.inputPerMillion;
        const outputCost = (outputTokens / 1000000) * model.pricing.outputPerMillion;
        const totalCost = Number((inputCost + outputCost).toFixed(6));

        return {
            estimatedCost: totalCost,
            costKnown: true,
            unit: 'USD',
            source: model.pricing.source
        };
    }
}

module.exports = ModelRegistry;
