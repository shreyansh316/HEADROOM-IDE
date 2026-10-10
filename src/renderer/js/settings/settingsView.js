export class SettingsView {
    constructor({ containerEl }) {
        this.containerEl = containerEl;
        this.selectedRoutingPolicy = 'balanced';
    }

    async render() {
        this.containerEl.innerHTML = '<div style="padding: 12px; font-size: 11px;">Loading AI Gateway settings...</div>';
        try {
            const providers = await window.headroomApi.gateway.getProviders();
            const models = await window.headroomApi.gateway.getModels();
            const usage = await window.headroomApi.gateway.getUsageStats();
            const platform = await window.headroomApi.window.getPlatformInfo();

            this.buildUI(providers, models, usage, platform);
        } catch (err) {
            this.containerEl.innerHTML = `<div class="empty-state"><p>Error loading settings: ${err.message}</p></div>`;
        }
    }

    buildUI(providers, models, usage, platform) {
        this.containerEl.innerHTML = `
            <div style="padding: 14px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: 700; font-size: 13px; color: var(--text-primary);">
                            HEADROOM AI API Gateway
                        </div>
                        <div style="font-size: 11px; color: var(--text-secondary);">
                            Unified Multi-Provider Routing &bull; Cost Accounting &bull; Loopback: 127.0.0.1:41400
                        </div>
                    </div>
                </div>

                <!-- Provider Credentials & Test Panel -->
                <div style="background: var(--bg-surface-secondary); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 10px;">
                    <div style="font-weight: 600; font-size: 12px; color: var(--text-primary); display: flex; justify-content: space-between;">
                        <span>Provider Connections & Credentials</span>
                        <span style="font-size: 10px; color: var(--status-success); font-weight: 600;">&#10003; Zero-Leak Storage</span>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${providers.map(p => `
                            <div style="background: var(--bg-surface); padding: 8px 10px; border-radius: 4px; border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 4px;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <span style="font-weight: 600; font-size: 11px; text-transform: uppercase;">${p.provider}</span>
                                    <span style="font-size: 10px; padding: 1px 6px; border-radius: 8px; font-weight: 600; ${p.configured ? 'background: rgba(16,185,129,0.15); color: #10b981;' : 'background: rgba(245,158,11,0.15); color: #f59e0b;'}">
                                        ${p.configured ? 'Configured' : 'Missing Key'}
                                    </span>
                                </div>
                                <div style="display: flex; gap: 6px; align-items: center; margin-top: 2px;">
                                    <input type="password" id="input-key-${p.provider}" placeholder="${p.configured ? (p.maskedKey || '••••••••') : 'Enter API Key'}" style="flex: 1; font-size: 11px; padding: 3px 6px;">
                                    <button id="btn-save-${p.provider}" style="font-size: 10px; padding: 3px 8px;">Save</button>
                                    <button id="btn-test-${p.provider}" style="font-size: 10px; padding: 3px 8px;">Test</button>
                                </div>
                                <div id="status-test-${p.provider}" style="font-size: 10px; color: var(--text-muted); margin-top: 2px;"></div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Intelligent Routing Policy -->
                <div style="background: var(--bg-surface-secondary); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 8px;">
                    <div style="font-weight: 600; font-size: 12px; color: var(--text-primary);">
                        Intelligent Routing Policy
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <label style="font-size: 11px; color: var(--text-secondary);">Active Policy</label>
                        <select id="select-routing-policy" style="font-size: 11px; padding: 4px;">
                            <option value="economy" ${this.selectedRoutingPolicy === 'economy' ? 'selected' : ''}>economy (Lowest Token Cost)</option>
                            <option value="balanced" ${this.selectedRoutingPolicy === 'balanced' ? 'selected' : ''}>balanced (Optimal Trade-off)</option>
                            <option value="quality" ${this.selectedRoutingPolicy === 'quality' ? 'selected' : ''}>quality (Highest Benchmark Fidelity)</option>
                            <option value="coding" ${this.selectedRoutingPolicy === 'coding' ? 'selected' : ''}>coding (Tool Calling & Code Generation)</option>
                            <option value="reasoning" ${this.selectedRoutingPolicy === 'reasoning' ? 'selected' : ''}>reasoning (Extended Thinking Models)</option>
                            <option value="long-context" ${this.selectedRoutingPolicy === 'long-context' ? 'selected' : ''}>long-context (1M+ Tokens Support)</option>
                        </select>
                    </div>
                </div>

                <!-- Usage & Cost Accounting Telemetry -->
                <div style="background: var(--bg-surface-secondary); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 8px;">
                    <div style="font-weight: 600; font-size: 12px; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center;">
                        <span>Usage & Cost Telemetry</span>
                        <span style="font-size: 10px; color: var(--text-muted); font-weight: normal;">Provenance: Locally Measured & Provider Verified</span>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; text-align: center;">
                        <div style="background: var(--bg-surface); padding: 6px; border-radius: 4px; border: 1px solid var(--border-color);">
                            <div style="font-size: 10px; color: var(--text-muted);">Total Requests</div>
                            <div style="font-weight: 700; font-size: 13px; color: var(--text-primary);">${usage.totalRequests}</div>
                        </div>
                        <div style="background: var(--bg-surface); padding: 6px; border-radius: 4px; border: 1px solid var(--border-color);">
                            <div style="font-size: 10px; color: var(--text-muted);">Total Tokens</div>
                            <div style="font-weight: 700; font-size: 13px; color: var(--accent-primary);">${usage.totalTokens.toLocaleString()}</div>
                        </div>
                        <div style="background: var(--bg-surface); padding: 6px; border-radius: 4px; border: 1px solid var(--border-color);">
                            <div style="font-size: 10px; color: var(--text-muted);">Estimated Cost</div>
                            <div style="font-weight: 700; font-size: 13px; color: var(--status-success);">$${usage.totalCost.toFixed(4)}</div>
                        </div>
                    </div>
                    <div style="display: flex; justify-content: flex-end; gap: 6px; margin-top: 4px;">
                        <button id="btn-export-usage-csv" style="font-size: 10px; padding: 3px 8px;">Export CSV</button>
                        <button id="btn-export-usage-json" style="font-size: 10px; padding: 3px 8px;">Export JSON</button>
                    </div>
                </div>

                <!-- Environment & Security Summary -->
                <div style="background: var(--bg-surface); padding: 10px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); font-size: 11px; color: var(--text-secondary); line-height: 1.5;">
                    <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Security & Runtime</div>
                    <div>&bull; Gateway: <strong>http://127.0.0.1:41400 (Loopback Only)</strong></div>
                    <div>&bull; SSRF Protection: <strong style="color: var(--status-success);">ENFORCED (Private & Cloud Meta Blocked)</strong></div>
                    <div>&bull; Codebase Architecture: <strong style="color: var(--status-success);">100% PURE JAVASCRIPT</strong></div>
                </div>
            </div>
        `;

        // Wire Event Listeners
        for (const p of providers) {
            const saveBtn = this.containerEl.querySelector(`#btn-save-${p.provider}`);
            const testBtn = this.containerEl.querySelector(`#btn-test-${p.provider}`);
            const input = this.containerEl.querySelector(`#input-key-${p.provider}`);
            const statusEl = this.containerEl.querySelector(`#status-test-${p.provider}`);

            if (saveBtn) {
                saveBtn.onclick = async () => {
                    const key = input.value.trim();
                    if (!key) return;
                    await window.headroomApi.gateway.setCredential(p.provider, key);
                    input.value = '';
                    statusEl.innerHTML = '<span style="color: var(--status-success);">&#10003; Key updated</span>';
                    setTimeout(() => this.render(), 800);
                };
            }

            if (testBtn) {
                testBtn.onclick = async () => {
                    testBtn.disabled = true;
                    statusEl.innerHTML = 'Testing connection...';
                    try {
                        const res = await window.headroomApi.gateway.testConnection(p.provider);
                        if (res.ok) {
                            statusEl.innerHTML = `<span style="color: var(--status-success);">&#10003; Connected (${res.latencyMs}ms)</span>`;
                        } else {
                            statusEl.innerHTML = `<span style="color: var(--status-error);">&#10006; ${res.error || 'Failed'}</span>`;
                        }
                    } catch (e) {
                        statusEl.innerHTML = `<span style="color: var(--status-error);">${e.message}</span>`;
                    } finally {
                        testBtn.disabled = false;
                    }
                };
            }
        }

        const policySelect = this.containerEl.querySelector('#select-routing-policy');
        if (policySelect) {
            policySelect.onchange = () => {
                this.selectedRoutingPolicy = policySelect.value;
            };
        }

        const csvBtn = this.containerEl.querySelector('#btn-export-usage-csv');
        if (csvBtn) {
            csvBtn.onclick = async () => {
                const data = await window.headroomApi.gateway.exportUsage('csv');
                const blob = new Blob([data], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `headroom-usage-${Date.now()}.csv`;
                a.click();
                URL.revokeObjectURL(url);
            };
        }

        const jsonBtn = this.containerEl.querySelector('#btn-export-usage-json');
        if (jsonBtn) {
            jsonBtn.onclick = async () => {
                const data = await window.headroomApi.gateway.exportUsage('json');
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `headroom-usage-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
            };
        }
    }
}
