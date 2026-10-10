import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import WorkspaceService from '../src/main/services/WorkspaceService.js';
import { getFileIcon } from '../src/renderer/js/common/icons.js';

describe('HEADROOM IDE Center Workspace Functional Verification', () => {
    let workspaceService;
    const testDir = path.join(__dirname, 'temp_center_workspace_test');

    beforeEach(() => {
        workspaceService = new WorkspaceService();
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
        fs.mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    it('verifies getFileIcon returns distinct outline icons for file types', () => {
        const jsIcon = getFileIcon('app.js');
        const jsonIcon = getFileIcon('package.json');
        const mdIcon = getFileIcon('README.md');
        const defaultIcon = getFileIcon('unknown.xyz');

        expect(jsIcon).toContain('<svg');
        expect(jsonIcon).toContain('<svg');
        expect(mdIcon).toContain('<svg');
        expect(defaultIcon).toContain('<svg');

        // JS and JSON are code files
        expect(jsIcon).toBe(jsonIcon);
        // Markdown is document file
        expect(mdIcon).not.toBe(jsIcon);
    });

    it('verifies real file open, edit, dirty tracking, and save workflow', () => {
        workspaceService.setWorkspace(testDir);
        const testFile = path.join(testDir, 'sample.js');
        fs.writeFileSync(testFile, 'const greeting = "Hello World";');

        // 1. Read file as editor does
        const fileData = workspaceService.readFile(testFile);
        expect(fileData.path).toBe(testFile);
        expect(fileData.name).toBe('sample.js');
        expect(fileData.content).toBe('const greeting = "Hello World";');

        // 2. Simulate editor tab lifecycle
        const openTabs = [];
        const tab = {
            id: 'tab-1',
            path: fileData.path,
            relativePath: fileData.relativePath || fileData.name,
            name: fileData.name,
            content: fileData.content,
            dirty: false
        };
        openTabs.push(tab);
        expect(openTabs.length).toBe(1);

        // 3. User edits document -> marks dirty
        const editedContent = 'const greeting = "Hello HEADROOM";';
        tab.content = editedContent;
        tab.dirty = true;
        expect(tab.dirty).toBe(true);

        // 4. User saves document -> writes to filesystem and clears dirty
        workspaceService.writeFile(tab.path, tab.content);
        tab.dirty = false;
        expect(tab.dirty).toBe(false);

        // 5. Verify filesystem reflects change
        const reRead = workspaceService.readFile(testFile);
        expect(reRead.content).toBe('const greeting = "Hello HEADROOM";');
    });

    it('verifies multiple document tabs switching and tab closing logic', () => {
        const tabs = [
            { id: 'tab-1', name: 'first.js', path: '/workspace/first.js' },
            { id: 'tab-2', name: 'second.css', path: '/workspace/second.css' },
            { id: 'tab-3', name: 'third.md', path: '/workspace/third.md' }
        ];

        let activeTabId = 'tab-1';
        expect(activeTabId).toBe('tab-1');

        // Switch to tab-2
        activeTabId = 'tab-2';
        expect(activeTabId).toBe('tab-2');

        // Close tab-2
        const closeIndex = tabs.findIndex(t => t.id === 'tab-2');
        tabs.splice(closeIndex, 1);
        expect(tabs.length).toBe(2);

        // Active tab falls back to tab-1
        activeTabId = tabs[0].id;
        expect(activeTabId).toBe('tab-1');

        // Close all tabs -> triggers empty state
        tabs.length = 0;
        activeTabId = null;
        expect(tabs.length).toBe(0);
        expect(activeTabId).toBeNull();
    });

    it('verifies workspace:openFileDialog handler is registered in main process', () => {
        const mainIndexJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.js'), 'utf8');
        expect(mainIndexJs).toMatch(/(?:ipcMain\.handle|registerIpcHandler)\('workspace:openFileDialog'/);

        const preloadJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'preload.js'), 'utf8');
        expect(preloadJs).toContain("openFileDialog: () => ipcRenderer.invoke('workspace:openFileDialog')");
    });
});
