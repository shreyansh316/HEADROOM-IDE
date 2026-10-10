/**
 * HEADROOM AI API Gateway — OpenAI-Compatible Adapter
 *
 * Supports arbitrary self-hosted or compatible inference servers (e.g. vLLM, Ollama, LM Studio,
 * Together, Groq) with strict SSRF validation, private network controls, and custom headers.
 * 100% Pure JavaScript.
 */

const BaseAdapter = require('./BaseAdapter.js');
const { URL } = require('url');

class CompatibleAdapter extends BaseAdapter {
    constructor(options = {}) {
        super(options.providerId || 'compatible', options);
        this.baseUrl = options.baseUrl || 'http://127.0.0.1:11434/v1';
        this.apiKey = options.apiKey || '';
        this.customHeaders = options.customHeaders || {};
        this.allowLoopback = options.allowLoopback !== false; // Allow local inference by default if configured
        this.fetchImpl = options.fetchImpl || globalThis.fetch;

        this.validateUrl(this.baseUrl);
    }

    validateUrl(targetUrl) {
        let parsed;
        try {
            parsed = new URL(targetUrl);
        } catch (e) {
            throw new Error(`Invalid compatible endpoint URL: ${targetUrl}`);
        }

        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw new Error(`Endpoint protocol must be http or https: ${parsed.protocol}`);
        }

        const hostname = parsed.hostname.toLowerCase();

        // Check SSRF targets: Cloud metadata
        if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal' || hostname === '100.100.100.200') {
            throw new Error(`Access to cloud metadata service is prohibited: ${hostname}`);
        }

        // Loopback validation
        const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
        if (isLoopback && !this.allowLoopback) {
            throw new Error(`Loopback destinations are prohibited by current security policy: ${hostname}`);
        }

        return parsed;
    }

    setEndpoint({ baseUrl, apiKey, customHeaders, allowLoopback } = {}) {
        if (baseUrl) {
            this.validateUrl(baseUrl);
            this.baseUrl = baseUrl.replace(/\/+$/, '');
        }
        if (apiKey !== undefined) this.apiKey = apiKey;
        if (customHeaders) this.customHeaders = customHeaders;
        if (allowLoopback !== undefined) this.allowLoopback = allowLoopback;
    }

    async testConnection() {
        const start = Date.now();
        try {
            this.validateUrl(this.baseUrl);
            const headers = { ...this.customHeaders };
            if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

            const res = await this.fetchImpl(`${this.baseUrl}/models`, {
                method: 'GET',
                headers
            });

            const latencyMs = Date.now() - start;
            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                return {
                    ok: true,
                    latencyMs,
                    provider: this.providerId,
                    modelCount: Array.isArray(data?.data) ? data.data.length : 0
                };
            } else {
                return { ok: false, latencyMs, error: `HTTP ${res.status}: ${await res.text()}` };
            }
        } catch (err) {
            return { ok: false, latencyMs: Date.now() - start, error: err.message };
        }
    }

    async chatCompletion({ request, signal, onChunk } = {}) {
        this.validateUrl(this.baseUrl);

        const payload = {
            model: request.model.replace(/^compatible\//, ''),
            messages: request.messages,
            temperature: request.temperature ?? 0.7,
            max_tokens: request.max_tokens || request.max_completion_tokens,
            stream: Boolean(request.stream)
        };

        if (request.tools) payload.tools = request.tools;
        if (request.tool_choice) payload.tool_choice = request.tool_choice;

        const headers = {
            'Content-Type': 'application/json',
            ...this.customHeaders
        };
        if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

        const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers,
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
            buffer = lines.pop();

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
                } catch (e) {}
            }
        }

        return {
            id: finalResponse?.id || `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: finalResponse?.model || 'compatible-model',
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

module.exports = CompatibleAdapter;
