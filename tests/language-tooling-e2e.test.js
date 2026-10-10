import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import LanguageSupportService from '../src/main/services/LanguageSupportService.js';
import DebuggerService from '../src/main/services/DebuggerService.js';

describe('Language Tooling, Diagnostics, Formatting & Debugging E2E', () => {
    let service;
    const testDir = path.join(process.cwd(), '.test-language-tooling');

    beforeEach(() => {
        service = new LanguageSupportService();
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
    });

    afterEach(() => {
        if (fs.existsSync(testDir)) {
            try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
        }
    });

    describe('1. 6-Tier Capability Matrix & Host Toolchain Discovery', () => {
        it('computes 6-tier capability matrix for all registered languages', () => {
            const matrix = service.getCapabilityMatrix();
            expect(matrix.length).toBeGreaterThanOrEqual(22);

            const js = matrix.find(m => m.id === 'javascript');
            expect(js).toBeDefined();
            expect(js.capabilities.syntax.status).toBe('supported');
            expect(js.capabilities.diagnostics.status).toBe('supported');
            expect(js.capabilities.formatting.status).toBe('supported');
            expect(js.capabilities.navigation.status).toBe('supported');
            expect(js.capabilities.execution.status).toBe('supported');
            expect(js.capabilities.debugging.status).toBe('supported');

            // Ground truth verification on host system: Node, Python, .NET, Java are installed
            expect(js.hasRuntime).toBe(true);
            const nodeTool = js.toolchainStatus.find(t => t.name === 'Node.js');
            expect(nodeTool.installed).toBe(true);
            expect(nodeTool.version).toContain('v24');

            const py = matrix.find(m => m.id === 'python');
            expect(py.hasRuntime).toBe(true);

            const dotnet = matrix.find(m => m.id === 'csharp');
            expect(dotnet.hasRuntime).toBe(true);

            const java = matrix.find(m => m.id === 'java');
            expect(java.hasRuntime).toBe(true);
        }, 15000);
    });

    describe('2. Real Diagnostics Engine', () => {
        it('returns zero diagnostics for clean JavaScript code', async () => {
            const code = 'const greeting = "Hello HEADROOM";\nfunction add(a, b) {\n    return a + b;\n}\n';
            const res = await service.getDiagnostics({ filePath: 'calc.js', content: code });
            expect(res.success).toBe(true);
            expect(res.diagnostics.length).toBe(0);
        });

        it('extracts exact line, column, and error message for JavaScript syntax errors', async () => {
            // Line 2 has an invalid syntax error: "const x = ;"
            const code = '// line 1\nconst x = ;\nconst y = 2;';
            const res = await service.getDiagnostics({ filePath: 'syntax_error.js', content: code });
            expect(res.success).toBe(true);
            expect(res.diagnostics.length).toBe(1);

            const diag = res.diagnostics[0];
            expect(diag.line).toBe(2);
            expect(diag.col).toBeGreaterThanOrEqual(10);
            expect(diag.severity).toBe('error');
            expect(diag.message).toContain('Unexpected token');
            expect(diag.source).toBe('HEADROOM JavaScript Parser');
        });

        it('returns zero diagnostics for valid JSON and catches invalid JSON with line and column', async () => {
            const valid = '{\n  "title": "HEADROOM IDE",\n  "version": "0.1.0"\n}';
            const resValid = await service.getDiagnostics({ filePath: 'package.json', content: valid });
            expect(resValid.diagnostics.length).toBe(0);

            // Invalid JSON: missing value on line 3
            const invalid = '{\n  "title": "HEADROOM IDE",\n  "bad": \n}';
            const resInvalid = await service.getDiagnostics({ filePath: 'bad.json', content: invalid });
            expect(resInvalid.diagnostics.length).toBe(1);
            const diag = resInvalid.diagnostics[0];
            expect(diag.line).toBe(3);
            expect(diag.severity).toBe('error');
            expect(diag.source).toBe('HEADROOM JSON Validator');
        });

        it('extracts syntax diagnostics from Python via host Python compiler', async () => {
            const badPy = 'def compute_total():\n    x = \n';
            const res = await service.getDiagnostics({ filePath: 'test.py', content: badPy });
            expect(res.success).toBe(true);
            expect(res.diagnostics.length).toBe(1);
            const diag = res.diagnostics[0];
            expect(diag.line).toBe(2);
            expect(diag.severity).toBe('error');
            expect(diag.source).toBe('Python 3 AST Compiler');
        });
    });

    describe('3. Safe Formatting Engine with Rollback Protection', () => {
        it('formats JSON with consistent indentation', async () => {
            const unformatted = '{"a":1,   "b": [2, 3],  "c": "text"}';
            const res = await service.formatDocument({ filePath: 'data.json', content: unformatted });
            expect(res.success).toBe(true);
            expect(res.formatted).toContain('{\n  "a": 1,');
        });

        it('refuses to format malformed JSON and preserves original content (safe rollback)', async () => {
            const badJson = '{"broken": }';
            const res = await service.formatDocument({ filePath: 'data.json', content: badJson });
            expect(res.success).toBe(false);
            expect(res.formatted).toBeNull();
            expect(res.error).toContain('Cannot format malformed JSON');
        });

        it('formats JavaScript and ensures AST verification', async () => {
            const unformatted = 'function test(){\nconst a = 1;\nif(a){\nreturn a;\n}\n}';
            const res = await service.formatDocument({ filePath: 'test.js', content: unformatted });
            expect(res.success).toBe(true);
            expect(res.formatted).toContain('function test()');
            expect(res.formatted).toContain('    const a = 1;');
        });

        it('refuses to format broken JavaScript with syntax errors (rollback protection)', async () => {
            const brokenJs = 'function test( {\nconst a = ;';
            const res = await service.formatDocument({ filePath: 'broken.js', content: brokenJs });
            expect(res.success).toBe(false);
            expect(res.formatted).toBeNull();
            expect(res.error).toContain('Cannot format JavaScript with syntax errors');
        });
    });

    describe('4. Real Runtime Execution Engine', () => {
        it('executes a Node.js script, streams output, and reports success with duration', async () => {
            const scriptPath = path.join(testDir, 'runner_test.js');
            fs.writeFileSync(scriptPath, 'console.log("HEADROOM_OUTPUT_VERIFIED");\nprocess.exit(0);\n', 'utf8');

            const chunks = [];
            const result = await service.runFile({ filePath: scriptPath, cwd: testDir }, chunk => chunks.push(chunk));

            expect(result.success).toBe(true);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain('HEADROOM_OUTPUT_VERIFIED');
            expect(result.durationMs).toBeGreaterThan(0);
            expect(chunks.some(c => c.includes('HEADROOM_OUTPUT_VERIFIED'))).toBe(true);
        });

        it('captures nonzero exit codes and stderr on execution failure', async () => {
            const scriptPath = path.join(testDir, 'fail_test.js');
            fs.writeFileSync(scriptPath, 'console.error("HEADROOM_FATAL_ERROR");\nprocess.exit(42);\n', 'utf8');

            const result = await service.runFile({ filePath: scriptPath, cwd: testDir });
            expect(result.success).toBe(false);
            expect(result.exitCode).toBe(42);
            expect(result.stderr).toContain('HEADROOM_FATAL_ERROR');
        });

        it('rejects execution for non-configured or missing toolchains with actionable guidance', async () => {
            const scriptPath = path.join(testDir, 'game.xyz');
            fs.writeFileSync(scriptPath, '// Unknown code', 'utf8');

            const result = await service.runFile({ filePath: scriptPath });
            expect(result.success).toBe(false);
            expect(result.error).toContain('is not currently configured or toolchain is missing');
        });
    });

    describe('5. Real Debugger Lifecycle (Node.js V8 Inspector Protocol)', () => {
        it('launches a debug session paused at entry, inspects call stack, steps, and stops', async () => {
            const debugFile = path.join(testDir, 'debuggee.js');
            // Multi-line script to test stepping and variable inspection
            fs.writeFileSync(debugFile, `
let counter = 10;
counter += 5;
console.log('counter is', counter);
`, 'utf8');

            const dbg = new DebuggerService();
            const launchRes = await dbg.startSession({
                filePath: debugFile,
                cwd: testDir
            });

            expect(launchRes.success).toBe(true);
            expect(launchRes.sessionId).toBeDefined();
            expect(launchRes.wsUrl).toContain('ws://127.0.0.1:');
            expect(launchRes.state).toBe('paused');

            const sessionId = launchRes.sessionId;

            // Wait a moment for paused event to populate callFrames
            await new Promise(r => setTimeout(r, 400));
            const session = dbg.getSession(sessionId);
            expect(session.callFrames.length).toBeGreaterThan(0);

            const topFrame = session.callFrames[0];
            expect(topFrame.functionName).toBeDefined();

            // Set breakpoint on line 3
            const bpRes = await dbg.setBreakpoint(sessionId, debugFile, 3);
            expect(bpRes.success).toBe(true);
            expect(bpRes.breakpointId).toBeDefined();

            // Step over first line
            await dbg.stepOver(sessionId);
            await new Promise(r => setTimeout(r, 300));

            // Query variables
            const vars = await dbg.getVariables(sessionId);
            expect(Array.isArray(vars)).toBe(true);

            // Cleanly stop debug session
            const stopRes = await dbg.stopSession(sessionId);
            expect(stopRes.success).toBe(true);
            expect(dbg.getSession(sessionId)).toBeNull();
        });

        it('rejects debugging for languages without a configured debug adapter', async () => {
            const dbg = new DebuggerService();
            const res = await dbg.startSession({ filePath: 'script.py' });
            expect(res.success).toBe(false);
            expect(res.error).toContain('requires a dedicated Debug Adapter Protocol');
        });
    });
});
