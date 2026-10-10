/**
 * HEADROOM AI API Gateway — Anthropic Adapter
 *
 * Implements Anthropic Messages API (/v1/messages) with SSE streaming,
 * format translation, and usage normalization. 100% Pure JavaScript.
 */

const BaseAdapter = require('./BaseAdapter.js');

class AnthropicAdapter extends BaseAdapter {
    constructor(options = {}) {
        super('anthropic', options);
        this.baseUrl = options.baseUrl || 'https://api.anthropic.com/v1';
        this.apiKey = options.apiKey || null;
        this.apiVersion = options.apiVersion || '2023-06-01';
        this.fetchImpl = options.fetchImpl || globalThis.fetch;
    }

    setApiKey(key) {
        this.apiKey = key;
    }

    async testConnection() {
        if (!this.apiKey) {
            return { ok: false, latencyMs: 0, error: 'Anthropic API key is missing' };
        }

        const start = Date.now();
        try {
            // A minimal probe request
            const res = await this.fetchImpl(`${this.baseUrl}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey,
                    'anthropic-version': this.apiVersion
                },
                body: JSON.stringify({
                    model: 'claude-3-5-haiku-20241022',
                    max_tokens: 1,
                    messages: [{ role: 'user', content: 'ping' }]
                })
            });

            const latencyMs = Date.now() - start;
            if (res.ok || res.status === 400) { // 400 means authenticated but payload validation reached
                return { ok: true, latencyMs, provider: 'anthropic' };
            } else {
                const text = await res.text();
                return { ok: false, latencyMs, error: `HTTP ${res.status}: ${text}` };
            }
        } catch (err) {
            return { ok: false, latencyMs: Date.now() - start, error: err.message };
        }
    }

    async chatCompletion({ request, signal, onChunk } = {}) {
        if (!this.apiKey) {
            throw this.normalizeError(new Error('Anthropic API key is not configured.'));
        }

        const model = request.model.replace(/^anthropic\//, '');
        let systemPrompt = '';
        const anthropicMessages = [];

        for (const msg of request.messages || []) {
            if (msg.role === 'system') {
                systemPrompt += (systemPrompt ? '\n\n' : '') + msg.content;
            } else {
                anthropicMessages.push({
                    role: msg.role === 'assistant' ? 'assistant' : 'user',
                    content: msg.content
                });
            }
        }

        const payload = {
            model: model,
            messages: anthropicMessages,
            max_tokens: request.max_tokens || 4096,
            temperature: request.temperature ?? 0.7,
            stream: Boolean(request.stream)
        };

        if (systemPrompt) payload.system = systemPrompt;

        const res = await this.fetchImpl(`${this.baseUrl}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': this.apiVersion
            },
            body: JSON.stringify(payload),
            signal
        });

        if (!res.ok) {
            const errBody = await res.text();
            let parsedErr;
            try { parsedErr = JSON.parse(errBody); } catch {}
            const msg = parsedErr?.error?.message || errBody || `HTTP ${res.status}`;
            const error = new Error(msg);
            error.status = res.status;
            throw this.normalizeError(error);
        }

        if (request.stream) {
            return this.handleStream(res, onChunk, model);
        } else {
            const raw = await res.json();
            return this.normalizeAnthropicResponse(raw, model);
        }
    }

    normalizeAnthropicResponse(raw, model) {
        let contentText = '';
        if (Array.isArray(raw.content)) {
            contentText = raw.content.map(c => c.text || '').join('');
        }

        return {
            id: raw.id || `anthropic-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: model,
            choices: [
                {
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: contentText
                    },
                    finish_reason: raw.stop_reason === 'end_turn' ? 'stop' : (raw.stop_reason || 'stop')
                }
            ],
            usage: {
                prompt_tokens: raw.usage?.input_tokens || 0,
                completion_tokens: raw.usage?.output_tokens || 0,
                total_tokens: (raw.usage?.input_tokens || 0) + (raw.usage?.output_tokens || 0)
            }
        };
    }

    async handleStream(res, onChunk, model) {
        const reader = res.body.getReader ? res.body.getReader() : null;
        let aggregatedContent = '';
        let inputTokens = 0;
        let outputTokens = 0;

        if (!reader) {
            const body = await res.text();
            return this.normalizeAnthropicResponse(JSON.parse(body), model);
        }

        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const data = trimmed.replace(/^data:\s*/, '');

                try {
                    const parsed = JSON.parse(data);
                    if (parsed.type === 'message_start' && parsed.message?.usage) {
                        inputTokens = parsed.message.usage.input_tokens || 0;
                    }
                    if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                        const piece = parsed.delta.text;
                        aggregatedContent += piece;
                        if (typeof onChunk === 'function') {
                            onChunk({
                                id: `chatcmpl-${Date.now()}`,
                                object: 'chat.completion.chunk',
                                created: Math.floor(Date.now() / 1000),
                                model: model,
                                choices: [
                                    {
                                        index: 0,
                                        delta: { content: piece },
                                        finish_reason: null
                                    }
                                ]
                            });
                        }
                    }
                    if (parsed.type === 'message_delta' && parsed.usage) {
                        outputTokens = parsed.usage.output_tokens || 0;
                    }
                } catch (e) {}
            }
        }

        return {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: model,
            choices: [
                {
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: aggregatedContent
                    },
                    finish_reason: 'stop'
                }
            ],
            usage: {
                prompt_tokens: inputTokens,
                completion_tokens: outputTokens || Math.max(1, Math.ceil(aggregatedContent.length / 4)),
                total_tokens: inputTokens + (outputTokens || Math.max(1, Math.ceil(aggregatedContent.length / 4)))
            }
        };
    }
}

module.exports = AnthropicAdapter;
