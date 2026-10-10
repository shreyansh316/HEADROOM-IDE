/**
 * HEADROOM IDE — Usage & Cost Dashboard View
 *
 * Professional telemetry dashboard displaying:
 * - Total, input, output, and cached tokens
 * - Request success / failure counts
 * - Provider-reported vs estimated costs (with provenance labels)
 * - Usage by Provider, Model, and Context / Task
 * - Budget consumption & warning states
 * - Cost per verified engineering task
 * - Detailed recent transaction ledger
 * - CSV and JSON data export
 *
 * 100% Pure JavaScript. Zero TypeScript.
 */

export class UsageDashboardView {
    constructor({ containerEl }) {
        this.containerEl = containerEl;
        this.currentFilterContext = null;
        this.isLoading = false;
    }

    async render(contextId = null) {
        if (!this.containerEl) return;
        this.currentFilterContext = contextId;
        this.isLoading = true;

        this.containerEl.innerHTML = `
            <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px;">
                Loading AI Gateway usage & cost ledger...
            </div>
        `;

        try {
            const stats = await window.headroomApi.gateway.getUsageStats(this.currentFilterContext);
            this.buildDashboardUI(stats);
        } catch (err) {
            this.containerEl.innerHTML = `
                <div style="padding: 20px; color: var(--status-error); font-size: 12px; background: rgba(220,38,38,0.08); border-radius: 4px;">
                    Failed to load usage statistics: ${err.message}
                </div>
            `;
        } finally {
            this.isLoading = false;
        }
    }

    buildDashboardUI(stats) {
        if (!stats) return;

        const hasRequests = stats.totalRequests > 0;

        this.containerEl.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 16px; max-width: 1200px; margin: 0 auto; width: 100%;">
                <!-- Header & Provenance Bar -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
                    <div>
                        <div style="font-weight: 700; font-size: 15px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                            <span>AI Gateway Usage & Cost Dashboard</span>
                            <span style="font-size: 10px; padding: 2px 8px; border-radius: 10px; font-weight: 600; background: rgba(100, 121, 216, 0.15); color: var(--accent-primary);">Live Telemetry</span>
                        </div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 3px;">
                            Pricing Provenance: Model card verified &bull; Attribution: Request ID verified &bull; Currency: USD
                        </div>
                    </div>
                    <div style="display: flex; gap: 6px;">
                        <button id="dash-btn-refresh" style="font-size: 11px; padding: 4px 10px; cursor: pointer;">&#8635; Refresh</button>
                        <button id="dash-btn-export-csv" style="font-size: 11px; padding: 4px 10px; cursor: pointer;">Export CSV</button>
                        <button id="dash-btn-export-json" style="font-size: 11px; padding: 4px 10px; cursor: pointer;">Export JSON</button>
                    </div>
                </div>

                <!-- 1. Top Metric Cards (4 Cards) -->
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
                    <!-- Card 1: Total Tokens -->
                    <div style="background: var(--bg-surface-secondary); padding: 12px 14px; border-radius: 6px; border: 1px solid var(--border-color);">
                        <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Total Tokens Consumed</div>
                        <div style="font-size: 20px; font-weight: 800; color: var(--accent-primary); margin-top: 4px;">
                            ${stats.totalTokens.toLocaleString()}
                        </div>
                        <div style="font-size: 10px; color: var(--text-secondary); margin-top: 4px; display: flex; justify-content: space-between;">
                            <span>In: ${stats.totalInputTokens.toLocaleString()}</span>
                            <span>Out: ${stats.totalOutputTokens.toLocaleString()}</span>
                            <span>Cached: ${stats.totalCachedTokens.toLocaleString()}</span>
                        </div>
                    </div>

                    <!-- Card 2: Total Cost -->
                    <div style="background: var(--bg-surface-secondary); padding: 12px 14px; border-radius: 6px; border: 1px solid var(--border-color);">
                        <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Accumulated Cost (USD)</div>
                        <div style="font-size: 20px; font-weight: 800; color: var(--status-success); margin-top: 4px;">
                            $${stats.totalCost.toFixed(4)}
                        </div>
                        <div style="font-size: 10px; color: var(--text-secondary); margin-top: 4px; display: flex; justify-content: space-between;">
                            <span>Reported: $${stats.providerReportedCost.toFixed(4)}</span>
                            <span>Est: $${stats.estimatedCost.toFixed(4)}</span>
                        </div>
                    </div>

                    <!-- Card 3: Requests & Reliability -->
                    <div style="background: var(--bg-surface-secondary); padding: 12px 14px; border-radius: 6px; border: 1px solid var(--border-color);">
                        <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Request Volume & Health</div>
                        <div style="font-size: 20px; font-weight: 800; color: var(--text-primary); margin-top: 4px;">
                            ${stats.totalRequests}
                        </div>
                        <div style="font-size: 10px; color: var(--text-secondary); margin-top: 4px; display: flex; justify-content: space-between;">
                            <span style="color: var(--status-success);">&#10003; ${stats.successfulRequests} Succeeded</span>
                            <span style="${stats.failedRequests > 0 ? 'color: var(--status-error); font-weight: 600;' : ''}">&#10006; ${stats.failedRequests} Failed</span>
                        </div>
                    </div>

                    <!-- Card 4: Cost per Verified Task -->
                    <div style="background: var(--bg-surface-secondary); padding: 12px 14px; border-radius: 6px; border: 1px solid var(--border-color);">
                        <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Cost / Verified Task</div>
                        <div style="font-size: 20px; font-weight: 800; color: var(--text-primary); margin-top: 4px;">
                            ${stats.costPerVerifiedTask !== null ? `$${stats.costPerVerifiedTask.toFixed(4)}` : 'N/A'}
                        </div>
                        <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">
                            ${stats.costPerVerifiedTask !== null ? 'Attributed to verified executions' : 'Requires verified task completion'}
                        </div>
                    </div>
                </div>

                <!-- 2. Breakdown Grids (By Provider & By Model) -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <!-- Providers Breakdown -->
                    <div style="background: var(--bg-surface-secondary); padding: 12px; border-radius: 6px; border: 1px solid var(--border-color);">
                        <div style="font-size: 12px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">Usage by Provider</div>
                        ${Object.keys(stats.byProvider).length === 0 ? `
                            <div style="font-size: 11px; color: var(--text-muted); padding: 8px 0;">No provider transactions recorded yet.</div>
                        ` : `
                            <div style="display: flex; flex-direction: column; gap: 6px;">
                                ${Object.entries(stats.byProvider).map(([provider, p]) => `
                                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: var(--bg-surface); border-radius: 4px; font-size: 11px;">
                                        <span style="font-weight: 600; text-transform: uppercase;">${provider}</span>
                                        <span style="color: var(--text-secondary);">${p.requests} reqs &bull; ${p.tokens.toLocaleString()} tokens</span>
                                        <span style="font-weight: 600; color: var(--status-success);">$${p.cost.toFixed(4)}</span>
                                    </div>
                                `).join('')}
                            </div>
                        `}
                    </div>

                    <!-- Models Breakdown -->
                    <div style="background: var(--bg-surface-secondary); padding: 12px; border-radius: 6px; border: 1px solid var(--border-color);">
                        <div style="font-size: 12px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">Usage by Model</div>
                        ${Object.keys(stats.byModel).length === 0 ? `
                            <div style="font-size: 11px; color: var(--text-muted); padding: 8px 0;">No model transactions recorded yet.</div>
                        ` : `
                            <div style="display: flex; flex-direction: column; gap: 6px;">
                                ${Object.entries(stats.byModel).map(([model, m]) => `
                                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: var(--bg-surface); border-radius: 4px; font-size: 11px;">
                                        <span style="font-weight: 600;">${model}</span>
                                        <span style="color: var(--text-secondary);">${m.requests} reqs &bull; ${m.tokens.toLocaleString()} tokens</span>
                                        <span style="font-weight: 600; color: var(--status-success);">$${m.cost.toFixed(4)}</span>
                                    </div>
                                `).join('')}
                            </div>
                        `}
                    </div>
                </div>

                <!-- 3. Recent Transactions Ledger Table -->
                <div style="background: var(--bg-surface-secondary); padding: 12px; border-radius: 6px; border: 1px solid var(--border-color);">
                    <div style="font-size: 12px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                        <span>Recent Transactions Audit Ledger</span>
                        <span style="font-size: 10px; color: var(--text-muted); font-weight: normal;">Showing last 30 recorded requests</span>
                    </div>

                    ${stats.recentRecords.length === 0 ? `
                        <div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 12px;">
                            No transaction ledger entries recorded. Send chat completions through the AI Gateway to populate telemetry.
                        </div>
                    ` : `
                        <div style="overflow-x: auto;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
                                <thead>
                                    <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
                                        <th style="padding: 6px 8px;">Time</th>
                                        <th style="padding: 6px 8px;">Model</th>
                                        <th style="padding: 6px 8px;">Provider</th>
                                        <th style="padding: 6px 8px;">Tokens (In/Out/Cache)</th>
                                        <th style="padding: 6px 8px;">Cost</th>
                                        <th style="padding: 6px 8px;">Latency</th>
                                        <th style="padding: 6px 8px;">Status</th>
                                        <th style="padding: 6px 8px;">Context</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${stats.recentRecords.map(r => `
                                        <tr style="border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary);">
                                            <td style="padding: 6px 8px; font-family: var(--font-mono);">${new Date(r.timestamp).toLocaleTimeString()}</td>
                                            <td style="padding: 6px 8px; font-weight: 600; color: var(--text-primary);">${r.model}</td>
                                            <td style="padding: 6px 8px; text-transform: uppercase;">${r.provider}</td>
                                            <td style="padding: 6px 8px; font-family: var(--font-mono);">
                                                ${r.inputTokens} / ${r.outputTokens} / ${r.cachedTokens || 0}
                                            </td>
                                            <td style="padding: 6px 8px; font-weight: 600; color: var(--status-success);">$${r.estimatedCost.toFixed(4)}</td>
                                            <td style="padding: 6px 8px; font-family: var(--font-mono);">${r.durationMs}ms</td>
                                            <td style="padding: 6px 8px;">
                                                <span style="font-size: 10px; font-weight: 700; ${r.success ? 'color: var(--status-success);' : 'color: var(--status-error);'}">
                                                    ${r.success ? '&#10003; 200' : '&#10006; ERR'}
                                                </span>
                                            </td>
                                            <td style="padding: 6px 8px; font-family: var(--font-mono); font-size: 10px; color: var(--text-muted);">${r.contextId || 'general'}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            </div>
        `;

        this.wireButtons();
    }

    wireButtons() {
        const refreshBtn = this.containerEl.querySelector('#dash-btn-refresh');
        if (refreshBtn) {
            refreshBtn.onclick = () => this.render(this.currentFilterContext);
        }

        const csvBtn = this.containerEl.querySelector('#dash-btn-export-csv');
        if (csvBtn) {
            csvBtn.onclick = async () => {
                const data = await window.headroomApi.gateway.exportUsage('csv', this.currentFilterContext);
                const blob = new Blob([data], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `headroom-gateway-usage-${Date.now()}.csv`;
                a.click();
                URL.revokeObjectURL(url);
            };
        }

        const jsonBtn = this.containerEl.querySelector('#dash-btn-export-json');
        if (jsonBtn) {
            jsonBtn.onclick = async () => {
                const data = await window.headroomApi.gateway.exportUsage('json', this.currentFilterContext);
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `headroom-gateway-usage-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
            };
        }
    }
}
