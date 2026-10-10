export class GitView {
    constructor({ containerEl, onFileClick = () => {} }) {
        this.containerEl = containerEl;
        this.onFileClick = onFileClick;
        this.currentStatus = null;
        this.diffModalEl = null;
    }

    async refresh() {
        try {
            const status = await window.headroomApi.git.getStatus();
            this.currentStatus = status;
            this.render();
        } catch (err) {
            this.containerEl.innerHTML = `<div class="empty-state"><p>Git error: ${err.message}</p></div>`;
        }
    }

    render() {
        this.containerEl.innerHTML = '';
        if (!this.currentStatus || !this.currentStatus.isRepo) {
            this.containerEl.innerHTML = `
                <div class="empty-state">
                    <p>Current directory is not a Git repository.</p>
                </div>
            `;
            return;
        }

        const gitBox = document.createElement('div');
        gitBox.className = 'git-container';

        // Branch bar
        const branchBar = document.createElement('div');
        branchBar.className = 'git-branch-info';
        branchBar.innerHTML = `
            <span>&#128279; ${this.currentStatus.branch || 'detached'}</span>
            <button id="git-refresh-btn" style="padding: 2px 6px; font-size: 11px;">&#8635; Refresh</button>
        `;
        gitBox.appendChild(branchBar);

        // Files
        const filesTitle = document.createElement('div');
        filesTitle.style.cssText = 'font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; margin-top: 6px;';
        filesTitle.textContent = `Changed Files (${this.currentStatus.files.length})`;
        gitBox.appendChild(filesTitle);

        if (this.currentStatus.files.length === 0) {
            const cleanMsg = document.createElement('div');
            cleanMsg.style.cssText = 'font-size: 12px; color: var(--status-success); padding: 8px 0;';
            cleanMsg.textContent = 'Working tree is clean.';
            gitBox.appendChild(cleanMsg);
        } else {
            const fileList = document.createElement('div');
            fileList.className = 'git-file-list';

            for (const file of this.currentStatus.files) {
                const item = document.createElement('div');
                item.className = 'git-file-item';

                const nameSpan = document.createElement('span');
                nameSpan.textContent = file.path;
                nameSpan.style.cursor = 'pointer';
                nameSpan.title = 'Click to view diff';
                nameSpan.onclick = () => this.showDiff(file.path);

                const badge = document.createElement('span');
                badge.className = 'status-badge';
                badge.style.fontSize = '10px';
                badge.textContent = file.status;

                item.appendChild(nameSpan);
                item.appendChild(badge);
                fileList.appendChild(item);
            }
            gitBox.appendChild(fileList);

            // Commit Box
            const commitBox = document.createElement('div');
            commitBox.className = 'git-commit-box';
            commitBox.innerHTML = `
                <textarea id="git-commit-msg" placeholder="Commit message..." style="font-size: 12px; height: 55px; resize: none;"></textarea>
                <div style="display: flex; gap: 6px;">
                    <button class="primary" id="git-commit-btn" style="flex: 1;">Commit Changes</button>
                </div>
            `;
            gitBox.appendChild(commitBox);
        }

        // Diff area
        const diffArea = document.createElement('div');
        diffArea.id = 'git-diff-area';
        diffArea.style.display = 'none';
        gitBox.appendChild(diffArea);

        this.containerEl.appendChild(gitBox);

        // Wire buttons
        const refreshBtn = this.containerEl.querySelector('#git-refresh-btn');
        if (refreshBtn) refreshBtn.onclick = () => this.refresh();

        const commitBtn = this.containerEl.querySelector('#git-commit-btn');
        if (commitBtn) {
            commitBtn.onclick = async () => {
                const msg = this.containerEl.querySelector('#git-commit-msg').value;
                if (!msg.trim()) {
                    alert('Please enter a commit message');
                    return;
                }
                try {
                    await window.headroomApi.git.stageAll();
                    const result = await window.headroomApi.git.commit(msg);
                    alert(`Committed: ${result.output}`);
                    this.refresh();
                } catch (err) {
                    alert(`Commit failed: ${err.message}`);
                }
            };
        }
    }

    async showDiff(filePath) {
        const diffArea = this.containerEl.querySelector('#git-diff-area');
        if (!diffArea) return;

        try {
            const diffText = await window.headroomApi.git.getDiff(filePath);
            diffArea.style.display = 'block';
            diffArea.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-weight: 600; font-size: 11px;">Diff: ${filePath}</span>
                    <button id="close-diff-btn" style="padding: 1px 5px; font-size: 10px;">&times;</button>
                </div>
                <pre class="git-diff-modal">${diffText || 'No visible diff'}</pre>
            `;
            diffArea.querySelector('#close-diff-btn').onclick = () => {
                diffArea.style.display = 'none';
            };
        } catch (err) {
            alert(`Could not get diff: ${err.message}`);
        }
    }
}
