import { describe, it, expect } from 'vitest';
import GitService from '../src/main/services/GitService.js';

describe('GitService', () => {
    const git = new GitService();

    it('handles non-git directories gracefully', () => {
        const status = git.getStatus('C:\\Windows');
        expect(status.isRepo).toBe(false);
        expect(status.files).toEqual([]);
    });

    it('detects a real git repository in headroom', () => {
        const headroomPath = 'D:\\codex room\\headroom';
        const isRepo = git.isGitRepository(headroomPath);
        expect(isRepo).toBe(true);

        const status = git.getStatus(headroomPath);
        expect(status.isRepo).toBe(true);
        expect(typeof status.branch).toBe('string');
        expect(Array.isArray(status.files)).toBe(true);
    });

    it('retrieves branch list from headroom repo', () => {
        const headroomPath = 'D:\\codex room\\headroom';
        const branches = git.getBranches(headroomPath);
        expect(branches.length).toBeGreaterThan(0);
        const current = branches.find(b => b.current);
        expect(current).toBeDefined();
    });

    it('retrieves recent commit history', () => {
        const headroomPath = 'D:\\codex room\\headroom';
        const commits = git.getRecentCommits(5, headroomPath);
        expect(commits.length).toBeGreaterThan(0);
        expect(commits[0].hash).toBeDefined();
        expect(commits[0].subject).toBeDefined();
    });
});
