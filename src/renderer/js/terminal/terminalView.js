export class TerminalView {
    constructor({ outputEl, inputEl, promptLabelEl, clearBtn, killBtn }) {
        this.outputEl = outputEl;
        this.inputEl = inputEl;
        this.promptLabelEl = promptLabelEl;
        this.clearBtn = clearBtn;
        this.killBtn = killBtn;

        this.sessionId = null;
        this.commandHistory = [];
        this.historyIndex = -1;

        this.init();
    }

    async init() {
        if (this.clearBtn) {
            this.clearBtn.onclick = () => this.clear();
        }
        if (this.killBtn) {
            this.killBtn.onclick = () => this.killCurrent();
        }

        if (this.inputEl) {
            this.inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const command = this.inputEl.value;
                    this.inputEl.value = '';
                    this.sendCommand(command);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (this.historyIndex > 0) {
                        this.historyIndex--;
                        this.inputEl.value = this.commandHistory[this.historyIndex] || '';
                    }
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (this.historyIndex < this.commandHistory.length - 1) {
                        this.historyIndex++;
                        this.inputEl.value = this.commandHistory[this.historyIndex] || '';
                    } else {
                        this.historyIndex = this.commandHistory.length;
                        this.inputEl.value = '';
                    }
                }
            });
        }

        // Listen for streaming terminal data
        window.headroomApi.terminal.onData(({ sessionId, data, isError }) => {
            if (sessionId === this.sessionId) {
                this.appendOutput(data, isError);
            }
        });

        window.headroomApi.terminal.onExit(({ sessionId, code }) => {
            if (sessionId === this.sessionId) {
                this.appendOutput(`\r\n[Process exited with code ${code}]\r\n`, code !== 0);
                this.sessionId = null;
            }
        });

        await this.startSession();
    }

    async startSession(cwd) {
        if (this.sessionId) {
            await window.headroomApi.terminal.killSession(this.sessionId);
        }

        try {
            const session = await window.headroomApi.terminal.createSession(cwd);
            this.sessionId = session.id;
            const shortCwd = session.cwd ? session.cwd.split('\\').pop() : 'headroom';
            if (this.promptLabelEl) {
                this.promptLabelEl.textContent = `${shortCwd} $`;
            }
            this.appendOutput(`[HEADROOM Terminal connected: ${session.shell}]\r\n`);
        } catch (err) {
            this.appendOutput(`[Terminal initialization error: ${err.message}]\r\n`, true);
        }
    }

    sendCommand(cmd) {
        if (!this.sessionId) {
            this.startSession().then(() => this.sendCommand(cmd));
            return;
        }

        if (cmd.trim()) {
            this.commandHistory.push(cmd);
            this.historyIndex = this.commandHistory.length;
        }

        window.headroomApi.terminal.sendInput(this.sessionId, cmd + '\r\n');
    }

    appendOutput(text, isError = false) {
        const span = document.createElement('span');
        span.className = isError ? 'terminal-line error' : 'terminal-line';
        span.textContent = text;
        this.outputEl.appendChild(span);
        this.outputEl.scrollTop = this.outputEl.scrollHeight;
    }

    clear() {
        this.outputEl.innerHTML = '';
    }

    async killCurrent() {
        if (this.sessionId) {
            await window.headroomApi.terminal.killSession(this.sessionId);
            this.appendOutput('\r\n[Terminal process terminated by user]\r\n', true);
            this.sessionId = null;
        }
    }
}
