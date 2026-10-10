import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';

// Lightweight DOM mock for Node environment
class MockElement {
    constructor(tagName = 'div') {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.style = {};
        this.dataset = {};
        this.attributes = {};
        this._innerHTML = '';
        this._textContent = '';
        this._className = '';
        this.classList = {
            _set: new Set(),
            add: (c) => {
                this.classList._set.add(c);
                this._className = Array.from(this.classList._set).join(' ');
            },
            remove: (c) => {
                this.classList._set.delete(c);
                this._className = Array.from(this.classList._set).join(' ');
            },
            contains: (c) => this.classList._set.has(c),
            toggle: (c, v) => (v ?? !this.classList.contains(c)) ? this.classList.add(c) : this.classList.remove(c)
        };
    }

    get className() {
        return this._className;
    }

    set className(val) {
        this._className = val || '';
        this.classList._set.clear();
        if (typeof val === 'string') {
            val.split(/\s+/).filter(Boolean).forEach(c => this.classList._set.add(c));
        }
    }

    setAttribute(name, val) {
        this.attributes[name] = String(val);
    }

    removeAttribute(name) {
        delete this.attributes[name];
    }

    get innerHTML() {
        return this._innerHTML;
    }

    set innerHTML(val) {
        this._innerHTML = val;
        this.children = [];
        const tagRegex = /<([a-zA-Z0-9-]+)([^>]*)>/g;
        let match;
        while ((match = tagRegex.exec(val)) !== null) {
            const tagName = match[1];
            if (['svg', 'path', 'rect'].includes(tagName.toLowerCase())) continue;
            const attrs = match[2];
            const child = new MockElement(tagName);

            const idMatch = attrs.match(/id=["']([^"']+)["']/);
            if (idMatch) child.id = idMatch[1];

            const classMatch = attrs.match(/class=["']([^"']+)["']/);
            if (classMatch) {
                child.className = classMatch[1];
            }

            const titleMatch = attrs.match(/title=["']([^"']+)["']/);
            if (titleMatch) child.title = titleMatch[1];

            const roleMatch = attrs.match(/role=["']([^"']+)["']/);
            if (roleMatch) child.setAttribute('role', roleMatch[1]);

            const ariaMatches = attrs.match(/aria-[a-zA-Z0-9-]+=["'][^"']*["']/g);
            if (ariaMatches) {
                for (const am of ariaMatches) {
                    const [k, v] = am.split('=');
                    child.setAttribute(k, v.replace(/["']/g, ''));
                }
            }

            const dataMatches = [...attrs.matchAll(/data-([a-zA-Z0-9-]+)=["']([^"']+)["']/g)];
            for (const dm of dataMatches) {
                const camelKey = dm[1].replace(/-([a-z])/g, (_, g) => g.toUpperCase());
                child.dataset[camelKey] = dm[2];
            }

            this.children.push(child);
        }
    }

    get textContent() {
        return this._textContent || this._innerHTML.replace(/<[^>]+>/g, '');
    }

    set textContent(val) {
        this._textContent = val;
    }

    appendChild(child) {
        this.children.push(child);
        return child;
    }

    addEventListener(evt, fn) {
        this[`on${evt}`] = fn;
    }

    getBoundingClientRect() {
        return { left: 100, top: 0, bottom: 38, right: 150 };
    }

    querySelector(selector) {
        const matches = this.querySelectorAll(selector);
        return matches.length > 0 ? matches[0] : null;
    }

    querySelectorAll(selector) {
        const results = [];
        const check = (node) => {
            if (node !== this) {
                if (selector.startsWith('#') && node.id === selector.slice(1)) {
                    results.push(node);
                } else if (selector.startsWith('.')) {
                    const cls = selector.split(':')[0].slice(1);
                    if (node.classList && node.classList.contains(cls)) {
                        results.push(node);
                    }
                } else if (selector.startsWith('[data-action=') && node.dataset && selector.includes(node.dataset.action)) {
                    results.push(node);
                }
            }
            for (const c of node.children) check(c);
        };
        check(this);
        return results;
    }
}

describe('Custom Title Bar & Open VSX Marketplace Integration', () => {
    beforeAll(() => {
        global.document = {
            createElement: (tag) => new MockElement(tag),
            body: new MockElement('body'),
            getElementById: (id) => global.document.body.querySelector('#' + id),
            addEventListener: () => {},
            removeEventListener: () => {}
        };
        global.window = {
            document: global.document,
            addEventListener: () => {},
            removeEventListener: () => {}
        };
    });

    afterAll(() => {
        delete global.document;
        delete global.window;
    });

    it('validates the unified integration workspace directory structure and manifest', () => {
        const root = path.resolve(__dirname, '..');
        const manifestPath = path.join(root, 'integrations', 'manifest.json');
        expect(fs.existsSync(manifestPath)).toBe(true);

        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        expect(manifest.integrations.length).toBe(4);

        const ids = manifest.integrations.map(i => i.id);
        expect(ids).toContain('headroom-engine');
        expect(ids).toContain('agency-agents');
        expect(ids).toContain('zed-reference');
        expect(ids).toContain('open-vsx-marketplace');

        // Verify agency-agents capabilityMap exists
        const capMapPath = path.join(root, 'integrations', 'agency-agents', 'capabilityMap.json');
        expect(fs.existsSync(capMapPath)).toBe(true);
    });

    it('validates TitleBar menu structure contains all 8 required application menus', async () => {
        const { TitleBarManager } = await import('../src/renderer/js/titlebar/titleBarManager.js');
        const dummyEl = new MockElement('header');
        const titlebar = new TitleBarManager({ containerEl: dummyEl, app: {} });

        const menus = titlebar.getMenuStructure();
        const keys = Object.keys(menus);
        expect(keys).toEqual(['file', 'edit', 'selection', 'view', 'go', 'run', 'terminal', 'help']);

        // Verify File menu items
        const fileItems = menus.file.map(i => i.id || 'sep');
        expect(fileItems).toContain('file:new');
        expect(fileItems).toContain('file:open');
        expect(fileItems).toContain('file:save');
        expect(fileItems).toContain('file:close');

        // Verify View menu items
        const viewItems = menus.view.map(i => i.id || 'sep');
        expect(viewItems).toContain('view:toggleSidebar');
        expect(viewItems).toContain('view:toggleTerminal');
        expect(viewItems).toContain('view:extensions');
    });

    it('validates dynamic window title formatting logic', async () => {
        const { TitleBarManager } = await import('../src/renderer/js/titlebar/titleBarManager.js');
        const dummyEl = new MockElement('header');
        const titlebar = new TitleBarManager({ containerEl: dummyEl, app: {} });

        titlebar.updateTitle(
            { name: 'engine.js', path: 'src/core/engine.js', dirty: true },
            { name: 'headroom', path: 'D:/codex room/headroom' }
        );

        const titleEl = dummyEl.querySelector('#window-title-text');
        expect(titleEl).toBeDefined();
        expect(titleEl.textContent).toBe('engine.js • — headroom — HEADROOM IDE');
    });

    it('validates ExtensionView helper methods for formatting numbers', async () => {
        const { ExtensionView } = await import('../src/renderer/js/extensions/extensionView.js');
        const dummyEl = new MockElement('div');
        const view = new ExtensionView({ containerEl: dummyEl });

        expect(view.formatNumber(1500000)).toBe('1.5M');
        expect(view.formatNumber(24500)).toBe('24.5k');
        expect(view.formatNumber(85)).toBe('85');
    });

    it('enforces zero TypeScript in integrations and application source code', () => {
        const root = path.resolve(__dirname, '..');
        const dirsToCheck = ['src', 'integrations', 'scripts'];

        for (const dir of dirsToCheck) {
            const fullDir = path.join(root, dir);
            if (!fs.existsSync(fullDir)) continue;

            const checkRecursive = (dirPath) => {
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                for (const entry of entries) {
                    const full = path.join(dirPath, entry.name);
                    if (entry.isDirectory()) {
                        if (entry.name !== 'node_modules' && entry.name !== '.git') {
                            checkRecursive(full);
                        }
                    } else {
                        const ext = path.extname(entry.name).toLowerCase();
                        expect(ext).not.toBe('.ts');
                        expect(ext).not.toBe('.tsx');
                    }
                }
            };
            checkRecursive(fullDir);
        }
    });

    it('verifies native window controls maximize/restore state synchronization and cleanup', async () => {
        const { TitleBarManager } = await import('../src/renderer/js/titlebar/titleBarManager.js');
        const dummyEl = new MockElement('header');
        let unmaximizedCalled = false;

        global.window.headroomApi = {
            window: {
                minimize: () => {},
                maximize: () => {},
                close: () => {},
                isMaximized: async () => false,
                onMaximizedChange: (cb) => {
                    return () => { unmaximizedCalled = true; };
                }
            }
        };

        const titlebar = new TitleBarManager({ containerEl: dummyEl, app: {} });
        titlebar.setMaximizedState(true);
        expect(titlebar.isMaximized).toBe(true);

        const maxBtn = dummyEl.querySelector('#window-max-btn');
        expect(maxBtn.title).toBe('Restore');
        expect(maxBtn.attributes['aria-pressed']).toBe('true');

        titlebar.setMaximizedState(false);
        expect(titlebar.isMaximized).toBe(false);
        expect(maxBtn.title).toBe('Maximize');
        expect(maxBtn.attributes['aria-pressed']).toBe('false');

        // Test cleanup
        titlebar.destroy();
        expect(unmaximizedCalled).toBe(true);
    });

    it('verifies menu opening, closing, and dropdown population', async () => {
        const { TitleBarManager } = await import('../src/renderer/js/titlebar/titleBarManager.js');
        const dummyEl = new MockElement('header');
        const titlebar = new TitleBarManager({ containerEl: dummyEl, app: {} });

        const fileBtn = dummyEl.querySelector('#menu-btn-file');
        expect(fileBtn).toBeDefined();

        titlebar.openMenu('file', fileBtn);
        expect(titlebar.activeMenu).toBe('file');
        expect(fileBtn.classList.contains('active')).toBe(true);

        titlebar.closeDropdown();
        expect(titlebar.activeMenu).toBeNull();
        expect(fileBtn.classList.contains('active')).toBe(false);
    });

    it('verifies dirty indicator, runtime status states, and active agent telemetry badge', async () => {
        const { TitleBarManager } = await import('../src/renderer/js/titlebar/titleBarManager.js');
        const dummyEl = new MockElement('header');
        const titlebar = new TitleBarManager({ containerEl: dummyEl, app: {} });

        // Update state with dirty file, active tasks, and connecting status
        titlebar.setState({
            projectTitle: 'HEADROOM',
            currentFolderName: 'my-project',
            activeFilePath: 'src/main.js',
            isUnsavedChanges: true,
            activeTaskCount: 3,
            runtimeStatus: 'connecting',
            runtimeStatusLabel: 'Connecting...'
        });

        const dirtyEl = dummyEl.querySelector('#titlebar-dirty-indicator');
        expect(dirtyEl.classList.contains('visible')).toBe(true);

        const countEl = dummyEl.querySelector('#titlebar-agent-count');
        expect(countEl.textContent).toBe('3');

        const runtimeStatusEl = dummyEl.querySelector('#titlebar-runtime-status');
        expect(runtimeStatusEl.textContent).toBe('Connecting...');

        const runtimeDotEl = dummyEl.querySelector('#titlebar-runtime-dot');
        expect(runtimeDotEl.className).toContain('connecting');
    });
});
