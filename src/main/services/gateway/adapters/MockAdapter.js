/**
 * HEADROOM AI API Gateway — Mock / Deterministic Sandbox Adapter
 *
 * Provides instant, zero-cost, deterministic execution for offline testing
 * and local sandbox workflows. 100% Pure JavaScript.
 */

const BaseAdapter = require('./BaseAdapter.js');

class MockAdapter extends BaseAdapter {
    constructor(options = {}) {
        super('mock', options);
    }

    async testConnection() {
        return {
            ok: true,
            latencyMs: 1,
            provider: 'mock',
            message: 'Local workforce deterministic sandbox operational.'
        };
    }

    async chatCompletion({ request, signal, onChunk } = {}) {
        if (signal?.aborted) {
            throw this.normalizeError(new Error('Request cancelled by caller.'));
        }

        const model = request.model || 'deterministic-workforce-engine';
        const messages = request.messages || [];
        const lastMsg = messages[messages.length - 1];
        const prompt = lastMsg ? (typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content)) : 'Hello';

        const outputText = `[HEADROOM Sandbox Response]\nVerified execution for request against model "${model}".\nObjective processed deterministically.`;

        // Estimate tokens
        const inputTokens = Math.max(1, Math.ceil(JSON.stringify(messages).length / 4));
        const outputTokens = Math.max(1, Math.ceil(outputText.length / 4));

        if (request.stream && typeof onChunk === 'function') {
            const chunks = outputText.split(' ');
            for (let i = 0; i < chunks.length; i++) {
                if (signal?.aborted) throw this.normalizeError(new Error('Stream aborted'));
                const piece = (i === 0 ? '' : ' ') + chunks[i];
                onChunk({
                    id: `chatcmpl-mock-${Date.now()}`,
                    object: 'chat.completion.chunk',
                    created: Math.floor(Date.now() / 1000),
                    model: model,
                    choices: [
                        {
                            index: 0,
                            delta: { content: piece },
                            finish_reason: i === chunks.length - 1 ? 'stop' : null
                        }
                    ]
                });
            }
        }

        return {
            id: `chatcmpl-mock-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: model,
            choices: [
                {
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: outputText
                    },
                    finish_reason: 'stop'
                }
            ],
            usage: {
                prompt_tokens: inputTokens,
                completion_tokens: outputTokens,
                total_tokens: inputTokens + outputTokens
            }
        };
    }
}

module.exports = MockAdapter;
