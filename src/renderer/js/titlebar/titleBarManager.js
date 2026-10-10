/**
 * HEADROOM IDE — Premium Native Title Bar Manager
 *
 * Polished, compact desktop application title bar inspired by Antigravity IDE.
 * Integrates real application menus, centered workspace title, editor and layout panel
 * toolbar, runtime connection indicator, live agent workforce telemetry, and
 * secure native Electron window controls.
 *
 * Strict 100% Pure JavaScript Constraint.
 */

export class TitleBarManager {
    constructor({ containerEl, app }) {
        this.containerEl = containerEl;
        this.app = app;
        this.activeMenu = null;
        this.isMaximized = false;
        this.state = {
            projectTitle: 'HEADROOM IDE',
            currentFolderName: '',
            currentFolderPath: '',
            activeFilePath: '',
            isUnsavedChanges: false,
            totalAgentCount: 0,
            activeTaskCount: 0,
            runtimeStatus: 'connected', // 'connected' | 'connecting' | 'disconnected' | 'error'
            runtimeStatusLabel: 'Ready'
        };
        this.disposeMaximizedListener = null;
        this.focusedDropdownIndex = -1;

        this.init();
    }

    init() {
        this.render();
        this.setupEventListeners();
        this.setupKeyboardNavigation();

        const windowApi = window.headroomApi?.window;
        if (windowApi?.onMaximizedChange) {
            this.disposeMaximizedListener = windowApi.onMaximizedChange(isMaximized => {
                this.setMaximizedState(isMaximized);
            });
        }
        windowApi?.isMaximized?.().then(isMaximized => {
            this.setMaximizedState(isMaximized);
        }).catch(() => {});
    }

    destroy() {
        if (this.disposeMaximizedListener) {
            this.disposeMaximizedListener();
            this.disposeMaximizedListener = null;
        }
        if (typeof document !== 'undefined' && document.getElementById) {
            const dropdown = document.getElementById('titlebar-dropdown');
            if (dropdown && dropdown.parentElement) {
                dropdown.parentElement.removeChild(dropdown);
            }
        }
    }

    getDropdownElement() {
        if (typeof document === 'undefined') return null;
        let dropdown = document.getElementById ? document.getElementById('titlebar-dropdown') : null;
        if (!dropdown && document.createElement && document.body?.appendChild) {
            dropdown = document.createElement('div');
            dropdown.id = 'titlebar-dropdown';
            dropdown.className = 'titlebar-dropdown-container';
            if (dropdown.setAttribute) dropdown.setAttribute('role', 'menu');
            dropdown.style.display = 'none';
            document.body.appendChild(dropdown);
        }
        return dropdown;
    }

    render() {
        this.containerEl.className = 'titlebar custom-titlebar';
        if (this.containerEl?.setAttribute) {
            this.containerEl.setAttribute('role', 'banner');
            this.containerEl.setAttribute('aria-label', 'Application header');
        }

        this.containerEl.innerHTML = `
            <!-- Left: Brand Logo & 8 Application Menus -->
            <div class="titlebar-left">
                <div class="titlebar-brand" title="HEADROOM IDE — AI Development Operating System" aria-label="HEADROOM IDE">
                    <svg class="brand-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <polygon points="12 2 2 7 12 12 22 7 12 2" fill="#38BDF8"></polygon>
                        <polyline points="2 17 12 22 22 17" fill="none" stroke="#38BDF8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></polyline>
                        <polyline points="2 12 12 17 22 12" fill="none" stroke="#38BDF8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></polyline>
                    </svg>
                    <span class="brand-name">HEADROOM</span>
                </div>

                <nav class="titlebar-menu-bar" role="menubar" aria-label="Application menu">
                    <div class="menu-item" data-menu="file">
                        <button class="menu-trigger-btn" id="menu-btn-file" role="menuitem" aria-haspopup="true" aria-expanded="false">File</button>
                    </div>
                    <div class="menu-item" data-menu="edit">
                        <button class="menu-trigger-btn" id="menu-btn-edit" role="menuitem" aria-haspopup="true" aria-expanded="false">Edit</button>
                    </div>
                    <div class="menu-item" data-menu="selection">
                        <button class="menu-trigger-btn" id="menu-btn-selection" role="menuitem" aria-haspopup="true" aria-expanded="false">Selection</button>
                    </div>
                    <div class="menu-item" data-menu="view">
                        <button class="menu-trigger-btn" id="menu-btn-view" role="menuitem" aria-haspopup="true" aria-expanded="false">View</button>
                    </div>
                    <div class="menu-item" data-menu="go">
                        <button class="menu-trigger-btn" id="menu-btn-go" role="menuitem" aria-haspopup="true" aria-expanded="false">Go</button>
                    </div>
                    <div class="menu-item" data-menu="run">
                        <button class="menu-trigger-btn" id="menu-btn-run" role="menuitem" aria-haspopup="true" aria-expanded="false">Run</button>
                    </div>
                    <div class="menu-item" data-menu="terminal">
                        <button class="menu-trigger-btn" id="menu-btn-terminal" role="menuitem" aria-haspopup="true" aria-expanded="false">Terminal</button>
                    </div>
                    <div class="menu-item" data-menu="help">
                        <button class="menu-trigger-btn" id="menu-btn-help" role="menuitem" aria-haspopup="true" aria-expanded="false">Help</button>
                    </div>
                </nav>
            </div>

            <!-- Center: True Midpoint Workspace Title with Unsaved Changes Bullet -->
            <div class="titlebar-center" aria-live="polite">
                <div class="window-title-box" id="window-title-box" title="HEADROOM IDE">
                    <span class="title-project" id="title-project">HEADROOM</span>
                    <span class="title-context-separator title-workspace-separator" aria-hidden="true">/</span>
                    <span class="title-workspace" id="title-workspace"></span>
                    <span class="title-context-separator title-file-separator" aria-hidden="true">&rsaquo;</span>
                    <span class="title-file-path" id="title-file-path"></span>
                    <span class="save-dirty-indicator" id="titlebar-dirty-indicator" title="Unsaved changes" aria-label="Unsaved changes"></span>
                    <span class="window-title-text" id="window-title-text" style="display: none;"></span>
                </div>
            </div>

            <!-- Right: Panel Controls, Layout Settings, Runtime, Agent Badge & Native Window Controls -->
            <div class="titlebar-right">
                <div class="titlebar-tools" role="toolbar" aria-label="Editor and panel controls">
                    <!-- Split Editor -->
                    <button class="tb-tool-btn" id="tb-btn-split" title="Split Editor Right (Ctrl+\\)" aria-label="Split Editor">
                        <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3">
                            <rect x="2" y="2" width="12" height="12" rx="1.5"></rect>
                            <line x1="8" y1="2" x2="8" y2="14"></line>
                        </svg>
                    </button>
                    <!-- Toggle Primary Sidebar -->
                    <button class="tb-tool-btn active" id="tb-btn-toggle-sidebar" title="Toggle Primary Sidebar (Ctrl+B)" aria-label="Toggle Primary Sidebar" aria-pressed="true">
                        <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3">
                            <rect x="2" y="2" width="12" height="12" rx="1.5"></rect>
                            <line x1="6" y1="2" x2="6" y2="14"></line>
                        </svg>
                    </button>
                    <!-- Toggle Bottom Panel -->
                    <button class="tb-tool-btn active" id="tb-btn-toggle-bottom" title="Toggle Bottom Panel (Ctrl+\`)" aria-label="Toggle Bottom Panel" aria-pressed="true">
                        <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3">
                            <rect x="2" y="2" width="12" height="12" rx="1.5"></rect>
                            <line x1="2" y1="10" x2="14" y2="10"></line>
                        </svg>
                    </button>
                    <!-- Toggle Right Agent Utility Panel -->
                    <button class="tb-tool-btn active" id="tb-btn-toggle-agent" title="Toggle Agent Manager (Ctrl+Shift+A)" aria-label="Toggle Agent Manager" aria-pressed="true">
                        <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3">
                            <rect x="2" y="2" width="12" height="12" rx="1.5"></rect>
                            <line x1="10" y1="2" x2="10" y2="14"></line>
                        </svg>
                    </button>

                    <div class="titlebar-separator" aria-hidden="true"></div>

                    <!-- Layout Settings -->
                    <button class="tb-tool-btn" id="tb-btn-layout-settings" title="Layout & Settings" aria-label="Layout & Settings">
                        <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3">
                            <circle cx="8" cy="8" r="2.5"></circle>
                            <path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9"></path>
                        </svg>
                    </button>

                    <!-- Runtime Connection Indicator -->
                    <div class="runtime-status" id="titlebar-runtime-indicator" title="Runtime Status: Connected (Pure JavaScript)" aria-label="Runtime Status">
                        <span class="runtime-status-dot connected" id="titlebar-runtime-dot" aria-hidden="true"></span>
                        <span id="titlebar-runtime-status">${this.state.runtimeStatusLabel}</span>
                    </div>

                    <!-- Active Agent Count Badge -->
                    <div class="titlebar-agent-badge" id="titlebar-agent-badge" title="0 active workforce tasks" aria-label="Active Workforce Tasks">
                        <svg class="agent-badge-icon" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3">
                            <circle cx="6" cy="5" r="2.5"></circle>
                            <path d="M2 13v-1a4 4 0 0 1 8 0v1M11 4a2 2 0 0 1 0 4M12.5 13v-.5a3 3 0 0 0-2.5-2.8"></path>
                        </svg>
                        <span class="agent-count" id="titlebar-agent-count">0</span>
                    </div>
                </div>

                <!-- Native Window Controls -->
                <div class="window-controls" aria-label="Window controls">
                    <button class="win-btn win-min" id="window-min-btn" title="Minimize" aria-label="Minimize">
                        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 9h8"></path></svg>
                    </button>
                    <button class="win-btn win-max" id="window-max-btn" title="Maximize" aria-label="Maximize" aria-pressed="false">
                        <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="2" width="8" height="8"></rect></svg>
                    </button>
                    <button class="win-btn win-close" id="window-close-btn" title="Close" aria-label="Close">
                        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3 3 6 6M9 3 3 9"></path></svg>
                    </button>
                </div>
            </div>
        `;

        // Ensure floating dropdown container exists in body
        if (typeof document !== 'undefined' && document.getElementById) {
            let dropdown = document.getElementById('titlebar-dropdown');
            if (!dropdown && document.createElement && document.body?.appendChild) {
                dropdown = document.createElement('div');
                dropdown.id = 'titlebar-dropdown';
                dropdown.className = 'titlebar-dropdown-container';
                if (dropdown.setAttribute) dropdown.setAttribute('role', 'menu');
                dropdown.style.display = 'none';
                document.body.appendChild(dropdown);
            }
        }
    }

    setupEventListeners() {
        // Native window controls
        const minBtn = this.containerEl.querySelector('#window-min-btn');
        const maxBtn = this.containerEl.querySelector('#window-max-btn');
        const closeBtn = this.containerEl.querySelector('#window-close-btn');

        if (minBtn) {
            minBtn.onclick = () => window.headroomApi?.window?.minimize();
        }
        if (maxBtn) {
            maxBtn.onclick = () => window.headroomApi?.window?.maximize();
        }
        if (closeBtn) {
            closeBtn.onclick = () => window.headroomApi?.window?.close();
        }

        // Layout controls
        const splitBtn = this.containerEl.querySelector('#tb-btn-split');
        const sidebarBtn = this.containerEl.querySelector('#tb-btn-toggle-sidebar');
        const bottomBtn = this.containerEl.querySelector('#tb-btn-toggle-bottom');
        const agentBtn = this.containerEl.querySelector('#tb-btn-toggle-agent');
        const layoutSettingsBtn = this.containerEl.querySelector('#tb-btn-layout-settings');

        if (splitBtn) {
            splitBtn.onclick = () => {
                if (this.app?.editorManager) {
                    this.app.editorManager.splitEditor();
                    const isSplit = Boolean(this.app.editorManager.isSplit);
                    splitBtn.classList.toggle('active', isSplit);
                    splitBtn.setAttribute('aria-pressed', String(isSplit));
                }
            };
        }

        if (sidebarBtn) {
            sidebarBtn.onclick = () => {
                const sidebar = document.getElementById('sidebar');
                const splitter = document.getElementById('splitter-sidebar');
                if (!sidebar) return;
                const isHidden = sidebar.style.display === 'none';
                sidebar.style.display = isHidden ? 'flex' : 'none';
                if (splitter) splitter.style.display = isHidden ? 'block' : 'none';
                sidebarBtn.classList.toggle('active', isHidden);
                sidebarBtn.setAttribute('aria-pressed', String(isHidden));
            };
        }

        if (bottomBtn) {
            bottomBtn.onclick = () => {
                const panel = document.getElementById('bottom-panel');
                const splitter = document.getElementById('splitter-bottom');
                if (!panel) return;
                const isHidden = panel.style.display === 'none';
                panel.style.display = isHidden ? 'flex' : 'none';
                if (splitter) splitter.style.display = isHidden ? 'block' : 'none';
                bottomBtn.classList.toggle('active', isHidden);
                bottomBtn.setAttribute('aria-pressed', String(isHidden));
            };
        }

        if (agentBtn) {
            agentBtn.onclick = () => {
                const panel = document.getElementById('agent-panel');
                const splitter = document.getElementById('splitter-agent');
                if (!panel) return;
                const isHidden = panel.style.display === 'none';
                panel.style.display = isHidden ? 'flex' : 'none';
                if (splitter) splitter.style.display = isHidden ? 'block' : 'none';
                agentBtn.classList.toggle('active', isHidden);
                agentBtn.setAttribute('aria-pressed', String(isHidden));
            };
        }

        if (layoutSettingsBtn) {
            layoutSettingsBtn.onclick = () => {
                if (this.app?.switchSidebarTab) {
                    this.app.switchSidebarTab('settings');
                }
            };
        }

        // Application Menu Bar logic
        const menuItems = this.containerEl.querySelectorAll('.menu-item');
        for (const item of menuItems) {
            const btn = item.querySelector('.menu-trigger-btn');
            const menuName = item.dataset ? item.dataset.menu : null;
            if (!btn) continue;

            btn.onclick = (e) => {
                e.stopPropagation();
                if (this.activeMenu === menuName) {
                    this.closeDropdown();
                } else {
                    this.openMenu(menuName, btn);
                }
            };

            btn.onmouseenter = () => {
                if (this.activeMenu && this.activeMenu !== menuName) {
                    this.openMenu(menuName, btn);
                }
            };
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            if (this.activeMenu) this.closeDropdown();
        });
    }

    setupKeyboardNavigation() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.activeMenu) {
                const triggerBtn = this.containerEl.querySelector(`.menu-item[data-menu="${this.activeMenu}"] .menu-trigger-btn`);
                this.closeDropdown();
                if (triggerBtn) triggerBtn.focus();
                return;
            }

            if (!this.activeMenu) return;

            const dropdown = document.getElementById('titlebar-dropdown');
            if (!dropdown || dropdown.style.display === 'none') return;

            const items = Array.from(dropdown.querySelectorAll('.menu-dropdown-item:not(.disabled)'));
            if (items.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.focusedDropdownIndex = (this.focusedDropdownIndex + 1) % items.length;
                this.highlightDropdownItem(items, this.focusedDropdownIndex);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.focusedDropdownIndex = (this.focusedDropdownIndex - 1 + items.length) % items.length;
                this.highlightDropdownItem(items, this.focusedDropdownIndex);
            } else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (this.focusedDropdownIndex >= 0 && this.focusedDropdownIndex < items.length) {
                    items[this.focusedDropdownIndex].click();
                }
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                this.switchMenuAdjacent(1);
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                this.switchMenuAdjacent(-1);
            }
        });
    }

    highlightDropdownItem(items, index) {
        items.forEach((it, idx) => {
            it.classList.toggle('highlighted', idx === index);
            if (idx === index) it.scrollIntoView({ block: 'nearest' });
        });
    }

    switchMenuAdjacent(direction) {
        const menuOrder = ['file', 'edit', 'selection', 'view', 'go', 'run', 'terminal', 'help'];
        const currentIndex = menuOrder.indexOf(this.activeMenu);
        if (currentIndex === -1) return;

        const nextIndex = (currentIndex + direction + menuOrder.length) % menuOrder.length;
        const nextMenu = menuOrder[nextIndex];
        const btn = this.containerEl.querySelector(`.menu-item[data-menu="${nextMenu}"] .menu-trigger-btn`);
        if (btn) {
            this.openMenu(nextMenu, btn);
        }
    }

    setMaximizedState(isMaximized) {
        this.isMaximized = Boolean(isMaximized);
        const maxBtn = this.containerEl.querySelector('#window-max-btn');
        if (!maxBtn) return;

        maxBtn.innerHTML = this.isMaximized
            ? '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="3.5" y="1.5" width="7" height="7"/><path d="M2 4.5v6h6"/></svg>'
            : '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="2" width="8" height="8"/></svg>';
        maxBtn.title = this.isMaximized ? 'Restore' : 'Maximize';
        maxBtn.setAttribute('aria-label', maxBtn.title);
        maxBtn.dataset.windowState = this.isMaximized ? 'maximized' : 'restored';
        maxBtn.setAttribute('aria-pressed', String(this.isMaximized));
    }

    setState({
        projectTitle = this.state.projectTitle,
        currentFolderName = this.state.currentFolderName,
        currentFolderPath = this.state.currentFolderPath,
        activeFilePath = this.state.activeFilePath,
        isUnsavedChanges = this.state.isUnsavedChanges,
        totalAgentCount = this.state.totalAgentCount,
        activeTaskCount = this.state.activeTaskCount,
        runtimeStatus = this.state.runtimeStatus,
        runtimeStatusLabel = this.state.runtimeStatusLabel
    } = {}) {
        this.state = {
            projectTitle,
            currentFolderName,
            currentFolderPath,
            activeFilePath,
            isUnsavedChanges,
            totalAgentCount,
            activeTaskCount,
            runtimeStatus,
            runtimeStatusLabel
        };

        const projectEl = this.containerEl.querySelector('#title-project');
        const workspaceEl = this.containerEl.querySelector('#title-workspace');
        const workspaceSeparator = this.containerEl.querySelector('.title-workspace-separator');
        const fileEl = this.containerEl.querySelector('#title-file-path');
        const fileSeparator = this.containerEl.querySelector('.title-file-separator');
        const boxEl = this.containerEl.querySelector('#window-title-box');
        if (!projectEl || !workspaceEl || !fileEl || !boxEl) return;

        projectEl.textContent = currentFolderName ? projectTitle : 'HEADROOM IDE';
        workspaceEl.textContent = currentFolderName;
        workspaceEl.hidden = !currentFolderName;
        if (workspaceSeparator) workspaceSeparator.hidden = !currentFolderName && !activeFilePath;
        fileEl.textContent = activeFilePath;
        fileEl.hidden = !activeFilePath;
        if (fileSeparator) fileSeparator.hidden = !activeFilePath;

        boxEl.title = [projectTitle, currentFolderPath, activeFilePath].filter(Boolean).join(' - ');

        const dirtyIndicator = this.containerEl.querySelector('#titlebar-dirty-indicator');
        if (dirtyIndicator) {
            dirtyIndicator.classList.toggle('visible', Boolean(isUnsavedChanges));
            dirtyIndicator.title = isUnsavedChanges ? 'Unsaved changes' : 'All changes saved';
        }

        const countEl = this.containerEl.querySelector('#titlebar-agent-count');
        const badgeEl = this.containerEl.querySelector('#titlebar-agent-badge');
        if (countEl) {
            const count = Math.max(0, Number(activeTaskCount || totalAgentCount) || 0);
            countEl.textContent = String(count);
            if (badgeEl) {
                badgeEl.title = `${count} active workforce task${count === 1 ? '' : 's'}`;
                badgeEl.setAttribute('aria-label', `${count} active workforce tasks`);
            }
        }

        const runtimeStatusEl = this.containerEl.querySelector('#titlebar-runtime-status');
        const runtimeDotEl = this.containerEl.querySelector('#titlebar-runtime-dot');
        const runtimeIndicatorEl = this.containerEl.querySelector('#titlebar-runtime-indicator');

        if (runtimeStatusEl) runtimeStatusEl.textContent = runtimeStatusLabel;
        if (runtimeDotEl) {
            runtimeDotEl.className = `runtime-status-dot ${runtimeStatus}`;
        }
        if (runtimeIndicatorEl) {
            runtimeIndicatorEl.title = `Runtime Status: ${runtimeStatus.toUpperCase()} (${runtimeStatusLabel})`;
        }

        const titleTextEl = this.containerEl.querySelector('#window-title-text');
        if (titleTextEl) {
            const parts = [];
            if (activeFilePath) {
                const fname = activeFilePath.split(/[\/\\]/).pop();
                parts.push(isUnsavedChanges ? (fname + ' •') : fname);
            }
            if (currentFolderName) parts.push(currentFolderName);
            parts.push(projectTitle);
            titleTextEl.textContent = parts.join(' — ');
        }
    }

    updateTitle(activeTab, workspace) {
        const agents = this.app?.agentManager?.hierarchy?.agents;
        const tasks = this.app?.agentManager?.tasks;
        const activeTasks = Array.isArray(tasks) ? tasks.filter(t => t.status === 'RUNNING' || t.status === 'IN_PROGRESS').length : 0;

        this.setState({
            projectTitle: 'HEADROOM IDE',
            currentFolderName: workspace?.name || '',
            currentFolderPath: workspace?.path || '',
            activeFilePath: activeTab?.relativePath || activeTab?.path || activeTab?.name || '',
            isUnsavedChanges: Boolean(activeTab?.dirty),
            totalAgentCount: Array.isArray(agents) ? agents.length : 0,
            activeTaskCount: activeTasks,
            runtimeStatus: window.headroomApi ? 'connected' : 'disconnected',
            runtimeStatusLabel: window.headroomApi ? 'Ready' : 'Offline'
        });
    }

    openMenu(menuName, buttonEl) {
        this.activeMenu = menuName;
        this.focusedDropdownIndex = -1;
        const dropdown = this.getDropdownElement();
        if (!dropdown) return;

        const rect = buttonEl.getBoundingClientRect ? buttonEl.getBoundingClientRect() : { left: 0, bottom: 38 };
        dropdown.style.left = `${Math.round(rect.left)}px`;
        dropdown.style.top = `${Math.round(rect.bottom)}px`;
        dropdown.style.display = 'block';

        const allBtns = this.containerEl.querySelectorAll('.menu-trigger-btn');
        allBtns.forEach(b => {
            b.classList.remove('active');
            if (b.setAttribute) b.setAttribute('aria-expanded', 'false');
        });
        buttonEl.classList.add('active');
        if (buttonEl.setAttribute) buttonEl.setAttribute('aria-expanded', 'true');

        dropdown.innerHTML = this.getMenuItemsHtml(menuName);

        const actions = dropdown.querySelectorAll('.menu-dropdown-item:not(.disabled)');
        for (const action of actions) {
            action.onclick = (e) => {
                if (e?.stopPropagation) e.stopPropagation();
                const actionId = action.dataset?.action;
                this.executeMenuAction(actionId);
                this.closeDropdown();
            };
        }
    }

    closeDropdown() {
        this.activeMenu = null;
        this.focusedDropdownIndex = -1;
        const dropdown = typeof document !== 'undefined' && document.getElementById ? document.getElementById('titlebar-dropdown') : null;
        if (dropdown) dropdown.style.display = 'none';

        const allBtns = this.containerEl.querySelectorAll('.menu-trigger-btn');
        allBtns.forEach(b => {
            b.classList.remove('active');
            if (b.setAttribute) b.setAttribute('aria-expanded', 'false');
        });
    }

    getMenuItemsHtml(menu) {
        const items = this.getMenuStructure()[menu] || [];
        return items.map(item => {
            if (item.separator) {
                return '<div class="menu-dropdown-separator" role="separator" aria-hidden="true"></div>';
            }
            const disabledClass = item.disabled ? ' disabled' : '';
            return `
                <div class="menu-dropdown-item${disabledClass}" data-action="${item.id}" role="menuitem" tabindex="-1">
                    <span class="menu-item-label">${item.label}</span>
                    ${item.shortcut ? `<span class="menu-item-shortcut">${item.shortcut}</span>` : ''}
                </div>
            `;
        }).join('');
    }

    getMenuStructure() {
        return {
            file: [
                { id: 'file:new', label: 'New File', shortcut: 'Ctrl+N' },
                { id: 'file:open', label: 'Open File...', shortcut: 'Ctrl+O' },
                { id: 'file:openFolder', label: 'Open Folder...', shortcut: 'Ctrl+K Ctrl+O' },
                { separator: true },
                { id: 'file:save', label: 'Save', shortcut: 'Ctrl+S' },
                { id: 'file:saveAll', label: 'Save All', shortcut: 'Ctrl+K S' },
                { id: 'file:close', label: 'Close Tab', shortcut: 'Ctrl+W' },
                { separator: true },
                { id: 'file:exit', label: 'Exit', shortcut: 'Alt+F4' }
            ],
            edit: [
                { id: 'edit:undo', label: 'Undo', shortcut: 'Ctrl+Z' },
                { id: 'edit:redo', label: 'Redo', shortcut: 'Ctrl+Y' },
                { separator: true },
                { id: 'edit:cut', label: 'Cut', shortcut: 'Ctrl+X' },
                { id: 'edit:copy', label: 'Copy', shortcut: 'Ctrl+C' },
                { id: 'edit:paste', label: 'Paste', shortcut: 'Ctrl+V' },
                { separator: true },
                { id: 'edit:formatDocument', label: 'Format Document', shortcut: 'Shift+Alt+F' },
                { separator: true },
                { id: 'edit:find', label: 'Find in Workspace', shortcut: 'Ctrl+Shift+F' }
            ],
            selection: [
                { id: 'selection:selectAll', label: 'Select All', shortcut: 'Ctrl+A' },
                { id: 'selection:expand', label: 'Expand Selection', shortcut: 'Alt+Shift+Right' },
                { id: 'selection:copyLineDown', label: 'Copy Line Down', shortcut: 'Shift+Alt+Down' }
            ],
            view: [
                { id: 'view:toggleSidebar', label: 'Toggle Primary Sidebar', shortcut: 'Ctrl+B' },
                { id: 'view:toggleAgent', label: 'Toggle Agent Manager', shortcut: 'Ctrl+Shift+A' },
                { id: 'view:toggleTerminal', label: 'Toggle Bottom Panel', shortcut: 'Ctrl+`' },
                { id: 'view:splitEditor', label: 'Split Editor Right', shortcut: 'Ctrl+\\' },
                { separator: true },
                { id: 'view:extensions', label: 'Extensions Marketplace', shortcut: 'Ctrl+Shift+X' }
            ],
            go: [
                { id: 'go:file', label: 'Go to File...', shortcut: 'Ctrl+P' },
                { id: 'go:line', label: 'Go to Line...', shortcut: 'Ctrl+G' },
                { separator: true },
                { id: 'go:git', label: 'Go to Source Control', shortcut: 'Ctrl+Shift+G' }
            ],
            run: [
                { id: 'run:activeFile', label: 'Run Active File (Safe Execution)', shortcut: 'Ctrl+F5' },
                { id: 'run:debugActiveFile', label: 'Debug Active File (V8 Inspector)', shortcut: 'F5' },
                { id: 'run:stopDebug', label: 'Stop Debugging Session', shortcut: 'Shift+F5' },
                { separator: true },
                { id: 'run:test', label: 'Run Project Tests', shortcut: 'Ctrl+Shift+T' }
            ],
            terminal: [
                { id: 'terminal:new', label: 'New Terminal', shortcut: 'Ctrl+Shift+`' },
                { id: 'terminal:clear', label: 'Clear Output', shortcut: 'Ctrl+K' },
                { id: 'terminal:kill', label: 'Kill Active Session', shortcut: '' }
            ],
            help: [
                { id: 'help:extensions', label: 'Open VSX Extension Registry', shortcut: '' },
                { id: 'help:agentWorkflow', label: 'HEADROOM Workforce Overview', shortcut: '' },
                { separator: true },
                { id: 'help:about', label: 'About HEADROOM IDE', shortcut: '' }
            ]
        };
    }

    async executeMenuAction(actionId) {
        switch (actionId) {
            case 'file:new': {
                const name = prompt('Enter new file name:');
                if (name && this.app?.currentWorkspace) {
                    const full = `${this.app.currentWorkspace.path}\\${name}`;
                    await window.headroomApi?.workspace?.createFile(full, '');
                    await this.app.refreshTree?.();
                    this.app.openFile?.(full);
                }
                break;
            }
            case 'file:open':
                this.app?.openFileDialog?.();
                break;
            case 'file:openFolder': {
                const ws = await window.headroomApi?.workspace?.openDirectoryDialog();
                if (ws) await this.app?.loadWorkspace?.();
                break;
            }
            case 'file:save':
                this.app?.editorManager?.saveActiveFile?.();
                break;
            case 'file:saveAll': {
                const tabs = this.app?.editorManager?.openTabs || [];
                for (const t of tabs) {
                    if (t.dirty) {
                        await this.app.editorManager.saveTab?.(t.id);
                    }
                }
                break;
            }
            case 'file:close': {
                const tab = this.app?.editorManager?.getActiveTab?.();
                if (tab) this.app.editorManager.closeTab(tab.id);
                break;
            }
            case 'file:exit':
                window.headroomApi?.window?.close();
                break;
            case 'edit:undo':
            case 'edit:redo':
            case 'edit:cut':
            case 'edit:copy':
            case 'edit:paste':
            case 'selection:selectAll':
                document.execCommand(actionId.split(':')[1]);
                break;
            case 'edit:formatDocument':
                if (this.app?.editorManager) {
                    await this.app.editorManager.formatActiveFile?.();
                }
                break;
            case 'edit:find': {
                const q = prompt('Search workspace:');
                if (q && window.headroomApi?.workspace?.searchFiles) {
                    const res = await window.headroomApi.workspace.searchFiles(q);
                    if (res && res[0]) this.app.openFile?.(res[0].path);
                }
                break;
            }
            case 'view:toggleSidebar': {
                const btn = this.containerEl.querySelector('#tb-btn-toggle-sidebar');
                if (btn) btn.click();
                break;
            }
            case 'view:toggleAgent': {
                const btn = this.containerEl.querySelector('#tb-btn-toggle-agent');
                if (btn) btn.click();
                break;
            }
            case 'view:toggleTerminal': {
                const btn = this.containerEl.querySelector('#tb-btn-toggle-bottom');
                if (btn) btn.click();
                break;
            }
            case 'view:splitEditor': {
                const btn = this.containerEl.querySelector('#tb-btn-split');
                if (btn) btn.click();
                break;
            }
            case 'view:extensions':
                this.app?.switchSidebarTab?.('extensions');
                break;
            case 'go:file':
                this.app?.openFileDialog?.();
                break;
            case 'go:line': {
                const line = prompt('Go to line number:');
                if (line && this.app?.editorManager?.goToLine) {
                    this.app.editorManager.goToLine(parseInt(line, 10));
                }
                break;
            }
            case 'go:git':
                this.app?.switchSidebarTab?.('git');
                break;
            case 'run:activeFile':
                if (this.app?.runActiveFile) {
                    await this.app.runActiveFile();
                }
                break;
            case 'run:debugActiveFile':
                if (this.app?.debugActiveFile) {
                    await this.app.debugActiveFile();
                }
                break;
            case 'run:stopDebug':
                if (this.app?.activeDebugSessionId && window.headroomApi?.debugger?.stop) {
                    await window.headroomApi.debugger.stop(this.app.activeDebugSessionId);
                }
                break;
            case 'run:test': {
                const term = document.getElementById('bottom-panel');
                if (term && term.style.display === 'none') term.style.display = 'flex';
                window.headroomApi?.terminal?.sendInput(null, `npm test\r`);
                break;
            }
            case 'terminal:new': {
                const ws = this.app?.currentWorkspace ? this.app.currentWorkspace.path : process.cwd();
                this.app?.terminalView?.startSession?.(ws);
                break;
            }
            case 'terminal:clear':
                this.app?.terminalView?.clear?.();
                break;
            case 'terminal:kill':
                this.app?.terminalView?.kill?.();
                break;
            case 'help:extensions':
                this.app?.switchSidebarTab?.('extensions');
                break;
            case 'help:agentWorkflow':
                this.app?.focusAgentComposer?.();
                break;
            case 'help:about':
                alert('HEADROOM IDE v0.1.0\nStandalone Desktop AI Development Operating System\nPure JavaScript Architecture.');
                break;
        }
    }
}
