import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import WorkspaceService from '../src/main/services/WorkspaceService.js';

const temporaryDirectories = [];

function createWorkspaceFixture() {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'headroom-workspace-boundary-'));
    temporaryDirectories.push(parent);
    const workspace = path.join(parent, 'workspace');
    const outside = path.join(parent, 'outside');
    fs.mkdirSync(workspace);
    fs.mkdirSync(outside);
    const externalFile = path.join(outside, 'selected.txt');
    fs.writeFileSync(externalFile, 'authorized by native dialog');
    const service = new WorkspaceService();
    service.setWorkspace(workspace);
    return { parent, workspace, outside, externalFile, service };
}

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('WorkspaceService path boundary', () => {
    it('rejects traversal and absolute paths outside the selected workspace', () => {
        const { workspace, outside, service } = createWorkspaceFixture();
        const outsideFile = path.join(outside, 'selected.txt');
        expect(() => service.readFile(path.relative(workspace, outsideFile))).toThrow(/outside the active workspace/i);
        expect(() => service.readFile(outsideFile)).toThrow(/outside the active workspace/i);
        expect(() => service.writeFile(outsideFile, 'overwrite')).toThrow(/outside the active workspace/i);
        expect(() => service.deleteEntry(outsideFile)).toThrow(/outside the active workspace/i);
        expect(fs.readFileSync(outsideFile, 'utf8')).toBe('authorized by native dialog');
    });

    it('grants access only to the exact file selected through the native dialog', () => {
        const { outside, externalFile, service } = createWorkspaceFixture();
        const sibling = path.join(outside, 'sibling.txt');
        fs.writeFileSync(sibling, 'not selected');
        service.grantUserSelectedFile(externalFile);
        expect(service.readFile(externalFile).content).toBe('authorized by native dialog');
        service.writeFile(externalFile, 'saved selected file');
        expect(fs.readFileSync(externalFile, 'utf8')).toBe('saved selected file');
        expect(() => service.readFile(sibling)).toThrow(/outside the active workspace/i);
        expect(() => service.writeFile(sibling, 'blocked')).toThrow(/outside the active workspace/i);
    });

    it('rejects a workspace path whose existing parent resolves through a symlink outside', () => {
        const { workspace, outside, service } = createWorkspaceFixture();
        const linkPath = path.join(workspace, 'external-link');
        try { fs.symlinkSync(outside, linkPath, 'junction'); }
        catch { return; }
        expect(() => service.readFile(path.join(linkPath, 'selected.txt'))).toThrow(/outside the active workspace/i);
    });
});
