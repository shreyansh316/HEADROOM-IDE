/**
 * HEADROOM AI API Gateway — Google Gemini Adapter
 *
 * Implements Gemini REST API (generateContent & streamGenerateContent)
 * with translation to OpenAI-compatible format. 100% Pure JavaScript.
 */

const BaseAdapter = require('./BaseAdapter.js');

class GeminiAdapter extends BaseAdapter {
    constructor(options = {}) {
        super('gemini', options);
        this.baseUrl = options.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/models';
        this.apiKey = options.apiKey || null;
        this.fetchImpl = options.fetchImpl || globalThis.fetch;
    }

    setApiKey(key) {
        this.apiKey = key;
    }

    async testConnection() {
        if (!this.apiKey) {
            return { ok: false, latencyMs: 0, error: 'Gemini API key is missing' };
        }

        const start = Date.now();
        try {
            const res = await this.fetchImpl(`${this.baseUrl}/gemini-1.5-flash:countTokens?key=${this.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: 'ping' }] }]
                })
            });

            const latencyMs = Date.now() - start;
            if (res.ok) {
                return { ok: true, latencyMs, provider: 'gemini' };
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
            throw this.normalizeError(new Error('Gemini API key is not configured.'));
        }

        const model = request.model.replace(/^gemini\//, '');
        const contents = [];
        let systemInstruction = null;

        for (const msg of request.messages || []) {
            if (msg.role === 'system') {
                systemInstruction = { parts: [{ text: msg.content }] };
            } else {
                contents.push({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }]
                });
            }
        }

        const generationConfig = {
            temperature: request.temperature ?? 0.7,
            maxOutputTokens: request.max_tokens || 8192
        };

        const payload = {
            contents,
            generationConfig
        };
        if (systemInstruction) payload.systemInstruction = systemInstruction;

        const endpointMethod = request.stream ? 'streamGenerateContent?alt=sse&key=' : 'generateContent?key=';
        const url = `${this.baseUrl}/${encodeURIComponent(model)}:${endpointMethod}${this.apiKey}`;

        const res = await this.fetchImpl(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
            return this.normalizeGeminiResponse(raw, model);
        }
    }

    normalizeGeminiResponse(raw, model) {
        const candidate = raw.candidates && raw.candidates[0];
        let text = '';
        if (candidate?.content?.parts) {
            text = candidate.content.parts.map(p => p.text || '').join('');
        }

        const promptTokens = raw.usageMetadata?.promptTokenCount || 0;
        const completionTokens = raw.usageMetadata?.candidatesTokenCount || 0;

        return {
            id: `gemini-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: model,
            choices: [
                {
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: text
                    },
                    finish_reason: candidate?.finishReason === 'STOP' ? 'stop' : (candidate?.finishReason || 'stop')
                }
            ],
            usage: {
                prompt_tokens: promptTokens,
                completion_tokens: completionTokens,
                total_tokens: promptTokens + completionTokens
            }
        };
    }

    async handleStream(res, onChunk, model) {
        const reader = res.body.getReader ? res.body.getReader() : null;
        let aggregatedText = '';
        let promptTokens = 0;
        let completionTokens = 0;

        if (!reader) {
            const body = await res.text();
            return this.normalizeGeminiResponse(JSON.parse(body), model);
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
                    const piece = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    if (piece) {
                        aggregatedText += piece;
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
                    if (parsed.usageMetadata) {
                        promptTokens = parsed.usageMetadata.promptTokenCount || promptTokens;
                        completionTokens = parsed.usageMetadata.candidatesTokenCount || completionTokens;
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
                        content: aggregatedText
                    },
                    finish_reason: 'stop'
                }
            ],
            usage: {
                prompt_tokens: promptTokens,
                completion_tokens: completionTokens || Math.max(1, Math.ceil(aggregatedText.length / 4)),
                total_tokens: promptTokens + (completionTokens || Math.max(1, Math.ceil(aggregatedText.length / 4)))
            }
        };
    }
}

module.exports = GeminiAdapter;
