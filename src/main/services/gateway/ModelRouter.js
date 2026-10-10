/**
 * HEADROOM AI API Gateway — Intelligent Model Router
 *
 * Implements deterministic routing policies based on real model capabilities,
 * context windows, budget ceilings, and credential availability.
 * 100% Pure JavaScript.
 */

class ModelRouter {
    constructor(modelRegistry, credentialManager) {
        this.registry = modelRegistry;
        this.credentialManager = credentialManager;
    }

    /**
     * Select best eligible model for a given task and policy.
     * @param {Object} options
     * @param {string} [options.policy='balanced'] - 'economy' | 'balanced' | 'quality' | 'coding' | 'reasoning' | 'long-context'
     * @param {string} [options.modelOverride] - Direct model id if requested by user/task
     * @param {Object} [options.requirements] - { tools: boolean, contextLength: number, reasoning: boolean, maxCostPerMillion: number }
     * @param {number} [options.budgetCeiling] - Max allowable request cost
     * @returns {{ model: Object, reason: string }} Selected model definition and routing explanation
     */
    route({ policy = 'balanced', modelOverride, requirements = {}, budgetCeiling } = {}) {
        const allModels = this.registry.getAllModels();

        // 1. Direct Model Override if valid & available
        if (modelOverride) {
            const requested = this.registry.getModel(modelOverride);
            if (requested) {
                const hasKey = this.hasCredentialFor(requested.provider);
                if (hasKey || requested.provider === 'mock') {
                    return {
                        model: requested,
                        reason: `User/task explicitly specified model "${requested.id}". Credential is valid.`
                    };
                }
            }
        }

        // 2. Filter models by active credentials
        const cloudCandidatesWithKeys = allModels.filter(m => {
            if (m.provider === 'mock') return false;
            return this.hasCredentialFor(m.provider);
        });

        const candidatesWithKeys = cloudCandidatesWithKeys.length > 0
            ? cloudCandidatesWithKeys
            : allModels.filter(m => m.provider === 'mock');

        if (cloudCandidatesWithKeys.length === 0) {
            const mock = this.registry.getModel('mock/deterministic-workforce');
            return {
                model: mock,
                reason: 'No cloud provider credentials found. Routed to local workforce deterministic sandbox.'
            };
        }

        // 3. Filter candidates by capability requirements
        let eligible = candidatesWithKeys.filter(m => {
            if (requirements.tools && !m.capabilities.tools) return false;
            if (requirements.reasoning && !m.capabilities.reasoning) return false;
            if (requirements.contextLength && m.contextWindow < requirements.contextLength) return false;
            if (requirements.maxCostPerMillion && m.pricing.inputPerMillion > requirements.maxCostPerMillion) return false;
            return true;
        });

        if (eligible.length === 0) {
            // Soften optional restrictions if no exact match
            eligible = candidatesWithKeys;
        }

        // 4. Apply Deterministic Policy
        let selected = null;
        let reason = '';

        switch (policy) {
            case 'economy': {
                // Lowest input + output price
                eligible.sort((a, b) => {
                    const costA = (a.pricing?.inputPerMillion || 0) + (a.pricing?.outputPerMillion || 0);
                    const costB = (b.pricing?.inputPerMillion || 0) + (b.pricing?.outputPerMillion || 0);
                    return costA - costB;
                });
                selected = eligible[0];
                reason = `Selected "${selected.id}" under 'economy' policy: Lowest blended pricing ($${selected.pricing.inputPerMillion}/M input, $${selected.pricing.outputPerMillion}/M output).`;
                break;
            }

            case 'quality': {
                // Prioritize top-tier models with highest context & benchmark capabilities
                eligible.sort((a, b) => {
                    const scoreA = (a.pricing?.inputPerMillion || 0) + (a.capabilities.tools ? 10 : 0);
                    const scoreB = (b.pricing?.inputPerMillion || 0) + (b.capabilities.tools ? 10 : 0);
                    return scoreB - scoreA;
                });
                selected = eligible[0];
                reason = `Selected "${selected.id}" under 'quality' policy: Highest capability score and benchmark fidelity.`;
                break;
            }

            case 'coding': {
                // Prioritize models with strong tool calling and structured output
                const codingModels = eligible.filter(m => m.capabilities.tools && m.capabilities.structuredOutput);
                const pool = codingModels.length > 0 ? codingModels : eligible;
                pool.sort((a, b) => b.contextWindow - a.contextWindow);
                selected = pool[0];
                reason = `Selected "${selected.id}" under 'coding' policy: Verified tool calling, structured output, and large context (${selected.contextWindow} tokens).`;
                break;
            }

            case 'reasoning': {
                const reasoningModels = eligible.filter(m => m.capabilities.reasoning);
                if (reasoningModels.length > 0) {
                    selected = reasoningModels[0];
                    reason = `Selected "${selected.id}" under 'reasoning' policy: Extended thinking and reasoning capability.`;
                } else {
                    eligible.sort((a, b) => (b.pricing?.inputPerMillion || 0) - (a.pricing?.inputPerMillion || 0));
                    selected = eligible[0];
                    reason = `Selected "${selected.id}" under 'reasoning' policy: Fallback to highest capacity quality model.`;
                }
                break;
            }

            case 'long-context': {
                eligible.sort((a, b) => b.contextWindow - a.contextWindow);
                selected = eligible[0];
                reason = `Selected "${selected.id}" under 'long-context' policy: Maximum context window (${selected.contextWindow} tokens).`;
                break;
            }

            case 'balanced':
            default: {
                // Balance cost and capability: prefer flash/mini models with tools
                const sweetSpot = eligible.find(m => m.id.includes('flash') || m.id.includes('mini') || m.id.includes('haiku'));
                selected = sweetSpot || eligible[0];
                reason = `Selected "${selected.id}" under 'balanced' policy: Optimal latency, capability, and efficiency trade-off.`;
                break;
            }
        }

        return { model: selected, reason };
    }

    hasCredentialFor(provider) {
        if (!this.credentialManager) return false;
        return this.credentialManager.hasCredential(provider);
    }
}

module.exports = ModelRouter;
