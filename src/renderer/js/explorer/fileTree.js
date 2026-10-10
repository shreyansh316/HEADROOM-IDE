import { ICONS, getFileIcon } from '../common/icons.js';

export class FileTree {
    constructor({ containerEl, onFileSelect = () => {} }) {
        this.containerEl = containerEl;
        this.onFileSelect = onFileSelect;
        this.treeData = [];
        this.expandedDirs = new Set();
        this.activeFilePath = null;
    }

    setTree(treeData) {
        this.treeData = treeData || [];
        this.render();
    }

    setActiveFile(filePath) {
        this.activeFilePath = filePath;
        const currentActive = this.containerEl.querySelector('.tree-node.active');
        if (currentActive) currentActive.classList.remove('active');

        if (filePath) {
            const newActive = this.containerEl.querySelector(`[data-path="${CSS.escape(filePath)}"]`);
            if (newActive) newActive.classList.add('active');
        }
    }

    render() {
        this.containerEl.innerHTML = '';
        if (this.treeData.length === 0) {
            this.containerEl.innerHTML = `
                <div class="empty-state">
                    <p>No workspace folder loaded.</p>
                    <button class="primary" id="open-folder-empty-btn">Open Folder</button>
                </div>
            `;
            const btn = this.containerEl.querySelector('#open-folder-empty-btn');
            if (btn) {
                btn.onclick = async () => {
                    const ws = await window.headroomApi.workspace.openDirectoryDialog();
                    if (ws && window.headroomApp) {
                        window.headroomApp.loadWorkspace();
                    }
                };
            }
            return;
        }

        const listEl = document.createElement('div');
        listEl.className = 'file-tree';
        this.renderNodes(this.treeData, listEl);
        this.containerEl.appendChild(listEl);
    }

    renderNodes(nodes, parentEl) {
        for (const node of nodes) {
            const nodeEl = document.createElement('div');
            const isDir = Boolean(node.isDirectory);
            const isExpanded = isDir && this.expandedDirs.has(node.path);
            const isActiveFile = !isDir && node.path === this.activeFilePath;

            nodeEl.className = `tree-node ${isActiveFile ? 'active' : ''} ${isExpanded ? 'expanded-folder' : ''}`;
            nodeEl.dataset.path = node.path;

            if (isDir) {
                const arrow = document.createElement('span');
                arrow.className = `tree-arrow ${isExpanded ? 'expanded' : ''}`;
                arrow.innerHTML = ICONS.chevron;

                const icon = document.createElement('span');
                icon.className = 'tree-icon';
                icon.innerHTML = isExpanded ? ICONS.folderOpen : ICONS.folderClosed;

                const name = document.createElement('span');
                name.className = 'tree-name';
                name.textContent = node.name;

                nodeEl.appendChild(arrow);
                nodeEl.appendChild(icon);
                nodeEl.appendChild(name);
                parentEl.appendChild(nodeEl);

                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'tree-children';
                childrenContainer.style.display = isExpanded ? 'flex' : 'none';

                if (node.children && node.children.length > 0) {
                    this.renderNodes(node.children, childrenContainer);
                }

                parentEl.appendChild(childrenContainer);

                nodeEl.onclick = (e) => {
                    e.stopPropagation();
                    if (this.expandedDirs.has(node.path)) {
                        this.expandedDirs.delete(node.path);
                        arrow.classList.remove('expanded');
                        nodeEl.classList.remove('expanded-folder');
                        icon.innerHTML = ICONS.folderClosed;
                        childrenContainer.style.display = 'none';
                    } else {
                        this.expandedDirs.add(node.path);
                        arrow.classList.add('expanded');
                        nodeEl.classList.add('expanded-folder');
                        icon.innerHTML = ICONS.folderOpen;
                        childrenContainer.style.display = 'flex';
                    }
                };
            } else {
                const spacer = document.createElement('span');
                spacer.style.width = '12px';
                spacer.style.flexShrink = '0';

                const icon = document.createElement('span');
                icon.className = 'tree-icon';
                icon.innerHTML = getFileIcon(node.name);

                const name = document.createElement('span');
                name.className = 'tree-name';
                name.textContent = node.name;

                nodeEl.appendChild(spacer);
                nodeEl.appendChild(icon);
                nodeEl.appendChild(name);

                nodeEl.onclick = (e) => {
                    e.stopPropagation();
                    this.setActiveFile(node.path);
                    this.onFileSelect(node.path);
                };

                parentEl.appendChild(nodeEl);
            }
        }
    }
}
