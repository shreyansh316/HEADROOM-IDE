import { describe, it, expect } from 'vitest';
const TokenEfficiencyEngine = require('../src/main/services/gateway/TokenEfficiencyEngine.js');
const GatewayService = require('../src/main/services/gateway/GatewayService.js');

describe('Token Efficiency Engine & Intelligence (PHASE-11: HR-071 through HR-077)', () => {
    it('HR-071: prunes long conversations while preserving system prompt and active user turn', () => {
        const engine = new TokenEfficiencyEngine();
        const messages = [
            { role: 'system', content: 'You are the HEADROOM principal software architect.' },
            { role: 'user', content: 'Here is massive background context: ' + 'A'.repeat(800) },
            { role: 'assistant', content: 'Understood. Waiting for instructions.' },
            { role: 'user', content: 'Secondary background: ' + 'B'.repeat(800) },
            { role: 'assistant', content: 'Logged secondary background.' },
            { role: 'user', content: 'Please compile the test suite now.' }
        ];

        // Total tokens is > 500. Restrict limit to ~120 tokens.
        const pruned = engine.pruneContext(messages, 120);

        expect(pruned.length).toBeLessThan(messages.length);
        expect(pruned[0].role).toBe('system');
        expect(pruned[pruned.length - 1].content).toBe('Please compile the test suite now.');
    });

    it('HR-072: windows large file contents with surrounding radius markers', () => {
        const engine = new TokenEfficiencyEngine();
        const lines = Array.from({ length: 200 }, (_, i) => `const line_${i + 1} = ${i + 1};`);
        const fileContent = lines.join('\n');

        const windowed = engine.windowFileContent(fileContent, { startLine: 100, endLine: 105, radius: 10 });
        expect(windowed).toContain('truncated 89 earlier lines');
        expect(windowed).toContain('const line_100 = 100;');
        expect(windowed).toContain('const line_105 = 105;');
        expect(windowed).toContain('truncated 85 subsequent lines');
    });

    it('HR-073: deduplicates identical content chunks and substitutes pointer markers', () => {
        const engine = new TokenEfficiencyEngine();
        const repetitiveBlob = 'CRITICAL CODE DEF: export function runDeterministicWorkforce() { return 42; } // Repeated log entry';
        const messages = [
            { role: 'system', content: 'System initialized.' },
            { role: 'user', content: repetitiveBlob },
            { role: 'assistant', content: 'Processed.' },
            { role: 'user', content: repetitiveBlob } // Duplicate
        ];

        const deduplicated = engine.deduplicateMessages(messages);
        expect(deduplicated.length).toBe(4);
        expect(deduplicated[1].content).toBe(repetitiveBlob);
        expect(deduplicated[3].content).toContain('[Reference: duplicate content identical to earlier message hash #');
    });

    it('HR-074: serializes structured agent handoffs into dense state objects', () => {
        const engine = new TokenEfficiencyEngine();
        const handoff = engine.compressHandoff({
            taskId: 'task-build-ast',
            missionId: 'mission-engine-upgrade',
            objectives: ['Parse JS AST', 'Validate zero TypeScript'],
            decisions: ['Use Acorn and VM for Node 24'],
            openFiles: ['src/main/services/LanguageSupportService.js'],
            artifacts: ['build_report.md']
        });

        expect(handoff.protocol).toBe('HEADROOM_HANDOFF_v1');
        expect(handoff.taskId).toBe('task-build-ast');
        expect(handoff.context.objectives).toContain('Parse JS AST');
        expect(handoff.context.openFiles).toContain('src/main/services/LanguageSupportService.js');
    });

    it('HR-075: applies provider prompt caching markers for static prefixes', () => {
        const engine = new TokenEfficiencyEngine();
        const largeStaticContent = 'Static system instructions: ' + 'X'.repeat(4500); // > 1024 tokens
        const messages = [
            { role: 'system', content: largeStaticContent },
            { role: 'user', content: 'What is the current build state?' }
        ];

        const alignedAnthropic = engine.alignCacheBoundaries(messages, 'anthropic');
        expect(alignedAnthropic[0].cache_control).toBeDefined();
        expect(alignedAnthropic[0].cache_control.type).toBe('ephemeral');

        const alignedOpenAI = engine.alignCacheBoundaries(messages, 'openai');
        expect(alignedOpenAI[0].cache_control).toBeUndefined();
    });

    it('HR-076 & HR-077: integrates directly with GatewayService token intelligence methods', () => {
        const gateway = new GatewayService();
        expect(typeof gateway.pruneContext).toBe('function');
        expect(typeof gateway.deduplicateContext).toBe('function');
        expect(typeof gateway.compressHandoff).toBe('function');
        expect(typeof gateway.estimateTokens).toBe('function');

        const tokens = gateway.estimateTokens('function helloWorld() { return true; }');
        expect(tokens).toBeGreaterThan(0);
    });
});
