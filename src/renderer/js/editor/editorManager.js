import { EditorView, basicSetup } from 'codemirror';
import { keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { markdown } from '@codemirror/lang-markdown';
import { linter, lintGutter } from '@codemirror/lint';
import { search, searchKeymap, openSearchPanel } from '@codemirror/search';
import { revealHeading } from '../common/typewriter.js';
import { getFileIcon } from '../common/icons.js';

export class EditorManager {
    constructor({ containerEl, tabsBarEl, breadcrumbsEl, onDirtyChange = () => {}, onDiagnosticsChange = () => {} }) {
        this.containerEl = containerEl;
        this.tabsBarEl = tabsBarEl;
        this.breadcrumbsEl = breadcrumbsEl;
        this.onDirtyChange = onDirtyChange;
        this.onDiagnosticsChange = onDiagnosticsChange;

        this.openTabs = []; // { id, path, relativePath, name, content, dirty }
        this.activeTabId = null;
        this.editorView = null;
        this.breakpoints = new Map(); // path -> Set of lineNumbers

        this.setupKeyboardShortcuts();
        this.renderTabs();
    }

    setupKeyboardShortcuts() {
        window.addEventListener('keydown', (e) => {
            const isMod = e.ctrlKey || e.metaKey;

            // Ctrl+S: Save active file
            if (isMod && e.key === 's') {
                e.preventDefault();
                this.saveActiveFile();
            }

            // Ctrl+W: Close active tab
            if (isMod && e.key === 'w') {
                e.preventDefault();
                if (this.activeTabId) {
                    this.closeTab(this.activeTabId);
                }
            }

            // Shift+Alt+F: Format Document
            if (e.shiftKey && e.altKey && (e.key === 'f' || e.key === 'F')) {
                e.preventDefault();
                this.formatActiveFile();
            }

            // Ctrl+F: Find in active editor
            if (isMod && (e.key === 'f' || e.key === 'F') && !e.shiftKey && !e.altKey) {
                if (this.editorView) {
                    e.preventDefault();
                    openSearchPanel(this.editorView);
                }
            }

            // Ctrl+O: Open file dialog
            if (isMod && e.key === 'o') {
                e.preventDefault();
                if (window.headroomApp) {
                    window.headroomApp.openFileDialog();
                }
            }
        });
    }

    getLanguageExtension(filePath) {
        const ext = (filePath.split('.').pop() || '').toLowerCase();
        switch (ext) {
            case 'js':
            case 'mjs':
            case 'cjs':
            case 'jsx':
                return javascript();
            case 'json':
                return json();
            case 'html':
                return html();
            case 'css':
                return css();
            case 'md':
            case 'markdown':
                return markdown();
            default:
                return [];
        }
    }

    openFile(fileData) {
        if (!fileData || !fileData.path) return;

        const existing = this.openTabs.find(t => t.path === fileData.path);
        if (existing) {
            this.setActiveTab(existing.id);
            return;
        }

        const tab = {
            id: `tab-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            path: fileData.path,
            relativePath: fileData.relativePath || fileData.name,
            name: fileData.name || fileData.path.split(/[\/\\]/).pop(),
            content: fileData.content || '',
            dirty: false
        };

        this.openTabs.push(tab);
        this.renderTabs();
        this.setActiveTab(tab.id);
    }

    setActiveTab(tabId) {
        const tab = this.openTabs.find(t => t.id === tabId);
        if (!tab) return;

        this.activeTabId = tabId;
        this.renderTabs();
        this.updateBreadcrumbs(tab);
        this.mountEditor(tab);
    }

    closeTab(tabId, e) {
        if (e) e.stopPropagation();
        const index = this.openTabs.findIndex(t => t.id === tabId);
        if (index === -1) return;

        const closingTab = this.openTabs[index];
        if (closingTab.dirty) {
            const confirmClose = window.confirm(`"${closingTab.name}" has unsaved changes. Discard changes?`);
            if (!confirmClose) return;
        }

        this.openTabs.splice(index, 1);

        if (this.activeTabId === tabId) {
            if (this.openTabs.length > 0) {
                const nextIndex = Math.max(0, index - 1);
                this.setActiveTab(this.openTabs[nextIndex].id);
            } else {
                this.activeTabId = null;
                this.clearEditor();
            }
        }
        this.renderTabs();
    }

    renderTabs() {
        if (!this.tabsBarEl) return;
        this.tabsBarEl.innerHTML = '';

        if (this.openTabs.length === 0) {
            this.tabsBarEl.innerHTML = '<div class="empty-tabs-hint">No open editors</div>';
            return;
        }

        for (const tab of this.openTabs) {
            const tabEl = document.createElement('div');
            tabEl.className = `editor-tab ${tab.id === this.activeTabId ? 'active' : ''} ${tab.dirty ? 'dirty' : ''}`;
            tabEl.title = tab.path;

            const iconEl = document.createElement('span');
            iconEl.className = 'tab-file-icon';
            iconEl.innerHTML = getFileIcon(tab.name);

            const titleEl = document.createElement('span');
            titleEl.className = 'tab-title';
            titleEl.textContent = tab.name;

            const dirtyDot = document.createElement('span');
            dirtyDot.className = 'dirty-indicator';

            const closeBtn = document.createElement('span');
            closeBtn.className = 'tab-close';
            closeBtn.innerHTML = '&times;';
            closeBtn.title = 'Close (Ctrl+W)';
            closeBtn.onclick = (e) => this.closeTab(tab.id, e);

            tabEl.appendChild(iconEl);
            tabEl.appendChild(titleEl);
            tabEl.appendChild(dirtyDot);
            tabEl.appendChild(closeBtn);

            tabEl.onclick = () => this.setActiveTab(tab.id);
            this.tabsBarEl.appendChild(tabEl);
        }
    }

    updateBreadcrumbs(tab) {
        if (!this.breadcrumbsEl) return;
        if (tab && tab.relativePath) {
            this.breadcrumbsEl.style.display = 'flex';
            this.breadcrumbsEl.textContent = tab.relativePath;
        } else {
            this.breadcrumbsEl.style.display = 'none';
            this.breadcrumbsEl.textContent = '';
        }
    }

    mountEditor(tab) {
        this.containerEl.innerHTML = '';
        this.containerEl.classList.remove('is-empty');

        const langExtension = this.getLanguageExtension(tab.path);

        const updateListener = EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                const newContent = update.state.doc.toString();
                if (!tab.dirty) {
                    tab.dirty = true;
                    this.renderTabs();
                    this.onDirtyChange(tab);
                }
                tab.content = newContent;
            }
        });

        const realtimeLinter = linter(async (view) => {
            const activeTab = this.getActiveTab();
            if (!activeTab || !window.headroomApi?.languages?.getDiagnostics) return [];

            const content = view.state.doc.toString();
            try {
                const res = await window.headroomApi.languages.getDiagnostics({
                    filePath: activeTab.path,
                    content
                });

                if (!res || !res.diagnostics) return [];

                if (this.onDiagnosticsChange) {
                    this.onDiagnosticsChange({
                        filePath: activeTab.path,
                        diagnostics: res.diagnostics
                    });
                }

                const doc = view.state.doc;
                const cmDiags = [];
                for (const d of res.diagnostics) {
                    try {
                        const lineNum = Math.min(Math.max(1, d.line), doc.lines);
                        const lineObj = doc.line(lineNum);
                        const from = Math.min(lineObj.from + Math.max(0, (d.col || 1) - 1), lineObj.to);
                        const to = Math.min(lineObj.to, from + Math.max(1, (d.endCol || d.col + 1) - (d.col || 1)));

                        cmDiags.push({
                            from,
                            to: Math.max(from + 1, to),
                            severity: d.severity || 'error',
                            message: d.message,
                            source: d.source || 'HEADROOM Engine'
                        });
                    } catch {}
                }
                return cmDiags;
            } catch {
                return [];
            }
        }, { delay: 350 });

        const state = EditorState.create({
            doc: tab.content,
            extensions: [
                basicSetup,
                langExtension,
                lintGutter(),
                realtimeLinter,
                search({ top: true }),
                keymap.of(searchKeymap),
                updateListener,
                EditorView.lineWrapping
            ]
        });

        this.editorView = new EditorView({
            state,
            parent: this.containerEl
        });
    }

    async formatActiveFile() {
        const tab = this.openTabs.find(t => t.id === this.activeTabId);
        if (!tab || !this.editorView || !window.headroomApi?.languages?.formatDocument) return false;

        const currentContent = this.editorView.state.doc.toString();
        try {
            const res = await window.headroomApi.languages.formatDocument({
                filePath: tab.path,
                content: currentContent
            });

            if (res && res.success && res.formatted !== null) {
                this.editorView.dispatch({
                    changes: { from: 0, to: this.editorView.state.doc.length, insert: res.formatted }
                });
                tab.content = res.formatted;
                tab.dirty = true;
                this.renderTabs();
                this.onDirtyChange(tab);
                return true;
            } else {
                console.warn('[HEADROOM Formatter]', res?.error || 'Formatting unavailable');
                return false;
            }
        } catch (err) {
            console.error('[HEADROOM Formatter Error]', err.message);
            return false;
        }
    }

    goToLocation(line, col = 1) {
        if (!this.editorView) return;
        const doc = this.editorView.state.doc;
        const lineNum = Math.min(Math.max(1, line), doc.lines);
        const lineObj = doc.line(lineNum);
        const pos = Math.min(lineObj.from + Math.max(0, col - 1), lineObj.to);

        this.editorView.dispatch({
            selection: { anchor: pos, head: pos },
            scrollIntoView: true
        });
        this.editorView.focus();
    }

    clearEditor() {
        if (this.editorView) {
            this.editorView.destroy();
            this.editorView = null;
        }

        this.containerEl.classList.add('is-empty');
        this.containerEl.innerHTML = `
            <div class="workspace-empty-state">
                <div class="empty-state-card">
                    <div class="empty-icon-box">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="16 18 22 12 16 6"></polyline>
                            <polyline points="8 6 2 12 8 18"></polyline>
                        </svg>
                    </div>
                    <h3 class="empty-heading" id="workspace-placeholder-heading">HEADROOM IDE</h3>
                    <p class="empty-desc">Open a file to start coding, or create a task with the HEADROOM workforce.</p>
                    <div class="empty-btn-group">
                        <button class="primary" id="btn-empty-open-file">Open File</button>
                        <button id="btn-empty-create-task">Create Task</button>
                    </div>
                    <div class="empty-shortcut-hints">
                        <span class="shortcut-item"><kbd>Ctrl</kbd> + <kbd>O</kbd> Open File</span>
                        <span class="shortcut-sep">&bull;</span>
                        <span class="shortcut-item"><kbd>Ctrl</kbd> + <kbd>S</kbd> Save</span>
                    </div>
                </div>
            </div>
        `;

        const openFileBtn = this.containerEl.querySelector('#btn-empty-open-file');
        if (openFileBtn) {
            openFileBtn.onclick = async () => {
                if (window.headroomApp) {
                    await window.headroomApp.openFileDialog();
                }
            };
        }

        const createTaskBtn = this.containerEl.querySelector('#btn-empty-create-task');
        if (createTaskBtn) {
            createTaskBtn.onclick = () => {
                if (window.headroomApp) {
                    window.headroomApp.focusAgentComposer();
                }
            };
        }

        const headingEl = this.containerEl.querySelector('#workspace-placeholder-heading');
        if (headingEl) {
            revealHeading(headingEl, 'HEADROOM IDE', 700);
        }

        this.updateBreadcrumbs(null);
        this.renderTabs();
    }

    async saveActiveFile() {
        const tab = this.openTabs.find(t => t.id === this.activeTabId);
        if (!tab) return false;

        try {
            const currentContent = this.editorView ? this.editorView.state.doc.toString() : tab.content;
            await window.headroomApi.workspace.writeFile(tab.path, currentContent);
            tab.dirty = false;
            tab.content = currentContent;
            this.renderTabs();
            this.onDirtyChange(tab);
            return true;
        } catch (err) {
            alert(`Failed to save file: ${err.message}`);
            return false;
        }
    }

    getActiveTab() {
        return this.openTabs.find(t => t.id === this.activeTabId) || null;
    }

    splitEditor() {
        this.isSplit = !this.isSplit;
        if (this.isSplit) {
            this.containerEl.classList.add('editor-split-active');
        } else {
            this.containerEl.classList.remove('editor-split-active');
        }
        return this.isSplit;
    }
}
