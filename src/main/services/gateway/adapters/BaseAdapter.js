/**
 * HEADROOM AI API Gateway — Base Provider Adapter
 *
 * Defines the unified contract for vendor-neutral AI model adapters.
 * 100% Pure JavaScript.
 */

class BaseAdapter {
    constructor(providerId, options = {}) {
        this.providerId = providerId;
        this.options = options;
    }

    /**
     * Send chat completion request (streaming or non-streaming).
     * @param {Object} params
     * @param {Object} params.request - Standard OpenAI-compatible chat completion payload
     * @param {AbortSignal} [params.signal] - Abort controller signal
     * @param {Function} [params.onChunk] - Stream callback: (chunk) => void
     * @returns {Promise<Object>} Normalized completion response
     */
    async chatCompletion({ request, signal, onChunk } = {}) {
        throw new Error(`chatCompletion not implemented for provider ${this.providerId}`);
    }

    /**
     * Execute live connectivity test without consuming user credits.
     * @returns {Promise<{ ok: boolean, latencyMs: number, error?: string }>}
     */
    async testConnection() {
        throw new Error(`testConnection not implemented for provider ${this.providerId}`);
    }

    /**
     * Normalize token usage into standard format.
     */
    normalizeUsage(rawUsage) {
        return {
            inputTokens: Number.isSafeInteger(rawUsage?.inputTokens) ? rawUsage.inputTokens : (rawUsage?.prompt_tokens || 0),
            outputTokens: Number.isSafeInteger(rawUsage?.outputTokens) ? rawUsage.outputTokens : (rawUsage?.completion_tokens || 0),
            reasoningTokens: Number.isSafeInteger(rawUsage?.reasoning_tokens) ? rawUsage.reasoning_tokens : 0,
            cachedTokens: Number.isSafeInteger(rawUsage?.cached_tokens) ? rawUsage.cached_tokens : 0
        };
    }

    /**
     * Map vendor errors into canonical gateway error codes.
     */
    normalizeError(err) {
        if (!err) return { code: 'unknown-error', message: 'Unknown provider error', retryable: false };

        const message = err.message || String(err);
        const status = err.status || err.statusCode;

        if (status === 401 || message.includes('auth') || message.includes('API key') || message.includes('unauthorized')) {
            return { code: 'provider-auth-failed', message, status: 401, retryable: false };
        }
        if (status === 429 || message.includes('rate limit') || message.includes('quota') || message.includes('RESOURCE_EXHAUSTED')) {
            return { code: 'provider-rate-limited', message, status: 429, retryable: true };
        }
        if (status >= 500 || message.includes('server error') || message.includes('overloaded')) {
            return { code: 'provider-unavailable', message, status: status || 503, retryable: true };
        }
        if (err.name === 'AbortError' || message.includes('aborted') || message.includes('cancelled')) {
            return { code: 'request-cancelled', message, retryable: false };
        }
        if (message.includes('timeout') || message.includes('ETIMEDOUT') || message.includes('ECONNRESET')) {
            return { code: 'provider-timeout', message, retryable: true };
        }
        if (status === 400 || message.includes('bad request') || message.includes('invalid argument')) {
            return { code: 'provider-bad-request', message, status: 400, retryable: false };
        }

        return { code: 'provider-request-failed', message, status: status || 500, retryable: false };
    }
}

module.exports = BaseAdapter;
