export class LanguageView {
    constructor({ containerEl }) {
        this.containerEl = containerEl;
        this.languages = [];
        this.capabilities = [];
        this.projectTypes = [];
    }

    async render() {
        this.containerEl.innerHTML = '<div style="padding: 12px; font-size: 11px;">Loading language ecosystem & toolchain matrix...</div>';
        try {
            this.languages = await window.headroomApi.languages.getRegistry();
            this.capabilities = await window.headroomApi.languages.getCapabilityMatrix();
            this.projectTypes = await window.headroomApi.languages.detectProjectTypes();
            this.buildUI();
        } catch (err) {
            this.containerEl.innerHTML = `<div class="empty-state"><p>Error loading languages: ${err.message}</p></div>`;
        }
    }

    buildUI() {
        this.containerEl.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'padding: 12px; display: flex; flex-direction: column; gap: 12px;';

        // Header & Project Type Banner
        const header = document.createElement('div');
        header.innerHTML = `
            <div style="font-weight: 700; font-size: 13px; color: var(--text-primary); margin-bottom: 2px;">
                Multi-Language Ecosystem & Capability Matrix
            </div>
            <div style="font-size: 11px; color: var(--text-secondary);">
                22 Supported Languages &bull; 6-Tier Tooling Verification &bull; Live Runtimes
            </div>
        `;
        wrapper.appendChild(header);

        if (this.projectTypes.length > 0) {
            const projectBanner = document.createElement('div');
            projectBanner.style.cssText = 'background: var(--bg-surface-secondary); padding: 8px 10px; border-radius: 4px; border: 1px solid var(--border-color); font-size: 11px;';
            projectBanner.innerHTML = `
                <div style="font-weight: 600; color: var(--accent-primary); margin-bottom: 2px;">Detected Project Runtimes</div>
                <div>${this.projectTypes.map(p => `<strong>${p.type}</strong>`).join(', ')}</div>
            `;
            wrapper.appendChild(projectBanner);
        }

        // Language Cards List
        const listContainer = document.createElement('div');
        listContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

        const capMap = new Map();
        for (const cap of this.capabilities) {
            capMap.set(cap.id, cap);
        }

        for (const lang of this.languages) {
            const cap = capMap.get(lang.id);
            const card = document.createElement('div');
            card.style.cssText = 'background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 4px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px;';

            // Tier Badges Helper
            const makeBadge = (tierName, state) => {
                let bg = 'rgba(100, 116, 139, 0.15)';
                let color = 'var(--text-muted)';
                let label = `${tierName}: none`;
                if (state === 'supported') {
                    bg = 'rgba(16, 185, 129, 0.15)';
                    color = '#10b981';
                    label = `${tierName}: active`;
                } else if (state === 'missing_runtime') {
                    bg = 'rgba(245, 158, 11, 0.15)';
                    color = '#f59e0b';
                    label = `${tierName}: not found`;
                } else if (state === 'lsp_ready') {
                    bg = 'rgba(59, 130, 246, 0.15)';
                    color = '#3b82f6';
                    label = `${tierName}: lsp`;
                } else if (state === 'unsupported' || state === 'none') {
                    bg = 'rgba(148, 163, 184, 0.1)';
                    color = 'var(--text-muted)';
                    label = `${tierName}: off`;
                }
                return `<span style="display:inline-block; font-size: 9px; padding: 1px 5px; border-radius: 4px; background: ${bg}; color: ${color}; font-weight: 600; text-transform: uppercase;">${label}</span>`;
            };

            const tiers = cap ? cap.tiers : null;
            const tiersHtml = tiers ? `
                <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
                    ${makeBadge('Syntax', tiers.syntax)}
                    ${makeBadge('Diag', tiers.diagnostics)}
                    ${makeBadge('Fmt', tiers.formatting)}
                    ${makeBadge('Nav', tiers.navigation)}
                    ${makeBadge('Run', tiers.execution)}
                    ${makeBadge('Debug', tiers.debugging)}
                </div>
            ` : '';

            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 600; font-size: 12px; color: var(--text-primary);">${lang.name}</span>
                    <span style="font-size: 10px; color: var(--text-muted); background: var(--bg-surface-secondary); padding: 1px 6px; border-radius: 8px;">${lang.category}</span>
                </div>
                <div style="font-size: 11px; color: var(--text-secondary); font-family: var(--font-mono);">
                    ${lang.extensions.join(' ')}
                </div>
                ${tiersHtml}
                <div id="diag-container-${lang.id}" style="font-size: 11px; margin-top: 2px;"></div>
                <button id="btn-diagnose-${lang.id}" style="align-self: flex-start; font-size: 10px; padding: 2px 6px; margin-top: 2px;">
                    Inspect Toolchain
                </button>
            `;

            listContainer.appendChild(card);

            const diagBtn = card.querySelector(`#btn-diagnose-${lang.id}`);
            diagBtn.onclick = async () => {
                diagBtn.disabled = true;
                diagBtn.textContent = 'Probing...';
                const diagContainer = card.querySelector(`#diag-container-${lang.id}`);
                try {
                    const result = await window.headroomApi.languages.diagnose(lang.id);
                    diagContainer.innerHTML = '';
                    if (result.tools.length === 0) {
                        diagContainer.innerHTML = '<span style="color: var(--text-muted);">Internal engine parsing & diagnostics</span>';
                    } else {
                        for (const tool of result.tools) {
                            const row = document.createElement('div');
                            row.style.cssText = 'margin-top: 2px;';
                            if (tool.installed) {
                                row.innerHTML = `<span style="color: var(--status-success);">&#10003; ${tool.name}</span>: <span style="font-family: var(--font-mono); font-size: 10px;">${tool.version}</span>`;
                            } else {
                                row.innerHTML = `<span style="color: var(--status-warning);">&#9888; ${tool.name} (Not Installed)</span><div style="font-size: 10px; color: var(--text-muted); margin-left: 12px;">${tool.installGuide}</div>`;
                            }
                            diagContainer.appendChild(row);
                        }
                    }
                } catch (e) {
                    diagContainer.innerHTML = `<span style="color: var(--status-error);">${e.message}</span>`;
                } finally {
                    diagBtn.disabled = false;
                    diagBtn.textContent = 'Inspect Toolchain';
                }
            };
        }

        wrapper.appendChild(listContainer);
        this.containerEl.appendChild(wrapper);
    }
}
