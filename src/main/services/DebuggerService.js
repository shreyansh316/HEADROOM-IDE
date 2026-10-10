const { spawn } = require('child_process');
const path = require('path');
const EventEmitter = require('events');

/**
 * HEADROOM IDE — Real Debugger Service
 *
 * Implements genuine V8 Inspector Protocol debugging for Node.js
 * and provides DAP (Debug Adapter Protocol) boundary for external debuggers.
 * 100% Pure JavaScript. No TypeScript. No simulated or fake data.
 */
class DebuggerService extends EventEmitter {
    constructor() {
        super();
        this.activeSessions = new Map(); // sessionId -> sessionData
        this.sessionCounter = 0;
    }

    /**
     * Start a real debug session for a file
     */
    async startSession(options = {}) {
        const { filePath, cwd = process.cwd(), args = [], stopOnEntry = true } = options;

        if (!filePath) {
            throw new Error('Debug target filePath is required');
        }

        const ext = path.extname(filePath).toLowerCase();
        const isNode = ['.js', '.mjs', '.cjs'].includes(ext);

        if (!isNode) {
            return {
                success: false,
                error: `Debugging for "${ext}" requires a dedicated Debug Adapter Protocol (DAP) agent. Currently Node.js V8 Inspector debugging is active.`
            };
        }

        const sessionId = `debug-session-${Date.now()}-${++this.sessionCounter}`;
        const session = {
            id: sessionId,
            filePath,
            cwd,
            state: 'starting', // starting, paused, running, terminated
            childProcess: null,
            ws: null,
            wsUrl: null,
            messageId: 0,
            pendingRequests: new Map(), // reqId -> { resolve, reject }
            breakpoints: new Map(), // id -> { file, line }
            callFrames: [],
            stopOnEntry,
            startTime: Date.now()
        };

        this.activeSessions.set(sessionId, session);

        try {
            // Spawn node with --inspect-brk=0 to allocate a random free debug port
            const nodeArgs = ['--inspect-brk=0', filePath, ...args];
            const child = spawn('node', nodeArgs, {
                cwd,
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true
            });

            session.childProcess = child;

            // Capture output and extract ws:// URI from stderr
            const wsUrl = await new Promise((resolve, reject) => {
                let resolved = false;
                const timeoutId = setTimeout(() => {
                    if (!resolved) {
                        child.kill();
                        reject(new Error('Timeout waiting for Node.js debugger listener on stderr'));
                    }
                }, 10000);

                let stderrAccum = '';
                child.stderr.on('data', (chunk) => {
                    const text = chunk.toString();
                    stderrAccum += text;
                    this.emit('output', { sessionId, type: 'stderr', text });

                    const match = text.match(/ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+/i);
                    if (match && !resolved) {
                        resolved = true;
                        clearTimeout(timeoutId);
                        resolve(match[0]);
                    }
                });

                child.stdout.on('data', (chunk) => {
                    this.emit('output', { sessionId, type: 'stdout', text: chunk.toString() });
                });

                child.on('error', (err) => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeoutId);
                        reject(err);
                    }
                });

                child.on('exit', (code, signal) => {
                    session.state = 'terminated';
                    this.emit('terminated', { sessionId, code, signal });
                    this.activeSessions.delete(sessionId);
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeoutId);
                        reject(new Error(`Debugger process exited prematurely with code ${code}`));
                    }
                });
            });

            session.wsUrl = wsUrl;

            // Connect using Node 24 native WebSocket
            const ws = new WebSocket(wsUrl);
            session.ws = ws;

            await new Promise((resolve, reject) => {
                ws.onopen = () => resolve();
                ws.onerror = (err) => reject(new Error(`WebSocket connection failed: ${err.message || 'unknown error'}`));
            });

            ws.onmessage = (event) => {
                this.handleV8Message(session, JSON.parse(event.data));
            };

            ws.onclose = () => {
                session.state = 'terminated';
                this.emit('terminated', { sessionId, code: 0 });
                this.activeSessions.delete(sessionId);
            };

            // Initialize V8 Inspector
            await this.sendV8Command(session, 'Debugger.enable');
            await this.sendV8Command(session, 'Runtime.enable');
            await this.sendV8Command(session, 'Runtime.runIfWaitingForDebugger');

            // Wait for initial Debugger.paused event (with timeout)
            await new Promise((resolve) => {
                if (session.callFrames && session.callFrames.length > 0) {
                    return resolve();
                }
                const onPaused = () => {
                    this.removeListener('paused', onPaused);
                    resolve();
                };
                this.once('paused', onPaused);
                setTimeout(() => {
                    this.removeListener('paused', onPaused);
                    resolve();
                }, 1500);
            });

            session.state = 'paused';

            return {
                success: true,
                sessionId,
                wsUrl,
                state: session.state,
                target: filePath,
                runtime: 'Node.js V8 Inspector Protocol'
            };
        } catch (err) {
            this.stopSession(sessionId);
            return {
                success: false,
                error: `Failed to launch debug session: ${err.message}`
            };
        }
    }

    sendV8Command(session, method, params = {}) {
        return new Promise((resolve, reject) => {
            if (!session.ws || session.ws.readyState !== 1) {
                return reject(new Error('WebSocket is not open'));
            }
            const id = ++session.messageId;
            session.pendingRequests.set(id, { resolve, reject });
            session.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    handleV8Message(session, data) {
        if (data.id && session.pendingRequests.has(data.id)) {
            const { resolve, reject } = session.pendingRequests.get(data.id);
            session.pendingRequests.delete(data.id);
            if (data.error) {
                reject(new Error(data.error.message));
            } else {
                resolve(data.result);
            }
            return;
        }

        if (data.method === 'Debugger.paused') {
            session.state = 'paused';
            session.callFrames = (data.params.callFrames || []).map(frame => ({
                id: frame.callFrameId,
                functionName: frame.functionName || '(anonymous)',
                location: {
                    scriptId: frame.location.scriptId,
                    line: frame.location.lineNumber + 1, // convert 0-indexed to 1-indexed
                    column: frame.location.columnNumber + 1
                },
                url: frame.url,
                scopeChain: frame.scopeChain
            }));

            this.emit('paused', {
                sessionId: session.id,
                reason: data.params.reason,
                callFrames: session.callFrames,
                topFrame: session.callFrames[0] || null
            });
        } else if (data.method === 'Debugger.resumed') {
            session.state = 'running';
            session.callFrames = [];
            this.emit('resumed', { sessionId: session.id });
        } else if (data.method === 'Runtime.consoleAPICalled') {
            const args = (data.params.args || []).map(a => a.value ?? a.description ?? '').join(' ');
            this.emit('output', {
                sessionId: session.id,
                type: 'console',
                text: args + '\n'
            });
        }
    }

    /**
     * Resume execution (Continue)
     */
    async continue(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session) throw new Error(`Unknown session: ${sessionId}`);
        await this.sendV8Command(session, 'Debugger.resume');
        return { success: true };
    }

    /**
     * Step Over
     */
    async stepOver(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session) throw new Error(`Unknown session: ${sessionId}`);
        await this.sendV8Command(session, 'Debugger.stepOver');
        return { success: true };
    }

    /**
     * Step Into
     */
    async stepInto(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session) throw new Error(`Unknown session: ${sessionId}`);
        await this.sendV8Command(session, 'Debugger.stepInto');
        return { success: true };
    }

    /**
     * Step Out
     */
    async stepOut(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session) throw new Error(`Unknown session: ${sessionId}`);
        await this.sendV8Command(session, 'Debugger.stepOut');
        return { success: true };
    }

    /**
     * Pause execution
     */
    async pause(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session) throw new Error(`Unknown session: ${sessionId}`);
        await this.sendV8Command(session, 'Debugger.pause');
        return { success: true };
    }

    /**
     * Set breakpoint at a specific line
     */
    async setBreakpoint(sessionId, urlRegexOrPath, line) {
        const session = this.activeSessions.get(sessionId);
        if (!session) throw new Error(`Unknown session: ${sessionId}`);

        // V8 lineNumber is 0-indexed
        const lineNumber = Math.max(0, parseInt(line, 10) - 1);
        const result = await this.sendV8Command(session, 'Debugger.setBreakpointByUrl', {
            lineNumber,
            url: urlRegexOrPath.replace(/\\/g, '/')
        });

        const bpId = result.breakpointId;
        session.breakpoints.set(bpId, { path: urlRegexOrPath, line });

        return {
            success: true,
            breakpointId: bpId,
            locations: result.locations
        };
    }

    /**
     * Inspect Scope Variables for the top or specified call frame
     */
    async getVariables(sessionId, callFrameId = null) {
        const session = this.activeSessions.get(sessionId);
        if (!session) throw new Error(`Unknown session: ${sessionId}`);
        if (session.callFrames.length === 0) return [];

        const targetFrame = callFrameId
            ? session.callFrames.find(f => f.id === callFrameId)
            : session.callFrames[0];

        if (!targetFrame) return [];

        const variables = [];
        const localScope = (targetFrame.scopeChain || []).find(s => s.type === 'local' || s.type === 'block');

        if (localScope && localScope.object && localScope.object.objectId) {
            try {
                const res = await this.sendV8Command(session, 'Runtime.getProperties', {
                    objectId: localScope.object.objectId,
                    ownProperties: true
                });

                for (const prop of (res.result || [])) {
                    if (prop.name === 'this') continue;
                    variables.push({
                        name: prop.name,
                        value: prop.value ? (prop.value.value ?? prop.value.description ?? 'undefined') : 'undefined',
                        type: prop.value ? prop.value.type : 'unknown'
                    });
                }
            } catch {
                // Ignore property query errors
            }
        }

        return variables;
    }

    /**
     * Evaluate Expression on Call Frame
     */
    async evaluate(sessionId, expression, callFrameId = null) {
        const session = this.activeSessions.get(sessionId);
        if (!session) throw new Error(`Unknown session: ${sessionId}`);

        const frameId = callFrameId || session.callFrames[0]?.id;
        if (!frameId) {
            return { success: false, error: 'Cannot evaluate: debugger is not paused on a call frame' };
        }

        try {
            const res = await this.sendV8Command(session, 'Debugger.evaluateOnCallFrame', {
                callFrameId: frameId,
                expression
            });

            const val = res.result ? (res.result.value ?? res.result.description ?? 'undefined') : 'undefined';
            return {
                success: true,
                result: val,
                type: res.result?.type || 'unknown'
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Stop and terminate debug session
     */
    async stopSession(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session) return { success: true };

        try {
            if (session.ws && session.ws.readyState === 1) {
                try { await this.sendV8Command(session, 'Debugger.disable'); } catch {}
                session.ws.close();
            }
        } catch {}

        if (session.childProcess && !session.childProcess.killed) {
            try { session.childProcess.kill('SIGKILL'); } catch {}
        }

        session.state = 'terminated';
        this.activeSessions.delete(sessionId);
        this.emit('terminated', { sessionId });
        return { success: true };
    }

    getSession(sessionId) {
        return this.activeSessions.get(sessionId) || null;
    }

    getActiveSessions() {
        return Array.from(this.activeSessions.values()).map(s => ({
            id: s.id,
            filePath: s.filePath,
            state: s.state,
            startTime: s.startTime
        }));
    }
}

module.exports = DebuggerService;
