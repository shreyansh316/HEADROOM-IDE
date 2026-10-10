export class ExtensionView {
    constructor({ containerEl }) {
        this.containerEl = containerEl;
        this.currentQuery = '';
        this.currentOffset = 0;
        this.pageSize = 20;
        this.totalSize = 0;
        this.extensions = [];
        this.hasMore = false;
        this.isLoading = false;
        this.activeFilter = 'marketplace'; // 'marketplace' | 'installed'
        this.searchDebounceTimer = null;
        this.activeSearchId = 0; // Stale query cancellation guard

        this.init();
    }

    init() {
        this.containerEl.innerHTML = `
            <div class="extension-view-panel">
                <div class="ext-search-box">
                    <div class="ext-search-input-wrapper">
                        <svg class="ext-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <input type="text" id="ext-search-input" class="ext-search-input" placeholder="Search Open VSX extensions..." autocomplete="off">
                        <button id="ext-search-clear" class="ext-search-clear" title="Clear search" style="display: none;">&times;</button>
                    </div>
                    <div class="ext-filter-tabs">
                        <button class="ext-tab-btn active" id="ext-tab-marketplace">Marketplace</button>
                        <button class="ext-tab-btn" id="ext-tab-installed">Installed</button>
                    </div>
                </div>

                <div class="ext-status-bar" id="ext-status-bar">
                    <span id="ext-count-text">Ready to search Open VSX Registry</span>
                    <span id="ext-registry-badge" class="ext-registry-badge">open-vsx.org</span>
                </div>

                <div class="ext-list-container" id="ext-list-container">
                    <div class="ext-placeholder-msg">Loading extensions...</div>
                </div>

                <div class="ext-pagination-row" id="ext-pagination-row" style="display: none;">
                    <button id="ext-btn-load-more" class="ext-btn-load-more">Load More Extensions</button>
                </div>
            </div>

            <!-- Details Modal Overlay -->
            <div class="ext-modal-overlay" id="ext-details-modal" style="display: none;">
                <div class="ext-modal-card">
                    <div class="ext-modal-header">
                        <div class="ext-modal-title" id="ext-modal-title">Extension Details</div>
                        <button class="ext-modal-close" id="ext-modal-close">&times;</button>
                    </div>
                    <div class="ext-modal-body" id="ext-modal-body"></div>
                </div>
            </div>
        `;

        this.searchInput = this.containerEl.querySelector('#ext-search-input');
        this.clearBtn = this.containerEl.querySelector('#ext-search-clear');
        this.listEl = this.containerEl.querySelector('#ext-list-container');
        this.statusText = this.containerEl.querySelector('#ext-count-text');
        this.paginationRow = this.containerEl.querySelector('#ext-pagination-row');
        this.loadMoreBtn = this.containerEl.querySelector('#ext-btn-load-more');
        this.tabMarketplace = this.containerEl.querySelector('#ext-tab-marketplace');
        this.tabInstalled = this.containerEl.querySelector('#ext-tab-installed');
        this.modalEl = this.containerEl.querySelector('#ext-details-modal');
        this.modalBody = this.containerEl.querySelector('#ext-modal-body');
        this.modalClose = this.containerEl.querySelector('#ext-modal-close');

        this.setupEvents();
        this.fetchExtensions(false);
    }

    setupEvents() {
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => {
                const query = e.target.value.trim();
                if (this.clearBtn) this.clearBtn.style.display = query ? 'block' : 'none';
                clearTimeout(this.searchDebounceTimer);
                this.searchDebounceTimer = setTimeout(() => {
                    this.currentQuery = query;
                    this.currentOffset = 0;
                    this.fetchExtensions(false);
                }, 350);
            });
        }

        if (this.clearBtn) {
            this.clearBtn.addEventListener('click', () => {
                this.searchInput.value = '';
                this.clearBtn.style.display = 'none';
                this.currentQuery = '';
                this.currentOffset = 0;
                this.fetchExtensions(false);
            });
        }

        if (this.loadMoreBtn) {
            this.loadMoreBtn.addEventListener('click', () => {
                if (!this.isLoading && this.hasMore) {
                    this.currentOffset += this.pageSize;
                    this.fetchExtensions(true);
                }
            });
        }

        if (this.tabMarketplace) {
            this.tabMarketplace.addEventListener('click', () => {
                if (this.activeFilter === 'marketplace') return;
                this.activeFilter = 'marketplace';
                this.tabMarketplace.classList.add('active');
                if (this.tabInstalled) this.tabInstalled.classList.remove('active');
                this.currentOffset = 0;
                this.fetchExtensions(false);
            });
        }

        if (this.tabInstalled) {
            this.tabInstalled.addEventListener('click', () => {
                if (this.activeFilter === 'installed') return;
                this.activeFilter = 'installed';
                this.tabInstalled.classList.add('active');
                if (this.tabMarketplace) this.tabMarketplace.classList.remove('active');
                this.renderInstalledList();
            });
        }

        if (this.modalClose) {
            this.modalClose.onclick = () => {
                if (this.modalEl) this.modalEl.style.display = 'none';
            };
        }

        if (this.modalEl) {
            this.modalEl.onclick = (e) => {
                if (e.target === this.modalEl) this.modalEl.style.display = 'none';
            };
        }
    }

    async fetchExtensions(append = false) {
        if (!window.headroomApi || !window.headroomApi.extensions) return;

        const searchId = ++this.activeSearchId;
        this.isLoading = true;
        this.updateLoadingState(append);

        try {
            const result = await window.headroomApi.extensions.search(this.currentQuery, {
                offset: this.currentOffset,
                size: this.pageSize
            });

            // Discard stale responses if a newer search was initiated
            if (searchId !== this.activeSearchId) return;

            this.isLoading = false;

            if (!result.success) {
                if (this.statusText) {
                    this.statusText.textContent = result.offline
                        ? 'Registry offline / Network error'
                        : 'Error searching Open VSX';
                }
                if (this.listEl) {
                    this.listEl.innerHTML = `
                        <div class="ext-error-box">
                            <div class="ext-error-title">&#9888; Open VSX Connection Notice</div>
                            <div class="ext-error-desc">${result.error || 'Failed to reach https://open-vsx.org'}</div>
                        </div>
                    `;
                }
                if (this.paginationRow) this.paginationRow.style.display = 'none';
                return;
            }

            this.totalSize = result.totalSize;
            this.hasMore = result.hasMore;

            if (append) {
                // Ensure no duplicate IDs
                const existingMap = new Set(this.extensions.map(e => e.id));
                for (const item of result.extensions) {
                    if (!existingMap.has(item.id)) {
                        this.extensions.push(item);
                        existingMap.add(item.id);
                    }
                }
            } else {
                this.extensions = result.extensions;
            }

            this.renderList();
        } catch (err) {
            if (searchId !== this.activeSearchId) return;
            this.isLoading = false;
            if (this.statusText) this.statusText.textContent = 'Failed to load extensions';
            if (this.listEl) {
                this.listEl.innerHTML = `<div class="ext-error-box"><div class="ext-error-desc">${err.message}</div></div>`;
            }
            if (this.paginationRow) this.paginationRow.style.display = 'none';
        }
    }

    updateLoadingState(append) {
        if (!append) {
            if (this.statusText) this.statusText.textContent = 'Searching Open VSX registry...';
            if (this.listEl) {
                this.listEl.innerHTML = '<div class="ext-loading-box"><span class="ext-spinner"></span> Loading real extension listings...</div>';
            }
            if (this.paginationRow) this.paginationRow.style.display = 'none';
        } else {
            if (this.loadMoreBtn) {
                this.loadMoreBtn.textContent = 'Loading more...';
                this.loadMoreBtn.disabled = true;
            }
        }
    }

    renderList() {
        if (!this.listEl) return;

        if (this.extensions.length === 0) {
            if (this.statusText) this.statusText.textContent = '0 extensions found';
            this.listEl.innerHTML = `
                <div class="ext-empty-box">
                    <p>No extensions found for "${this.currentQuery}"</p>
                    <span style="font-size: 11px; color: var(--text-muted);">Try searching for "theme", "python", "eslint", or "markdown"</span>
                </div>
            `;
            if (this.paginationRow) this.paginationRow.style.display = 'none';
            return;
        }

        const countStr = this.totalSize.toLocaleString();
        if (this.statusText) {
            this.statusText.textContent = `Showing ${this.extensions.length} of ${countStr} extensions`;
        }

        this.listEl.innerHTML = '';
        for (const ext of this.extensions) {
            this.listEl.appendChild(this.createExtensionCard(ext));
        }

        if (this.hasMore && this.paginationRow) {
            this.paginationRow.style.display = 'block';
            if (this.loadMoreBtn) {
                this.loadMoreBtn.textContent = `Load More (${this.extensions.length} of ${countStr})`;
                this.loadMoreBtn.disabled = false;
            }
        } else if (this.paginationRow) {
            this.paginationRow.style.display = 'none';
        }
    }

    async renderInstalledList() {
        if (!window.headroomApi || !window.headroomApi.extensions) return;

        if (this.statusText) this.statusText.textContent = 'Loading installed extensions...';
        const installed = await window.headroomApi.extensions.getInstalled();

        if (this.statusText) {
            this.statusText.textContent = `${installed.length} extension${installed.length === 1 ? '' : 's'} installed`;
        }
        if (this.paginationRow) this.paginationRow.style.display = 'none';

        if (!this.listEl) return;

        if (installed.length === 0) {
            this.listEl.innerHTML = `
                <div class="ext-empty-box">
                    <p>No local extensions installed yet.</p>
                    <span style="font-size: 11px; color: var(--text-muted);">Browse the Marketplace tab to install themes, snippets, or grammars.</span>
                </div>
            `;
            return;
        }

        this.listEl.innerHTML = '';
        for (const ext of installed) {
            const card = this.createInstalledCard(ext);
            this.listEl.appendChild(card);
        }
    }

    createExtensionCard(ext) {
        const card = document.createElement('div');
        card.className = 'ext-card';
        card.dataset.extensionId = ext.id;

        const iconSrc = ext.iconUrl || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="%23929BAA" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M15 9h6"/><path d="M15 15h6"/></svg>';

        const downloads = ext.downloadCount !== null
            ? this.formatNumber(ext.downloadCount)
            : 'Unavailable';

        const rating = ext.averageRating !== null
            ? `&#9733; ${ext.averageRating} (${ext.reviewCount})`
            : 'Unavailable';

        const verifiedBadge = ext.verified
            ? '<span class="ext-verified-badge" title="Verified Publisher">&#10003;</span>'
            : '';

        const compatClass = ext.compatibility && ext.compatibility.compatible ? 'compat-good' : 'compat-partial';
        const compatText = ext.compatibility ? ext.compatibility.badge : 'Declarative';

        // 6 Lifecycle status badge
        const lifecycleBadge = `<span class="ext-lifecycle-badge state-${ext.lifecycleState || 'discoverable'}">${ext.lifecycleState || 'discoverable'}</span>`;

        card.innerHTML = `
            <div class="ext-card-left">
                <img class="ext-card-icon" src="${iconSrc}" alt="${ext.displayName}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'32\\' height=\\'32\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%23929BAA\\' stroke-width=\\'1.8\\'><rect x=\\'3\\' y=\\'3\\' width=\\'18\\' height=\\'18\\' rx=\\'2\\'/></svg>'">
            </div>
            <div class="ext-card-main">
                <div class="ext-card-title-row">
                    <span class="ext-card-name" title="${ext.displayName}">${ext.displayName}</span>
                    <span class="ext-card-ver">v${ext.version}</span>
                </div>
                <div class="ext-card-pub-row">
                    <span class="ext-card-pub">${ext.publisher} ${verifiedBadge}</span>
                    ${lifecycleBadge}
                    <span class="ext-compat-tag ${compatClass}" title="${ext.compatibility ? ext.compatibility.detail : ''}">${compatText}</span>
                </div>
                <div class="ext-card-desc" title="${ext.description}">${ext.description}</div>
                <div class="ext-card-meta-row">
                    <span class="ext-card-metric" title="Real Open VSX Download Count">&#11015; ${downloads}</span>
                    <span class="ext-card-metric" title="Open VSX Community Rating">${rating}</span>
                </div>
            </div>
            <div class="ext-card-actions">
                ${ext.installed
                    ? '<button class="ext-btn-installed" disabled>Installed</button>'
                    : `<button class="ext-btn-install" data-id="${ext.id}">Install</button>`
                }
            </div>
        `;

        const installBtn = card.querySelector('.ext-btn-install');
        if (installBtn) {
            installBtn.onclick = (e) => {
                e.stopPropagation();
                this.installExtension(ext, installBtn);
            };
        }

        card.onclick = () => {
            this.openDetailsModal(ext);
        };

        return card;
    }

    createInstalledCard(ext) {
        const card = document.createElement('div');
        card.className = 'ext-card';
        card.dataset.extensionId = ext.id;

        const hasThemes = ext.contributes && Array.isArray(ext.contributes.themes) && ext.contributes.themes.length > 0;
        const isActive = ext.active === true;

        card.innerHTML = `
            <div class="ext-card-left">
                <div class="ext-card-icon-box">&#128230;</div>
            </div>
            <div class="ext-card-main">
                <div class="ext-card-title-row">
                    <span class="ext-card-name">${ext.displayName || ext.name}</span>
                    <span class="ext-card-ver">v${ext.version}</span>
                </div>
                <div class="ext-card-pub-row">
                    <span class="ext-card-pub">${ext.namespace}</span>
                    <span class="ext-lifecycle-badge state-${isActive ? 'active' : 'installed'}">${isActive ? 'active' : 'installed'}</span>
                    <span class="ext-compat-tag compat-good">Local Package</span>
                </div>
                <div class="ext-card-desc">${ext.description || 'Installed in HEADROOM IDE extensions folder.'}</div>
                <div class="ext-card-meta-row">
                    <span style="font-size: 10px; color: var(--text-muted);">Installed: ${new Date(ext.installDate).toLocaleDateString()}</span>
                    ${ext.sha256 ? `<span style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);" title="SHA-256: ${ext.sha256}">SHA: ${ext.sha256.slice(0, 8)}...</span>` : ''}
                </div>
            </div>
            <div class="ext-card-actions">
                ${hasThemes ? `
                    <button class="ext-btn-theme ${isActive ? 'active' : ''}" data-id="${ext.id}">
                        ${isActive ? 'Active Theme' : 'Activate Theme'}
                    </button>
                ` : ''}
                <button class="ext-btn-uninstall" data-id="${ext.id}">Uninstall</button>
            </div>
        `;

        const themeBtn = card.querySelector('.ext-btn-theme');
        if (themeBtn) {
            themeBtn.onclick = async (e) => {
                e.stopPropagation();
                if (isActive) {
                    await window.headroomApi.extensions.deactivate(ext.id);
                    this.removeThemeOverrides();
                } else {
                    const res = await window.headroomApi.extensions.activate(ext.id);
                    if (res.success && res.theme) {
                        this.applyThemeOverrides(res.theme);
                    } else {
                        alert(res.error || 'Failed to activate theme');
                    }
                }
                this.renderInstalledList();
            };
        }

        const uninstallBtn = card.querySelector('.ext-btn-uninstall');
        if (uninstallBtn) {
            uninstallBtn.onclick = async (e) => {
                e.stopPropagation();
                uninstallBtn.disabled = true;
                uninstallBtn.textContent = 'Removing...';
                await window.headroomApi.extensions.uninstall(ext.id);
                this.renderInstalledList();
            };
        }

        card.onclick = () => {
            this.openDetailsModal(ext);
        };

        return card;
    }

    applyThemeOverrides(theme) {
        if (!theme || !theme.colors) return;
        const colors = theme.colors;
        const root = document.documentElement;

        if (colors['editor.background']) root.style.setProperty('--workspace-bg', colors['editor.background']);
        if (colors['editor.background']) root.style.setProperty('--surface-primary', colors['editor.background']);
        if (colors['activityBar.background']) root.style.setProperty('--chrome-bg', colors['activityBar.background']);
        if (colors['sideBar.background']) root.style.setProperty('--chrome-panel', colors['sideBar.background']);
        if (colors['editor.foreground']) root.style.setProperty('--text-primary', colors['editor.foreground']);
    }

    removeThemeOverrides() {
        const root = document.documentElement;
        root.style.removeProperty('--workspace-bg');
        root.style.removeProperty('--surface-primary');
        root.style.removeProperty('--chrome-bg');
        root.style.removeProperty('--chrome-panel');
        root.style.removeProperty('--text-primary');
    }

    async openDetailsModal(ext) {
        if (!this.modalEl || !this.modalBody) return;

        this.modalBody.innerHTML = `
            <div class="ext-detail-header">
                <h3>${ext.displayName || ext.name} <span style="font-size: 12px; color: var(--text-muted);">v${ext.version}</span></h3>
                <p style="color: var(--text-muted); font-size: 12px;">Publisher: <strong>${ext.namespace}</strong> ${ext.verified ? '• Verified Publisher' : ''}</p>
            </div>
            <div class="ext-detail-section">
                <h4>Description</h4>
                <p>${ext.description || 'No description provided.'}</p>
            </div>
            <div class="ext-detail-section">
                <h4>Compatibility Audit</h4>
                <div class="ext-detail-compat-box">
                    <p><strong>Status:</strong> ${ext.compatibility ? ext.compatibility.badge : 'Unknown'}</p>
                    <p><strong>Details:</strong> ${ext.compatibility ? ext.compatibility.detail : 'N/A'}</p>
                    ${ext.compatibility && ext.compatibility.supportedFeatures && ext.compatibility.supportedFeatures.length > 0 ? `
                        <p style="color: #4EC9B0; margin-top: 4px;"><strong>Supported Capabilities:</strong> ${ext.compatibility.supportedFeatures.join(', ')}</p>
                    ` : ''}
                    ${ext.compatibility && ext.compatibility.unsupportedFeatures && ext.compatibility.unsupportedFeatures.length > 0 ? `
                        <p style="color: #CE9178; margin-top: 4px;"><strong>Unsupported Node Host APIs:</strong> ${ext.compatibility.unsupportedFeatures.join(', ')}</p>
                    ` : ''}
                </div>
            </div>
            ${ext.location ? `
                <div class="ext-detail-section">
                    <h4>Local Package</h4>
                    <p style="font-family: var(--font-mono); font-size: 11px;">Path: ${ext.location}</p>
                    ${ext.sha256 ? `<p style="font-family: var(--font-mono); font-size: 11px;">SHA256: ${ext.sha256}</p>` : ''}
                </div>
            ` : ''}
        `;

        this.modalEl.style.display = 'flex';
    }

    async installExtension(ext, buttonEl) {
        buttonEl.disabled = true;
        buttonEl.textContent = 'Installing...';
        buttonEl.classList.add('loading');

        try {
            const res = await window.headroomApi.extensions.install(ext);
            if (res.success) {
                buttonEl.textContent = 'Installed';
                buttonEl.className = 'ext-btn-installed';
                ext.installed = true;
                ext.lifecycleState = 'installed';
            } else {
                buttonEl.disabled = false;
                buttonEl.textContent = 'Install';
                buttonEl.classList.remove('loading');
                alert(`Extension installation failed: ${res.error}`);
            }
        } catch (err) {
            buttonEl.disabled = false;
            buttonEl.textContent = 'Install';
            buttonEl.classList.remove('loading');
            alert(`Install error: ${err.message}`);
        }
    }

    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'k';
        }
        return num.toString();
    }
}
