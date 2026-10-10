import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import WorkspaceService from '../src/main/services/WorkspaceService.js';

describe('WorkspaceService', () => {
    let service;
    const testDir = path.join(__dirname, 'temp_workspace_test');

    beforeEach(() => {
        service = new WorkspaceService();
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

    it('sets and gets workspace directory correctly', () => {
        const ws = service.setWorkspace(testDir);
        expect(ws.name).toBe('temp_workspace_test');
        expect(service.getWorkspace().path).toBe(path.resolve(testDir));
    });

    it('creates, writes, and reads files correctly', () => {
        service.setWorkspace(testDir);
        const targetFile = path.join(testDir, 'sample.txt');

        const created = service.createFile(targetFile, 'Hello HEADROOM');
        expect(created.name).toBe('sample.txt');

        const read = service.readFile(targetFile);
        expect(read.content).toBe('Hello HEADROOM');

        service.writeFile(targetFile, 'Updated content');
        const readUpdated = service.readFile(targetFile);
        expect(readUpdated.content).toBe('Updated content');
    });

    it('builds a directory tree excluding ignored folders', () => {
        service.setWorkspace(testDir);
        fs.mkdirSync(path.join(testDir, 'src'));
        fs.writeFileSync(path.join(testDir, 'src', 'index.js'), 'console.log(1);');
        fs.mkdirSync(path.join(testDir, 'node_modules'));
        fs.writeFileSync(path.join(testDir, 'node_modules', 'dummy.js'), '');

        const tree = service.readDirectoryTree(testDir);
        expect(tree.length).toBe(1);
        expect(tree[0].name).toBe('src');
        expect(tree[0].isDirectory).toBe(true);
        expect(tree[0].children.length).toBe(1);
        expect(tree[0].children[0].name).toBe('index.js');
    });

    it('searches for text across files in workspace', () => {
        service.setWorkspace(testDir);
        fs.writeFileSync(path.join(testDir, 'a.js'), 'const secret = "Antigravity";');
        fs.writeFileSync(path.join(testDir, 'b.js'), 'const normal = "nothing";');

        const results = service.searchFiles('Antigravity');
        expect(results.length).toBe(1);
        expect(results[0].fileName).toBe('a.js');
        expect(results[0].lineNumber).toBe(1);
    });

    it('deletes entries cleanly', () => {
        service.setWorkspace(testDir);
        const file = path.join(testDir, 'delete_me.txt');
        service.createFile(file, 'bye');
        expect(fs.existsSync(file)).toBe(true);

        const res = service.deleteEntry(file);
        expect(res.success).toBe(true);
        expect(fs.existsSync(file)).toBe(false);
    });
});
