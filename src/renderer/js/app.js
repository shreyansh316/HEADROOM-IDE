import { EditorManager } from './editor/editorManager.js';
import { FileTree } from './explorer/fileTree.js';
import { TerminalView } from './terminal/terminalView.js';
import { GitView } from './git/gitView.js';
import { AgentManager } from './agent/agentManager.js';
import { SettingsView } from './settings/settingsView.js';
import { LanguageView } from './languages/languageView.js';
import { ExtensionView } from './extensions/extensionView.js';
import { TitleBarManager } from './titlebar/titleBarManager.js';
import { AccountView } from './account/accountView.js';
import { UsageDashboardView } from './usage/usageDashboardView.js';
import { revealHeading } from './common/typewriter.js';

class HeadroomApp {
    constructor() {
        this.currentWorkspace = null;
        this.activeSidebarTab = 'explorer'; // 'explorer' | 'git' | 'languages' | 'extensions' | 'settings'

        this.init();
    }

    async init() {
        this.initWindowControls();
        this.initSplitters();
        this.initActivityBar();

        // 1. Editor Manager
        this.editorManager = new EditorManager({
            containerEl: document.getElementById('editor-container'),
            tabsBarEl: document.getElementById('editor-tabs-bar'),
            breadcrumbsEl: document.getElementById('editor-breadcrumbs'),
            onDirtyChange: (tab) => this.updateStatusBar(),
            onDiagnosticsChange: (fileDiagnostics) => this.updateProblemsPanel(fileDiagnostics)
        });
        this.editorManager.clearEditor();

        // 2. File Explorer
        this.fileTree = new FileTree({
            containerEl: document.getElementById('sidebar-explorer-content'),
            onFileSelect: (filePath) => this.openFile(filePath)
        });

        // 3. Integrated Terminal
        this.terminalView = new TerminalView({
            outputEl: document.getElementById('terminal-output'),
            inputEl: document.getElementById('terminal-cmd-input'),
            promptLabelEl: document.getElementById('terminal-prompt-label'),
            clearBtn: document.getElementById('terminal-clear-btn'),
            killBtn: document.getElementById('terminal-kill-btn')
        });

        this.initBottomPanel();

        // 4. Usage & Cost Dashboard View
        this.usageDashboardView = new UsageDashboardView({
            containerEl: document.getElementById('panel-view-usage')
        });

        // 5. Git View
        this.gitView = new GitView({
            containerEl: document.getElementById('sidebar-git-content'),
            onFileClick: (filePath) => this.openFile(filePath)
        });

        // 5. Multi-Language Ecosystem View
        this.languageView = new LanguageView({
            containerEl: document.getElementById('sidebar-languages-content')
        });

        // 6. Agent Manager
        this.agentManager = new AgentManager({
            containerEl: document.getElementById('agent-panel-content'),
            onChange: () => this.titleBarManager?.updateTitle(
                this.editorManager.getActiveTab(),
                this.currentWorkspace
            )
        });

        // 7. Settings View
        this.settingsView = new SettingsView({
            containerEl: document.getElementById('sidebar-settings-content')
        });

        // 8. Open VSX Extensions View
        this.extensionView = new ExtensionView({
            containerEl: document.getElementById('sidebar-extensions-content')
        });

        // 9. Custom Window Title Bar Manager
        this.titleBarManager = new TitleBarManager({
            containerEl: document.getElementById('app-titlebar'),
            app: this
        });

        // 10. Account & Session View
        this.accountView = new AccountView({ app: this });

        this.initQuickActions();
        await this.loadWorkspace();
        await this.updateStatusBar();

        // Initial prominent headings reveal animation (completes in <= 700ms)
        const sidebarTitle = document.getElementById('sidebar-title');
        if (sidebarTitle) revealHeading(sidebarTitle, 'Explorer', 700);

        const agentTitle = document.getElementById('agent-manager-title');
        if (agentTitle) revealHeading(agentTitle, 'HEADROOM Agent Manager', 700);
    }

    initWindowControls() {
        const minBtn = document.getElementById('window-min-btn');
        const maxBtn = document.getElementById('window-max-btn');
        const closeBtn = document.getElementById('window-close-btn');
        if (minBtn) minBtn.onclick = () => window.headroomApi.window.minimize();
        if (maxBtn) maxBtn.onclick = () => window.headroomApi.window.maximize();
        if (closeBtn) closeBtn.onclick = () => window.headroomApi.window.close();
    }

    initActivityBar() {
        const tabs = ['explorer', 'git', 'languages', 'extensions', 'settings'];
        for (const tab of tabs) {
            const btn = document.getElementById(`activity-btn-${tab}`);
            if (btn) {
                btn.onclick = () => this.switchSidebarTab(tab);
            }
        }
    }

    switchSidebarTab(tabName) {
        this.activeSidebarTab = tabName;
        const tabs = ['explorer', 'git', 'languages', 'extensions', 'settings'];
        for (const tab of tabs) {
            const btn = document.getElementById(`activity-btn-${tab}`);
            const content = document.getElementById(`sidebar-${tab}-content`);
            if (btn) btn.classList.toggle('active', tab === tabName);
            if (content) content.style.display = tab === tabName ? 'block' : 'none';
        }

        const titleEl = document.getElementById('sidebar-title');
        const actionsEl = document.getElementById('sidebar-actions');
        if (titleEl) {
            if (tabName === 'explorer') {
                titleEl.textContent = 'Explorer';
                if (actionsEl) actionsEl.style.display = 'flex';
            } else if (tabName === 'git') {
                titleEl.textContent = 'Source Control';
                if (actionsEl) actionsEl.style.display = 'none';
                this.gitView.refresh();
            } else if (tabName === 'languages') {
                titleEl.textContent = 'Languages & Runtimes';
                if (actionsEl) actionsEl.style.display = 'none';
                this.languageView.render();
            } else if (tabName === 'extensions') {
                titleEl.textContent = 'Extensions Marketplace';
                if (actionsEl) actionsEl.style.display = 'none';
            } else if (tabName === 'settings') {
                titleEl.textContent = 'Settings';
                if (actionsEl) actionsEl.style.display = 'none';
                this.settingsView.render();
            }
        }
    }

    initQuickActions() {
        document.getElementById('btn-open-folder').onclick = async () => {
            const ws = await window.headroomApi.workspace.openDirectoryDialog();
            if (ws) await this.loadWorkspace();
        };

        document.getElementById('btn-save-file').onclick = () => {
            this.editorManager.saveActiveFile();
        };

        document.getElementById('btn-toggle-terminal').onclick = () => {
            const panel = document.getElementById('bottom-panel');
            panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
        };

        document.getElementById('btn-toggle-agent').onclick = () => {
            const panel = document.getElementById('agent-panel');
            panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
        };

        document.getElementById('btn-new-file').onclick = async () => {
            if (!this.currentWorkspace) return;
            const fileName = prompt('Enter new file name:');
            if (fileName) {
                const fullPath = `${this.currentWorkspace.path}\\${fileName}`;
                await window.headroomApi.workspace.createFile(fullPath, '');
                await this.refreshTree();
                this.openFile(fullPath);
            }
        };

        document.getElementById('btn-refresh-tree').onclick = () => {
            this.refreshTree();
        };
    }

    initBottomPanel() {
        this.activeBottomTab = 'terminal';
        this.allProblems = new Map(); // filePath -> diagnostics[]
        this.activeRunId = null;
        this.activeDebugSessionId = null;

        const tabs = ['terminal', 'problems', 'output', 'debug', 'usage', 'workflows', 'diagnostics'];
        for (const tab of tabs) {
            const tabBtn = document.getElementById(`tab-${tab}`);
            if (tabBtn) {
                tabBtn.onclick = () => this.switchBottomTab(tab);
                tabBtn.onkeydown = (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        this.switchBottomTab(tab);
                    }
                };
            }
        }

        // Output actions
        // Workflows actions
        const wfRefresh = document.getElementById('wf-refresh-btn');
        if (wfRefresh) wfRefresh.onclick = () => this.loadWorkflows();

        // Diagnostics actions
        const diagRun = document.getElementById('diag-run-btn');
        if (diagRun) diagRun.onclick = () => this.runDiagnostics();

        const diagExport = document.getElementById('diag-export-btn');
        if (diagExport) diagExport.onclick = () => this.exportDiagnosticsBundle();

        const diagBackup = document.getElementById('diag-backup-btn');
        if (diagBackup) diagBackup.onclick = () => this.createBackupSnapshot();

        const outputClear = document.getElementById('output-clear-btn');
        if (outputClear) {
            outputClear.onclick = () => {
                const pane = document.getElementById('output-pane-content');
                if (pane) pane.textContent = '';
            };
        }
        const outputCancel = document.getElementById('output-cancel-btn');
        if (outputCancel) {
            outputCancel.onclick = async () => {
                if (this.activeRunId) {
                    await window.headroomApi.languages.cancelRun(this.activeRunId);
                }
            };
        }

        // Debug actions
        const debugContinue = document.getElementById('debug-continue-btn');
        if (debugContinue) debugContinue.onclick = () => this.activeDebugSessionId && window.headroomApi.debugger.continue(this.activeDebugSessionId);

        const debugStepOver = document.getElementById('debug-stepover-btn');
        if (debugStepOver) debugStepOver.onclick = () => this.activeDebugSessionId && window.headroomApi.debugger.stepOver(this.activeDebugSessionId);

        const debugStepInto = document.getElementById('debug-stepinto-btn');
        if (debugStepInto) debugStepInto.onclick = () => this.activeDebugSessionId && window.headroomApi.debugger.stepInto(this.activeDebugSessionId);

        const debugStepOut = document.getElementById('debug-stepout-btn');
        if (debugStepOut) debugStepOut.onclick = () => this.activeDebugSessionId && window.headroomApi.debugger.stepOut(this.activeDebugSessionId);

        const debugPause = document.getElementById('debug-pause-btn');
        if (debugPause) debugPause.onclick = () => this.activeDebugSessionId && window.headroomApi.debugger.pause(this.activeDebugSessionId);

        const debugStop = document.getElementById('debug-stop-btn');
        if (debugStop) debugStop.onclick = () => this.activeDebugSessionId && window.headroomApi.debugger.stop(this.activeDebugSessionId);

        // Listen for runtime execution output stream
        if (window.headroomApi.languages.onRunOutput) {
            window.headroomApi.languages.onRunOutput((event, data) => {
                const pane = document.getElementById('output-pane-content');
                if (!pane) return;
                if (data.type === 'stdout' || data.type === 'stderr') {
                    pane.textContent += data.text;
                } else if (data.type === 'exit') {
                    pane.textContent += `\n[Process exited with code ${data.exitCode}]\n`;
                    const cancelBtn = document.getElementById('output-cancel-btn');
                    if (cancelBtn) cancelBtn.style.display = 'none';
                    this.activeRunId = null;
                } else if (data.type === 'error') {
                    pane.textContent += `\n[Execution Error: ${data.error}]\n`;
                    const cancelBtn = document.getElementById('output-cancel-btn');
                    if (cancelBtn) cancelBtn.style.display = 'none';
                    this.activeRunId = null;
                }
                const viewOutput = document.getElementById('panel-view-output');
                if (viewOutput) viewOutput.scrollTop = viewOutput.scrollHeight;
            });
        }

        // Listen for debug events stream
        if (window.headroomApi && window.headroomApi.debugger && window.headroomApi.debugger.onDebugEvent) {
            window.headroomApi.debugger.onDebugEvent(async (event, data) => {
                this.handleDebugEvent(data);
            });
        }
    }

    switchBottomTab(tabName) {
        this.activeBottomTab = tabName;
        const panel = document.getElementById('bottom-panel');
        if (panel && panel.style.display === 'none') {
            panel.style.display = 'flex';
        }

        const tabs = ['terminal', 'problems', 'output', 'debug', 'usage', 'workflows', 'diagnostics'];
        for (const t of tabs) {
            const tabBtn = document.getElementById(`tab-${t}`);
            const view = document.getElementById(`panel-view-${t}`);
            if (tabBtn) {
                tabBtn.classList.toggle('active', t === tabName);
                tabBtn.setAttribute('aria-selected', t === tabName ? 'true' : 'false');
            }
            if (view) view.style.display = t === tabName ? 'flex' : 'none';
        }

                const termActions = document.getElementById('terminal-actions');
        const outputActions = document.getElementById('output-actions');
        const debugActions = document.getElementById('debug-actions');
        const usageActions = document.getElementById('usage-actions');
        const wfActions = document.getElementById('workflow-actions');
        const diagActions = document.getElementById('diagnostics-actions');
        if (termActions) termActions.style.display = tabName === 'terminal' ? 'flex' : 'none';
        if (outputActions) outputActions.style.display = tabName === 'output' ? 'flex' : 'none';
        if (debugActions) debugActions.style.display = tabName === 'debug' ? 'flex' : 'none';
        if (usageActions) usageActions.style.display = tabName === 'usage' ? 'flex' : 'none';
        if (wfActions) wfActions.style.display = tabName === 'workflows' ? 'flex' : 'none';
        if (diagActions) diagActions.style.display = tabName === 'diagnostics' ? 'flex' : 'none';

        if (tabName === 'usage' && this.usageDashboardView) {
            this.usageDashboardView.render();
        }
        if (tabName === 'workflows') {
            this.loadWorkflows();
        }
        if (tabName === 'diagnostics') {
            this.runDiagnostics();
        }
    }

    updateProblemsPanel(fileDiagnostics) {
        if (fileDiagnostics && fileDiagnostics.path) {
            if (fileDiagnostics.diagnostics && fileDiagnostics.diagnostics.length > 0) {
                this.allProblems.set(fileDiagnostics.path, fileDiagnostics.diagnostics);
            } else {
                this.allProblems.delete(fileDiagnostics.path);
            }
        }

        const listContainer = document.getElementById('problems-list');
        const badge = document.getElementById('problems-count-badge');
        if (!listContainer) return;

        let totalErrors = 0;
        let totalWarnings = 0;
        listContainer.innerHTML = '';

        for (const [filePath, diags] of this.allProblems.entries()) {
            for (const d of diags) {
                if (d.severity === 'error') totalErrors++;
                else totalWarnings++;

                const row = document.createElement('div');
                row.style.cssText = 'display: flex; align-items: flex-start; gap: 8px; padding: 4px 6px; border-radius: 4px; cursor: pointer; transition: background 0.1s;';
                row.onmouseover = () => row.style.background = 'var(--bg-surface-secondary)';
                row.onmouseout = () => row.style.background = 'transparent';

                const isErr = d.severity === 'error';
                const icon = isErr ? '&#10006;' : '&#9888;';
                const iconColor = isErr ? 'var(--status-error)' : 'var(--status-warning)';
                const fileName = filePath.split('\\').pop().split('/').pop();

                row.innerHTML = `
                    <span style="color: ${iconColor}; font-weight: 700; flex-shrink: 0;">${icon}</span>
                    <span style="flex: 1; color: var(--text-primary);">${d.message}</span>
                    <span style="color: var(--text-muted); font-size: 11px; flex-shrink: 0;">${fileName}:${d.line}:${d.column}</span>
                `;

                row.onclick = async () => {
                    await this.openFile(filePath);
                    if (this.editorManager) {
                        this.editorManager.goToLocation(d.line, d.column);
                    }
                };

                listContainer.appendChild(row);
            }
        }

        const total = totalErrors + totalWarnings;
        if (badge) {
            badge.textContent = total;
            badge.style.display = total > 0 ? 'inline-block' : 'none';
            badge.style.background = totalErrors > 0 ? 'var(--status-error)' : 'var(--status-warning)';
        }

        if (total === 0) {
            listContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 11px; padding: 12px 0;">No problems detected in workspace files.</div>';
        }
    }

    async runActiveFile() {
        const active = this.editorManager.getActiveTab();
        if (!active || !active.path) {
            alert('No active file to run.');
            return;
        }

        this.switchBottomTab('output');
        const pane = document.getElementById('output-pane-content');
        if (pane) {
            pane.textContent = `[Running: ${active.path}]\n`;
        }

        const cancelBtn = document.getElementById('output-cancel-btn');
        if (cancelBtn) cancelBtn.style.display = 'inline-block';

        try {
            const cwd = this.currentWorkspace ? this.currentWorkspace.path : '';
            const res = await window.headroomApi.languages.runFile(active.path, { cwd });
            this.activeRunId = res.runId;
        } catch (err) {
            if (pane) pane.textContent += `[Execution failed to start: ${err.message}]\n`;
            if (cancelBtn) cancelBtn.style.display = 'none';
        }
    }

    async debugActiveFile() {
        const active = this.editorManager.getActiveTab();
        if (!active || !active.path) {
            alert('No active file to debug.');
            return;
        }

        this.switchBottomTab('debug');
        const debugLog = document.getElementById('debug-console-log');
        if (debugLog) {
            debugLog.innerHTML = `<div style="color: var(--text-secondary);">[Starting debug session: ${active.path}]</div>`;
        }

        const statusIndicator = document.getElementById('debug-status-indicator');
        if (statusIndicator) statusIndicator.textContent = 'Starting...';

        try {
            const cwd = this.currentWorkspace ? this.currentWorkspace.path : '';
            const session = await window.headroomApi.debugger.startSession({
                filePath: active.path,
                cwd: cwd
            });

            this.activeDebugSessionId = session.sessionId;
            if (statusIndicator) statusIndicator.textContent = 'Connected (port ' + session.port + ')';
        } catch (err) {
            if (debugLog) {
                debugLog.innerHTML += `<div style="color: var(--status-error);">[Debugger launch failed: ${err.message}]</div>`;
            }
            if (statusIndicator) statusIndicator.textContent = 'Failed';
        }
    }

    async handleDebugEvent(data) {
        const debugLog = document.getElementById('debug-console-log');
        const statusIndicator = document.getElementById('debug-status-indicator');
        const callStackList = document.getElementById('debug-callstack-list');
        const variablesList = document.getElementById('debug-variables-list');

        if (data.type === 'stdout' || data.type === 'stderr') {
            if (debugLog) {
                const line = document.createElement('div');
                line.style.color = data.type === 'stderr' ? 'var(--status-error)' : 'var(--text-primary)';
                line.textContent = data.text;
                debugLog.appendChild(line);
                debugLog.scrollTop = debugLog.scrollHeight;
            }
        } else if (data.type === 'paused') {
            if (statusIndicator) statusIndicator.textContent = `Paused (${data.reason || 'breakpoint'})`;
            if (debugLog) {
                const line = document.createElement('div');
                line.style.color = 'var(--status-warning)';
                line.textContent = `[Paused: ${data.reason || 'break'}]`;
                debugLog.appendChild(line);
            }

            // Render call stack
            if (callStackList && data.callFrames) {
                callStackList.innerHTML = '';
                for (const frame of data.callFrames) {
                    const row = document.createElement('div');
                    row.style.cssText = 'padding: 2px 4px; border-radius: 3px; cursor: pointer;';
                    row.innerHTML = `<span style="color: var(--accent-primary);">&#9658; ${frame.functionName || '(anonymous)'}</span> <span style="color: var(--text-muted); font-size: 10px;">line ${frame.location.lineNumber + 1}</span>`;
                    callStackList.appendChild(row);

                    // Fetch local scope variables for top frame
                    if (frame.scopeChain && frame.scopeChain.length > 0 && this.activeDebugSessionId) {
                        const localScope = frame.scopeChain.find(s => s.type === 'local') || frame.scopeChain[0];
                        if (localScope && localScope.object && localScope.object.objectId) {
                            try {
                                const varRes = await window.headroomApi.debugger.getVariables(this.activeDebugSessionId, localScope.object.objectId);
                                if (variablesList && varRes.variables) {
                                    variablesList.innerHTML = '';
                                    for (const v of varRes.variables) {
                                        const vRow = document.createElement('div');
                                        const valStr = v.value ? (v.value.description || String(v.value.value)) : 'undefined';
                                        vRow.innerHTML = `<span style="color: #60a5fa;">${v.name}</span>: <span style="color: #34d399;">${valStr}</span>`;
                                        variablesList.appendChild(vRow);
                                    }
                                }
                            } catch (e) {
                                console.error('Failed to get variables:', e);
                            }
                        }
                    }
                }
            }

            // Highlight location in editor if matched
            if (data.callFrames && data.callFrames[0] && data.callFrames[0].location) {
                const loc = data.callFrames[0].location;
                if (this.editorManager) {
                    this.editorManager.goToLocation(loc.lineNumber + 1, (loc.columnNumber || 0) + 1);
                }
            }
        } else if (data.type === 'resumed') {
            if (statusIndicator) statusIndicator.textContent = 'Running';
        } else if (data.type === 'stopped' || data.type === 'exit') {
            if (statusIndicator) statusIndicator.textContent = 'Terminated';
            if (debugLog) {
                const line = document.createElement('div');
                line.style.color = 'var(--text-muted)';
                line.textContent = `[Session ended${data.exitCode !== undefined ? `, code: ${data.exitCode}` : ''}]`;
                debugLog.appendChild(line);
            }
            if (callStackList) callStackList.innerHTML = '<span style="color: var(--text-muted);">No active debug session</span>';
            if (variablesList) variablesList.innerHTML = '<span style="color: var(--text-muted);">No active scopes</span>';
            this.activeDebugSessionId = null;
        }
    }

    async loadWorkspace() {
        try {
            this.currentWorkspace = await window.headroomApi.workspace.getWorkspace();
            if (this.currentWorkspace) {
                await this.refreshTree();
                this.gitView.refresh();
                this.terminalView.startSession(this.currentWorkspace.path);
            }
            await this.updateStatusBar();
        } catch (e) {
            console.error('Error loading workspace:', e);
        }
    }

    async refreshTree() {
        if (!this.currentWorkspace) return;
        const tree = await window.headroomApi.workspace.readTree();
        this.fileTree.setTree(tree);
    }

    async openFile(filePath) {
        try {
            const fileData = await window.headroomApi.workspace.readFile(filePath);
            this.editorManager.openFile(fileData);
            this.fileTree.setActiveFile(filePath);
            await this.updateStatusBar();
        } catch (err) {
            alert(`Error opening file: ${err.message}`);
        }
    }

    async openFileDialog() {
        try {
            const fileData = await window.headroomApi.workspace.openFileDialog();
            if (fileData) {
                this.editorManager.openFile(fileData);
                this.fileTree.setActiveFile(fileData.path);
                await this.updateStatusBar();
            }
        } catch (err) {
            console.error('Error opening file via dialog:', err);
        }
    }

    focusAgentComposer() {
        const agentPanel = document.getElementById('agent-panel');
        if (agentPanel && agentPanel.style.display === 'none') {
            agentPanel.style.display = 'flex';
        }
        if (this.agentManager) {
            this.agentManager.activeTab = 'chat';
            this.agentManager.updateUpperRegion();
        }
        const input = document.getElementById('agent-objective-input');
        if (input) {
            input.focus();
            input.scrollIntoView({ behavior: 'smooth' });
        }
    }

    async updateStatusBar() {
        const wsEl = document.getElementById('status-workspace');
        if (wsEl) wsEl.textContent = this.currentWorkspace?.name || '';

        const branchEl = document.getElementById('status-git-branch');
        if (branchEl) {
            try {
                const status = await window.headroomApi.git.getStatus();
                branchEl.textContent = status.isRepo ? `&#128279; ${status.branch || 'detached'}` : 'Not a git repo';
            } catch {
                branchEl.textContent = '';
            }
        }

        const activeTab = this.editorManager.getActiveTab();
        const fileEl = document.getElementById('status-active-file');
        const langEl = document.getElementById('status-file-language');

        if (activeTab) {
            if (fileEl) fileEl.textContent = `${activeTab.name}${activeTab.dirty ? ' (modified)' : ''}`;
            if (langEl) {
                const lang = await window.headroomApi.languages.getLanguageForFile(activeTab.path);
                langEl.textContent = lang ? `[${lang.name}]` : '';
            }
        } else {
            if (fileEl) fileEl.textContent = '';
            if (langEl) langEl.textContent = '';
        }

        const provEl = document.getElementById('status-provider');
        if (provEl) {
            const prov = await window.headroomApi.headroom.getProviderStatus();
            provEl.textContent = `Provider: ${prov.provider} (${prov.model})`;
        }

        if (this.titleBarManager) {
            this.titleBarManager.updateTitle(activeTab, this.currentWorkspace);
        }
    }

    
    async loadWorkflows() {
        const listEl = document.getElementById('workflows-recipe-list');
        if (!listEl) return;
        try {
            listEl.innerHTML = '<div style="color: var(--text-muted); font-size: 11px;">Fetching recipes...</div>';
            const recipes = await window.headroomApi.workflows.listRecipes();
            if (!recipes || recipes.length === 0) {
                listEl.innerHTML = '<div style="color: var(--text-muted); font-size: 11px;">No workflow recipes found.</div>';
                return;
            }

            listEl.innerHTML = recipes.map(r => `
                <div style="background: var(--bg-surface-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; display: flex; flex-direction: column; justify-content: space-between;">
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                            <span style="font-weight: 700; font-size: 12px; color: var(--text-primary);">${r.name}</span>
                            <span style="font-size: 9px; padding: 1px 4px; border-radius: 3px; background: var(--bg-hover); color: var(--text-muted);">${r.category}</span>
                        </div>
                        <p style="margin: 0 0 8px 0; font-size: 11px; color: var(--text-secondary); line-height: 1.4;">${r.description}</p>
                        <div style="font-size: 10px; color: var(--text-muted); margin-bottom: 8px;">
                            <span>Steps: ${r.stepCount}</span> &bull; <span>Version: ${r.version}</span>
                        </div>
                    </div>
                    <button class="primary" style="padding: 4px 8px; font-size: 11px;" onclick="window.headroomApp.executeWorkflow('${r.id}')">Launch Workflow</button>
                </div>
            `).join('');
        } catch (e) {
            listEl.innerHTML = `<div style="color: var(--status-error); font-size: 11px;">Error loading workflows: ${e.message}</div>`;
        }
    }

    async executeWorkflow(recipeId) {
        const activeContainer = document.getElementById('workflows-active-execution');
        const activeTitle = document.getElementById('wf-active-title');
        const activeSteps = document.getElementById('wf-active-steps');
        const cancelBtn = document.getElementById('wf-active-cancel-btn');

        if (activeContainer) activeContainer.style.display = 'block';
        if (activeTitle) activeTitle.textContent = `Executing Workflow: ${recipeId}`;
        if (activeSteps) activeSteps.innerHTML = '<div style="color: var(--text-muted);">Initializing execution DAG...</div>';

        try {
            const execution = await window.headroomApi.workflows.execute(recipeId, { target: 'Workspace' });
            if (activeSteps && execution.stepResults) {
                activeSteps.innerHTML = execution.stepResults.map(s => `
                    <div style="display: flex; justify-content: space-between; padding: 3px 6px; background: var(--bg-surface); border-radius: 4px;">
                        <span>[${s.stepId}] ${s.status}</span>
                        <span style="color: ${s.success ? 'var(--status-success)' : 'var(--status-error)'};">${s.success ? 'PASS' : 'FAIL'}</span>
                    </div>
                `).join('');
            }
        } catch (e) {
            if (activeSteps) activeSteps.innerHTML = `<div style="color: var(--status-error);">Execution Error: ${e.message}</div>`;
        }
    }

    async runDiagnostics() {
        const grid = document.getElementById('diagnostics-checks-grid');
        const reportContainer = document.getElementById('diagnostics-report-container');
        const reportText = document.getElementById('diagnostics-report-text');
        if (!grid) return;

        try {
            grid.innerHTML = '<div style="color: var(--text-muted); font-size: 11px;">Probing environment health...</div>';
            const health = await window.headroomApi.diagnostics.runHealthDoctor();
            
            grid.innerHTML = health.checks.map(c => `
                <div style="background: var(--bg-surface-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span style="font-weight: 700; font-size: 11px;">${c.subsystem}</span>
                        <span style="font-size: 9px; padding: 1px 4px; border-radius: 3px; background: ${c.status === 'HEALTHY' ? 'rgba(78, 201, 176, 0.2)' : 'rgba(241, 76, 76, 0.2)'}; color: ${c.status === 'HEALTHY' ? 'var(--status-success)' : 'var(--status-error)'};">${c.status}</span>
                    </div>
                    <div style="font-size: 10px; color: var(--text-secondary);">${c.details || c.version || ''}</div>
                </div>
            `).join('');

            if (reportContainer && reportText) {
                reportContainer.style.display = 'block';
                reportText.textContent = JSON.stringify(health, null, 2);
            }
        } catch (e) {
            grid.innerHTML = `<div style="color: var(--status-error); font-size: 11px;">Diagnostics error: ${e.message}</div>`;
        }
    }

    async exportDiagnosticsBundle() {
        try {
            const bundle = await window.headroomApi.diagnostics.exportBundle();
            alert(`Diagnostic Bundle Exported Successfully:\nPath: ${bundle.bundlePath}\nSize: ${bundle.sizeBytes} bytes`);
        } catch (e) {
            alert(`Export Failed: ${e.message}`);
        }
    }

    async createBackupSnapshot() {
        try {
            const snap = await window.headroomApi.backup.createSnapshot();
            alert(`SQLite Snapshot Created Successfully:\nBackup File: ${snap.backupFile}\nSHA-256: ${snap.checksum}`);
        } catch (e) {
            alert(`Backup Failed: ${e.message}`);
        }
    }

    initSplitters() {
        const splitterSidebar = document.getElementById('splitter-sidebar');
        const sidebar = document.getElementById('sidebar');
        let isResizingSidebar = false;

        splitterSidebar.addEventListener('mousedown', () => {
            isResizingSidebar = true;
            document.body.style.cursor = 'col-resize';
            splitterSidebar.classList.add('active');
        });

        const splitterBottom = document.getElementById('splitter-bottom');
        const bottomPanel = document.getElementById('bottom-panel');
        let isResizingBottom = false;

        splitterBottom.addEventListener('mousedown', () => {
            isResizingBottom = true;
            document.body.style.cursor = 'row-resize';
            splitterBottom.classList.add('active');
        });

        const splitterAgent = document.getElementById('splitter-agent');
        const agentPanel = document.getElementById('agent-panel');
        let isResizingAgent = false;

        splitterAgent.addEventListener('mousedown', () => {
            isResizingAgent = true;
            document.body.style.cursor = 'col-resize';
            splitterAgent.classList.add('active');
        });

        window.addEventListener('mousemove', (e) => {
            if (isResizingSidebar) {
                const newWidth = Math.max(160, Math.min(600, e.clientX - 48));
                sidebar.style.width = `${newWidth}px`;
            }
            if (isResizingBottom) {
                const newHeight = Math.max(80, Math.min(500, window.innerHeight - e.clientY - 24));
                bottomPanel.style.height = `${newHeight}px`;
            }
            if (isResizingAgent) {
                const newWidth = Math.max(260, Math.min(700, window.innerWidth - e.clientX));
                agentPanel.style.width = `${newWidth}px`;
            }
        });

        window.addEventListener('mouseup', () => {
            if (isResizingSidebar || isResizingBottom || isResizingAgent) {
                isResizingSidebar = false;
                isResizingBottom = false;
                isResizingAgent = false;
                document.body.style.cursor = 'default';
                splitterSidebar.classList.remove('active');
                splitterBottom.classList.remove('active');
                splitterAgent.classList.remove('active');
            }
        });
    }
}

// Global bootstrap
window.addEventListener('DOMContentLoaded', () => {
    window.headroomApp = new HeadroomApp();
});
