const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class GitService {
    constructor() {
        this.currentDir = null;
    }

    setWorkingDirectory(dirPath) {
        if (!dirPath || !fs.existsSync(dirPath)) {
            this.currentDir = null;
            return;
        }
        this.currentDir = path.resolve(dirPath);
    }

    isGitRepository(dir = this.currentDir) {
        if (!dir || !fs.existsSync(dir)) return false;
        try {
            execSync('git rev-parse --is-inside-work-tree', {
                cwd: dir,
                stdio: ['ignore', 'pipe', 'ignore'],
                encoding: 'utf8'
            });
            return true;
        } catch {
            return false;
        }
    }

    getStatus(dir = this.currentDir) {
        if (!this.isGitRepository(dir)) {
            return {
                isRepo: false,
                branch: null,
                files: [],
                clean: true
            };
        }

        try {
            const rawStatus = execSync('git status --porcelain=v1 -b', {
                cwd: dir,
                encoding: 'utf8'
            });

            const lines = rawStatus.split(/\r?\n/).filter(Boolean);
            let branch = 'unknown';
            const files = [];

            for (const line of lines) {
                if (line.startsWith('## ')) {
                    const match = line.slice(3).match(/^([^.\s]+)/);
                    if (match) branch = match[1];
                    continue;
                }

                const indexStatus = line[0];
                const workTreeStatus = line[1];
                const filePath = line.slice(3).trim();

                let statusText = 'modified';
                if (indexStatus === '?' || workTreeStatus === '?') statusText = 'untracked';
                else if (indexStatus === 'A' || workTreeStatus === 'A') statusText = 'added';
                else if (indexStatus === 'D' || workTreeStatus === 'D') statusText = 'deleted';
                else if (indexStatus === 'R' || workTreeStatus === 'R') statusText = 'renamed';

                files.push({
                    path: filePath,
                    staged: indexStatus !== ' ' && indexStatus !== '?',
                    status: statusText,
                    raw: line.slice(0, 2)
                });
            }

            return {
                isRepo: true,
                branch,
                files,
                clean: files.length === 0
            };
        } catch (err) {
            return {
                isRepo: true,
                branch: null,
                files: [],
                clean: true,
                error: err.message
            };
        }
    }

    getBranches(dir = this.currentDir) {
        if (!this.isGitRepository(dir)) return [];
        try {
            const output = execSync('git branch --no-color', {
                cwd: dir,
                encoding: 'utf8'
            });
            return output.split(/\r?\n/)
                .filter(Boolean)
                .map((b) => {
                    const isCurrent = b.startsWith('*');
                    const name = b.replace(/^\*\s*/, '').trim();
                    return { name, current: isCurrent };
                });
        } catch {
            return [];
        }
    }

    getDiff(filePath = null, staged = false, dir = this.currentDir) {
        if (!this.isGitRepository(dir)) return '';
        try {
            const args = ['diff'];
            if (staged) args.push('--cached');
            if (filePath) args.push('--', filePath);

            return execSync(`git ${args.join(' ')}`, {
                cwd: dir,
                encoding: 'utf8',
                maxBuffer: 5 * 1024 * 1024
            });
        } catch (err) {
            return `Diff error: ${err.message}`;
        }
    }

    getRecentCommits(limit = 10, dir = this.currentDir) {
        if (!this.isGitRepository(dir)) return [];
        try {
            const output = execSync(`git log -n ${limit} --pretty=format:"%h%x09%an%x09%ad%x09%s" --date=short`, {
                cwd: dir,
                encoding: 'utf8'
            });
            return output.split(/\r?\n/)
                .filter(Boolean)
                .map((line) => {
                    const [hash, author, date, subject] = line.split('\t');
                    return { hash, author, date, subject };
                });
        } catch {
            return [];
        }
    }

    stageFile(filePath, dir = this.currentDir) {
        if (!this.isGitRepository(dir)) throw new Error('Not a git repository');
        execSync(`git add "${filePath}"`, { cwd: dir, encoding: 'utf8' });
        return this.getStatus(dir);
    }

    unstageFile(filePath, dir = this.currentDir) {
        if (!this.isGitRepository(dir)) throw new Error('Not a git repository');
        execSync(`git reset HEAD "${filePath}"`, { cwd: dir, encoding: 'utf8' });
        return this.getStatus(dir);
    }

    stageAll(dir = this.currentDir) {
        if (!this.isGitRepository(dir)) throw new Error('Not a git repository');
        execSync('git add -A', { cwd: dir, encoding: 'utf8' });
        return this.getStatus(dir);
    }

    commit(message, dir = this.currentDir) {
        if (!this.isGitRepository(dir)) throw new Error('Not a git repository');
        if (!message || !message.trim()) throw new Error('Commit message is required');

        // Safe message passing
        const cleanMessage = message.replace(/"/g, '\\"');
        const output = execSync(`git commit -m "${cleanMessage}"`, {
            cwd: dir,
            encoding: 'utf8'
        });
        return {
            success: true,
            output,
            status: this.getStatus(dir)
        };
    }
}

module.exports = GitService;
