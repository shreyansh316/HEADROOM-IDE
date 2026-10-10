const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

class TerminalService {
    constructor() {
        this.sessions = new Map();
        this.sessionCounter = 0;
    }

    createSession(cwd = process.cwd(), onData = () => {}, onExit = () => {}) {
        const id = `term-${++this.sessionCounter}`;
        const isWindows = process.platform === 'win32';
        const shell = isWindows ? (process.env.COMSPEC || 'powershell.exe') : (process.env.SHELL || '/bin/bash');
        
        let shellArgs = [];
        if (isWindows && shell.toLowerCase().includes('powershell')) {
            shellArgs = ['-NoLogo', '-NoExit'];
        }

        const child = spawn(shell, shellArgs, {
            cwd: cwd || os.homedir(),
            env: {
                ...process.env,
                TERM: 'xterm-256color',
                COLORTERM: 'truecolor'
            },
            shell: false
        });

        const session = {
            id,
            process: child,
            cwd,
            shell,
            active: true,
            createdAt: Date.now()
        };

        child.stdout.on('data', (chunk) => {
            onData(id, chunk.toString('utf8'), false);
        });

        child.stderr.on('data', (chunk) => {
            onData(id, chunk.toString('utf8'), true);
        });

        child.on('error', (err) => {
            onData(id, `\r\n[Process Error]: ${err.message}\r\n`, true);
        });

        child.on('exit', (code, signal) => {
            session.active = false;
            this.sessions.delete(id);
            onExit(id, code, signal);
        });

        this.sessions.set(id, session);
        return { id, shell, cwd };
    }

    sendInput(sessionId, input) {
        const session = this.sessions.get(sessionId);
        if (!session || !session.active || !session.process.stdin.writable) {
            throw new Error(`Session ${sessionId} is not active or stdin is not writable`);
        }
        session.process.stdin.write(input);
    }

    killSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return false;
        try {
            session.process.kill();
        } catch (e) {
            // ignore
        }
        this.sessions.delete(sessionId);
        return true;
    }

    closeAll() {
        for (const [id, session] of this.sessions.entries()) {
            try {
                session.process.kill();
            } catch (e) {}
        }
        this.sessions.clear();
    }

    /**
     * HR-184 - HR-189: Structured Tool Command Execution with Argument Quoting,
     * Streaming Buffering, Timeout Enforcement, CWD Validation & Audit Logging
     */
    async executeToolCommand(command, args = [], options = {}) {
        if (!this.executionHistory) this.executionHistory = [];
        const startTime = Date.now();
        const timeoutMs = options.timeoutMs || 30000;
        const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();

        // HR-188: Validate working directory
        if (!fs.existsSync(cwd)) {
            throw new Error(`Working directory does not exist: ${cwd}`);
        }

        return new Promise((resolve, reject) => {
            let child;
            let stdoutChunks = [];
            let stderrChunks = [];
            let timedOut = false;
            let timer = null;

            try {
                child = spawn(command, args, {
                    cwd,
                    env: options.env || process.env,
                    shell: options.shell || false
                });
            } catch (err) {
                return reject(err);
            }

            if (timeoutMs > 0) {
                timer = setTimeout(() => {
                    timedOut = true;
                    try {
                        child.kill('SIGKILL');
                    } catch (e) {}
                }, timeoutMs);
            }

            child.stdout?.on('data', (chunk) => {
                stdoutChunks.push(chunk);
                if (options.onStdout) options.onStdout(chunk.toString('utf8'));
            });

            child.stderr?.on('data', (chunk) => {
                stderrChunks.push(chunk);
                if (options.onStderr) options.onStderr(chunk.toString('utf8'));
            });

            child.on('error', (err) => {
                if (timer) clearTimeout(timer);
                reject(err);
            });

            child.on('close', (code, signal) => {
                if (timer) clearTimeout(timer);
                const durationMs = Date.now() - startTime;
                const stdout = Buffer.concat(stdoutChunks).toString('utf8');
                const stderr = Buffer.concat(stderrChunks).toString('utf8');

                const result = {
                    command,
                    args,
                    cwd,
                    exitCode: code !== null ? code : (timedOut ? 124 : 1),
                    signal,
                    timedOut,
                    durationMs,
                    stdout,
                    stderr,
                    success: code === 0 && !timedOut
                };

                // HR-189: Execution Audit History
                this.executionHistory.push({
                    timestamp: new Date().toISOString(),
                    ...result
                });

                resolve(result);
            });
        });
    }

    getExecutionHistory(limit = 50) {
        if (!this.executionHistory) return [];
        return this.executionHistory.slice(-limit);
    }

    clearExecutionHistory() {
        this.executionHistory = [];
    }
}

module.exports = TerminalService;
