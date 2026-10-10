/**
 * HEADROOM AI API Gateway — Resilience, Retries & Fallback Engine
 *
 * Implements bounded exponential backoff with jitter for transient errors,
 * non-retryable error short-circuiting, and cascading fallback.
 * 100% Pure JavaScript.
 */

class GatewayResilience {
    constructor({ maxRetries = 2, baseDelayMs = 500, maxDelayMs = 4000 } = {}) {
        this.maxRetries = maxRetries;
        this.baseDelayMs = baseDelayMs;
        this.maxDelayMs = maxDelayMs;
    }

    /**
     * Execute an action with bounded retries and exponential backoff.
     */
    async executeWithRetry(action, { signal, onRetry } = {}) {
        let attempt = 0;
        let lastError = null;

        while (attempt <= this.maxRetries) {
            if (signal?.aborted) {
                const abortErr = new Error('Request aborted by caller.');
                abortErr.code = 'request-cancelled';
                throw abortErr;
            }

            try {
                return await action(attempt);
            } catch (err) {
                lastError = err;
                attempt++;

                // Check retryability
                if (!err.retryable && err.status !== 429 && err.status < 500 && err.code !== 'provider-timeout') {
                    throw err; // Non-retryable (e.g. 401, 400)
                }

                if (attempt > this.maxRetries) {
                    break;
                }

                // Compute delay with exponential backoff + full jitter
                const jitter = Math.random();
                const delay = Math.min(this.maxDelayMs, (this.baseDelayMs * Math.pow(2, attempt - 1)) * (0.5 + 0.5 * jitter));

                if (typeof onRetry === 'function') {
                    onRetry({ attempt, error: err, delayMs: Math.round(delay) });
                }

                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw lastError;
    }

    /**
     * Execute across primary model and cascade to fallback candidates if primary fails.
     */
    async executeWithFallback({ primaryModel, fallbackModels = [], executeFn, signal, onFallback, onRetry } = {}) {
        const chain = [primaryModel, ...fallbackModels];
        let lastError = null;

        for (let i = 0; i < chain.length; i++) {
            const currentModel = chain[i];
            const isFallback = i > 0;

            if (signal?.aborted) {
                throw new Error('Operation cancelled.');
            }

            if (isFallback && typeof onFallback === 'function') {
                onFallback({
                    primaryModel: primaryModel.id,
                    fallbackModel: currentModel.id,
                    previousError: lastError
                });
            }

            try {
                const response = await this.executeWithRetry(
                    (attempt) => executeFn(currentModel, attempt),
                    { signal, onRetry }
                );

                return {
                    ...response,
                    routingMeta: {
                        modelUsed: currentModel.id,
                        fellBack: isFallback,
                        attemptsChain: i + 1
                    }
                };
            } catch (err) {
                lastError = err;
                // If caller cancelled or budget exceeded, do not cascade
                if (err.code === 'request-cancelled' || err.code === 'budget-exceeded') {
                    throw err;
                }
            }
        }

        throw lastError;
    }
}

module.exports = GatewayResilience;
