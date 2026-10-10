/**
 * HEADROOM AI API Gateway — OpenAI Adapter
 *
 * Implements native OpenAI API (/v1/chat/completions) with SSE streaming,
 * tool calling, and usage normalization. 100% Pure JavaScript.
 */

const BaseAdapter = require('./BaseAdapter.js');

class OpenAIAdapter extends BaseAdapter {
    constructor(options = {}) {
        super('openai', options);
        this.baseUrl = options.baseUrl || 'https://api.openai.com/v1';
        this.apiKey = options.apiKey || null;
        this.fetchImpl = options.fetchImpl || globalThis.fetch;
    }

    setApiKey(key) {
        this.apiKey = key;
    }

    async testConnection() {
        if (!this.apiKey) {
            return { ok: false, latencyMs: 0, error: 'OpenAI API key is missing' };
        }

        const start = Date.now();
        try {
            const res = await this.fetchImpl(`${this.baseUrl}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            const latencyMs = Date.now() - start;
            if (res.ok) {
                return { ok: true, latencyMs, provider: 'openai' };
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
            throw this.normalizeError(new Error('OpenAI API key is not configured.'));
        }

        const payload = {
            model: request.model.replace(/^openai\//, ''),
            messages: request.messages,
            temperature: request.temperature ?? 0.7,
            max_tokens: request.max_tokens || request.max_completion_tokens,
            stream: Boolean(request.stream)
        };

        if (request.tools) payload.tools = request.tools;
        if (request.tool_choice) payload.tool_choice = request.tool_choice;
        if (request.response_format) payload.response_format = request.response_format;

        const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
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
            return this.handleStream(res, onChunk);
        } else {
            return await res.json();
        }
    }

    async handleStream(res, onChunk) {
        const reader = res.body.getReader ? res.body.getReader() : null;
        let finalResponse = null;
        let aggregatedContent = '';

        if (!reader) {
            // Node.js stream fallback if not web-streams
            const body = await res.text();
            return JSON.parse(body);
        }

        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep partial line

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const data = trimmed.replace(/^data:\s*/, '');
                if (data === '[DONE]') break;

                try {
                    const parsed = JSON.parse(data);
                    if (parsed.choices && parsed.choices[0]?.delta?.content) {
                        aggregatedContent += parsed.choices[0].delta.content;
                    }
                    if (typeof onChunk === 'function') {
                        onChunk(parsed);
                    }
                    finalResponse = parsed;
                } catch (e) {
                    // Ignore parse error on malformed chunk
                }
            }
        }

        return {
            id: finalResponse?.id || `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: finalResponse?.model || 'gpt-4o',
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
            usage: finalResponse?.usage || {
                prompt_tokens: 0,
                completion_tokens: Math.max(1, Math.ceil(aggregatedContent.length / 4)),
                total_tokens: Math.max(1, Math.ceil(aggregatedContent.length / 4))
            }
        };
    }
}

module.exports = OpenAIAdapter;
