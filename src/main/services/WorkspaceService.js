const fs = require('fs');
const path = require('path');

const IGNORED_NAMES = new Set([
    'node_modules',
    '.git',
    '.vscode-test',
    '.npm-cache',
    '.test-cache',
    'dist',
    'out',
    'build',
    '.DS_Store'
]);

class WorkspaceService {
    constructor() {
        this.currentWorkspacePath = null;
        this.userSelectedFiles = new Set();
    }

    setWorkspace(workspacePath) {
        if (!workspacePath || !fs.existsSync(workspacePath)) {
            throw new Error(`Workspace path does not exist: ${workspacePath}`);
        }
        const stat = fs.statSync(workspacePath);
        if (!stat.isDirectory()) {
            throw new Error(`Workspace path is not a directory: ${workspacePath}`);
        }
        this.currentWorkspacePath = fs.realpathSync.native(path.resolve(workspacePath));
        return {
            path: this.currentWorkspacePath,
            name: path.basename(this.currentWorkspacePath)
        };
    }

    getWorkspace() {
        if (!this.currentWorkspacePath) return null;
        return {
            path: this.currentWorkspacePath,
            name: path.basename(this.currentWorkspacePath)
        };
    }

    grantUserSelectedFile(filePath) {
        if (typeof filePath !== 'string' || !filePath.trim()) throw new Error('A selected file path is required');
        const resolved = path.resolve(filePath);
        const canonicalPath = fs.realpathSync.native(resolved);
        const stat = fs.statSync(canonicalPath);
        if (!stat.isFile()) throw new Error('The selected path is not a file');
        this.userSelectedFiles.add(this.pathKey(canonicalPath));
        return canonicalPath;
    }

    resolvePath(targetPath, { allowUserSelectedFile = false } = {}) {
        if (typeof targetPath !== 'string' || !targetPath.trim() || targetPath.includes('\0')) {
            throw new Error('A valid path is required');
        }
        const workspaceRoot = this.currentWorkspacePath || fs.realpathSync.native(process.cwd());
        const resolved = path.isAbsolute(targetPath)
            ? path.resolve(targetPath)
            : path.resolve(workspaceRoot, targetPath);

        if (this.isWithin(workspaceRoot, resolved)) {
            let existingPath = resolved;
            while (!fs.existsSync(existingPath)) {
                const parentPath = path.dirname(existingPath);
                if (parentPath === existingPath) break;
                existingPath = parentPath;
            }
            const canonicalExistingPath = fs.realpathSync.native(existingPath);
            if (!this.isWithin(workspaceRoot, canonicalExistingPath)) {
                throw new Error('Path resolves outside the active workspace');
            }
            return resolved;
        }

        const key = this.pathKey(resolved);
        if (allowUserSelectedFile && this.userSelectedFiles.has(key)) {
            if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
                throw new Error('The explicitly selected file is no longer available');
            }
            const canonicalPath = fs.realpathSync.native(resolved);
            if (this.pathKey(canonicalPath) !== key) throw new Error('Selected file path changed after authorization');
            return canonicalPath;
        }

        throw new Error('Path is outside the active workspace');
    }

    isWithin(rootPath, targetPath) {
        const relativePath = path.relative(rootPath, targetPath);
        return relativePath === '' || (relativePath !== '..'
            && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath));
    }

    pathKey(filePath) {
        const normalized = path.normalize(filePath);
        return process.platform === 'win32' ? normalized.toLocaleLowerCase('en-US') : normalized;
    }

    readDirectoryTree(dirPath = this.currentWorkspacePath, maxDepth = 6, currentDepth = 0) {
        if (!dirPath) return [];
        const resolved = this.resolvePath(dirPath);
        if (!fs.existsSync(resolved)) return [];

        try {
            const entries = fs.readdirSync(resolved, { withFileTypes: true });
            const result = [];

            // Sort directories first, then alphabetical
            const sorted = entries.sort((a, b) => {
                if (a.isDirectory() && !b.isDirectory()) return -1;
                if (!a.isDirectory() && b.isDirectory()) return 1;
                return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
            });

            for (const entry of sorted) {
                if (IGNORED_NAMES.has(entry.name)) continue;
                if (entry.isSymbolicLink()) continue;

                const fullPath = path.join(resolved, entry.name);
                const relPath = this.currentWorkspacePath
                    ? path.relative(this.currentWorkspacePath, fullPath)
                    : entry.name;

                const item = {
                    name: entry.name,
                    path: fullPath,
                    relativePath: relPath.replace(/\\/g, '/'),
                    isDirectory: entry.isDirectory(),
                    extension: entry.isDirectory() ? null : path.extname(entry.name).toLowerCase()
                };

                if (entry.isDirectory()) {
                    if (currentDepth < maxDepth) {
                        item.children = this.readDirectoryTree(fullPath, maxDepth, currentDepth + 1);
                    } else {
                        item.children = [];
                        item.truncated = true;
                    }
                }
                result.push(item);
            }
            return result;
        } catch (err) {
            console.error(`[WorkspaceService] Error reading directory ${resolved}:`, err.message);
            return [];
        }
    }

    readFile(filePath) {
        const resolved = this.resolvePath(filePath, { allowUserSelectedFile: true });
        if (!fs.existsSync(resolved)) {
            throw new Error(`File does not exist: ${filePath}`);
        }
        const stat = fs.statSync(resolved);
        if (stat.isDirectory()) {
            throw new Error(`Target is a directory, not a file: ${filePath}`);
        }
        if (stat.size > 10 * 1024 * 1024) {
            throw new Error(`File exceeds 10MB limit: ${filePath} (${stat.size} bytes)`);
        }
        const content = fs.readFileSync(resolved, 'utf8');
        return {
            path: resolved,
            relativePath: this.isWithin(this.currentWorkspacePath || process.cwd(), resolved)
                ? path.relative(this.currentWorkspacePath || process.cwd(), resolved).replace(/\\/g, '/')
                : path.basename(resolved),
            name: path.basename(resolved),
            content,
            size: stat.size,
            mtime: stat.mtimeMs
        };
    }

    writeFile(filePath, content) {
        if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > 10 * 1024 * 1024) {
            throw new Error('File content must be a string no larger than 10MB');
        }
        const resolved = this.resolvePath(filePath, { allowUserSelectedFile: true });
        const dir = path.dirname(resolved);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(resolved, content, 'utf8');
        const stat = fs.statSync(resolved);
        return {
            path: resolved,
            relativePath: this.isWithin(this.currentWorkspacePath || process.cwd(), resolved)
                ? path.relative(this.currentWorkspacePath || process.cwd(), resolved).replace(/\\/g, '/')
                : path.basename(resolved),
            name: path.basename(resolved),
            size: stat.size,
            mtime: stat.mtimeMs
        };
    }

    createFile(filePath, initialContent = '') {
        const resolved = this.resolvePath(filePath);
        if (fs.existsSync(resolved)) {
            throw new Error(`File already exists: ${filePath}`);
        }
        return this.writeFile(resolved, initialContent);
    }

    createDirectory(dirPath) {
        const resolved = this.resolvePath(dirPath);
        if (fs.existsSync(resolved)) {
            throw new Error(`Directory already exists: ${dirPath}`);
        }
        fs.mkdirSync(resolved, { recursive: true });
        return {
            path: resolved,
            name: path.basename(resolved)
        };
    }

    deleteEntry(targetPath) {
        const resolved = this.resolvePath(targetPath);
        if (!fs.existsSync(resolved)) {
            throw new Error(`Path does not exist: ${targetPath}`);
        }
        const stat = fs.statSync(resolved);
        if (stat.isDirectory()) {
            fs.rmSync(resolved, { recursive: true, force: true });
        } else {
            fs.unlinkSync(resolved);
        }
        return { success: true, path: resolved };
    }

    searchFiles(query, options = {}) {
        if (!query || !this.currentWorkspacePath) return [];
        const { maxResults = 50, caseSensitive = false } = options;
        const results = [];
        const targetQuery = caseSensitive ? query : query.toLowerCase();

        const searchDir = (dir) => {
            if (results.length >= maxResults) return;
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                if (results.length >= maxResults) break;
                if (IGNORED_NAMES.has(entry.name)) continue;

                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    searchDir(fullPath);
                } else if (entry.isFile()) {
                    try {
                        const stat = fs.statSync(fullPath);
                        if (stat.size > 2 * 1024 * 1024) continue; // Skip large files
                        const content = fs.readFileSync(fullPath, 'utf8');
                        const lines = content.split(/\r?\n/);
                        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                            const line = lines[lineNum];
                            const checkLine = caseSensitive ? line : line.toLowerCase();
                            const colIndex = checkLine.indexOf(targetQuery);
                            if (colIndex !== -1) {
                                results.push({
                                    path: fullPath,
                                    relativePath: path.relative(this.currentWorkspacePath, fullPath).replace(/\\/g, '/'),
                                    fileName: entry.name,
                                    lineNumber: lineNum + 1,
                                    column: colIndex + 1,
                                    lineContent: line.trim()
                                });
                                if (results.length >= maxResults) break;
                            }
                        }
                    } catch (e) {
                        // ignore binary / unreadable
                    }
                }
            }
        };

        searchDir(this.currentWorkspacePath);
        return results;
    }
}

module.exports = WorkspaceService;
