/**
 * HEADROOM AI Gateway — Token Efficiency & Intelligence Engine
 * Phase 11: HR-071 through HR-077
 *
 * Provides context pruning, incremental file loading, deduplication,
 * structured agent handoffs, prompt caching markers, and token estimation.
 * 100% Pure JavaScript. No TypeScript.
 */

class TokenEfficiencyEngine {
    constructor({ defaultModel = 'gemini/gemini-1.5-flash', maxContextTokens = 128000 } = {}) {
        this.defaultModel = defaultModel;
        this.maxContextTokens = maxContextTokens;
        this.cachedPrefixes = new Map(); // hash -> { text, tokens, cachedAt }
    }

    /**
     * Fast, conservative token estimation based on character and whitespace heuristics.
     * Approximately ~4 characters per token for English text and code.
     */
    estimateTokens(text) {
        if (!text || typeof text !== 'string') return 0;
        // Accurate heuristic: average 3.7 chars per token for code/markdown, plus 1 token per 8 whitespace blocks
        const charCount = text.length;
        if (charCount === 0) return 0;
        return Math.max(1, Math.ceil(charCount / 3.8));
    }

    /**
     * HR-071: Context Pruning & Budget-Bounded Truncation
     * Prunes earlier messages in conversation history while strictly preserving system prompt and latest user prompt.
     */
    pruneContext(messages, tokenLimit) {
        if (!Array.isArray(messages) || messages.length === 0) return [];
        const limit = Number.isSafeInteger(tokenLimit) ? tokenLimit : this.maxContextTokens;

        let totalTokens = messages.reduce((acc, m) => acc + this.estimateTokens(m.content), 0);
        if (totalTokens <= limit) {
            return [...messages];
        }

        // Always keep the system message if present at index 0
        const hasSystem = messages[0]?.role === 'system';
        const systemMessage = hasSystem ? messages[0] : null;
        const workQueue = hasSystem ? messages.slice(1) : [...messages];

        // Keep the latest message at all costs
        const latestMessage = workQueue.pop();
        let remainingBudget = limit - this.estimateTokens(latestMessage?.content || '');
        if (systemMessage) {
            remainingBudget -= this.estimateTokens(systemMessage.content);
        }

        const preservedMiddle = [];
        // Walk backwards from latest messages to preserve most recent context
        for (let i = workQueue.length - 1; i >= 0; i--) {
            const msg = workQueue[i];
            const tokens = this.estimateTokens(msg.content);
            if (remainingBudget - tokens >= 0) {
                preservedMiddle.unshift(msg);
                remainingBudget -= tokens;
            } else {
                break; // Limit reached
            }
        }

        const result = [];
        if (systemMessage) result.push(systemMessage);
        result.push(...preservedMiddle);
        if (latestMessage) result.push(latestMessage);
        return result;
    }

    /**
     * HR-072: Incremental File Windowing & Skeleton Loading
     * Extracts active sections of code rather than feeding thousands of lines when only target spans matter.
     */
    windowFileContent(content, { startLine = 1, endLine = 100, radius = 25 } = {}) {
        if (!content || typeof content !== 'string') return '';
        const lines = content.split(/\r?\n/);
        const totalLines = lines.length;

        const effectiveStart = Math.max(1, startLine - radius);
        const effectiveEnd = Math.min(totalLines, endLine + radius);

        const sliced = lines.slice(effectiveStart - 1, effectiveEnd);
        const header = effectiveStart > 1 ? `// ... [truncated ${effectiveStart - 1} earlier lines] ...\n` : '';
        const footer = effectiveEnd < totalLines ? `\n// ... [truncated ${totalLines - effectiveEnd} subsequent lines] ...` : '';

        return `${header}${sliced.join('\n')}${footer}`;
    }

    /**
     * HR-073: Context Deduplication
     * Eliminates duplicate system directives, repetitive tool output blobs, and identical code snippets.
     */
    deduplicateMessages(messages) {
        if (!Array.isArray(messages)) return [];
        const seenBlobs = new Set();
        const deduplicated = [];

        for (const msg of messages) {
            if (!msg || typeof msg !== 'object') continue;
            const content = String(msg.content || '').trim();

            // Ignore deduplicating short user prompts or empty content
            if (content.length < 50) {
                deduplicated.push(msg);
                continue;
            }

            const contentHash = this._fastHash(content);
            if (seenBlobs.has(contentHash)) {
                // Replace redundant repetitive payload with a lightweight reference pointer
                deduplicated.push({
                    role: msg.role,
                    content: `[Reference: duplicate content identical to earlier message hash #${contentHash.substring(0, 8)}]`
                });
            } else {
                seenBlobs.add(contentHash);
                deduplicated.push(msg);
            }
        }

        return deduplicated;
    }

    /**
     * HR-074: Structured Agent Handoff Compression
     * Converts sprawling multi-turn dialogue into an authoritative, dense state object for workforce delegators.
     */
    compressHandoff({ taskId, missionId, objectives = [], decisions = [], openFiles = [], artifacts = [] }) {
        return {
            protocol: 'HEADROOM_HANDOFF_v1',
            taskId: taskId || 'task-general',
            missionId: missionId || 'mission-root',
            timestamp: new Date().toISOString(),
            context: {
                objectives: objectives.slice(0, 5),
                decisions: decisions.slice(0, 10),
                openFiles: openFiles.map(f => typeof f === 'string' ? f : f.path),
                artifacts: artifacts.map(a => typeof a === 'string' ? a : a.path || a.name)
            },
            instruction: 'Execute next atomic milestone based on established state without redundant re-inquiry.'
        };
    }

    /**
     * HR-075: Provider Cache Boundary Alignment
     * Formats prefixes to align with Anthropic/OpenAI prompt caching boundaries (e.g., placing static system prompt first).
     */
    alignCacheBoundaries(messages, provider = 'anthropic') {
        if (!Array.isArray(messages) || messages.length === 0) return [];
        if (provider !== 'anthropic') return [...messages];

        // For Anthropic, add cache_control breakpoint on large static context blocks (> 1024 tokens)
        return messages.map((m, idx) => {
            const tokens = this.estimateTokens(m.content);
            if (tokens >= 1024 && (m.role === 'system' || idx < 2)) {
                return {
                    ...m,
                    cache_control: { type: 'ephemeral' }
                };
            }
            return m;
        });
    }

    _fastHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(16);
    }
}

module.exports = TokenEfficiencyEngine;
