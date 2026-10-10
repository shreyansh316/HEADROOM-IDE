export class AgentManager {
    constructor({ containerEl, onTaskSelect = () => {}, onChange = () => {} }) {
        this.containerEl = containerEl;
        this.onTaskSelect = onTaskSelect;
        this.onChange = onChange;
        this.hierarchy = null;
        this.plans = [];
        this.tasks = [];
        this.liveEvents = [];
        this.messages = [];
        this.expandedDiffs = new Set();
        this.activeTab = 'chat'; // 'chat' | 'tasks' | 'workforce' | 'audit'
        this.disposeEventListener = null;

        this.init();
    }

    async init() {
        // Initial system welcome message
        this.messages.push({
            id: 'msg-init',
            sender: 'System',
            type: 'system',
            time: new Date().toLocaleTimeString(),
            content: 'HEADROOM Agent Manager initialized. Connected to executive workforce event bridge.'
        });

        if (window.headroomApi?.headroom?.onEvent) {
            this.disposeEventListener = window.headroomApi.headroom.onEvent(eventData => {
                this.handleLiveEvent(eventData);
            });
        }

        try {
            const history = await window.headroomApi.headroom.getEventHistory(0, 40);
            if (Array.isArray(history)) {
                this.liveEvents = history.reverse();
                for (const evt of this.liveEvents) {
                    this.appendEventToMessages(evt, false);
                }
            }
        } catch (e) {
            console.warn('[AgentManager] Could not recover event history:', e);
        }

        await this.refreshData();
        this.render();
    }

    destroy() {
        if (this.disposeEventListener) {
            this.disposeEventListener();
            this.disposeEventListener = null;
        }
    }

    appendEventToMessages(evt, shouldScroll = true) {
        let sender = evt.actor || 'AI Director';
        let type = 'workforce';
        let content = evt.action || evt.detail || `Event ${evt.type}`;

        if (evt.type === 'TOOL_EXECUTION' || evt.toolActivity) {
            sender = evt.toolActivity?.source || 'Tool';
            type = 'tool';
            content = evt.toolActivity
                ? `[${evt.toolActivity.source || 'tool'}] ${evt.toolActivity.target || evt.toolActivity.command || evt.toolActivity.action || evt.toolActivity.detail || ''}`
                : content;
        } else if (evt.type?.includes('OBJECTIVE') || evt.type?.includes('PLAN')) {
            sender = 'AI Director';
            type = 'workforce';
            content = `${evt.type}: ${content}`;
        } else if (evt.type?.includes('SYSTEM') || evt.type?.includes('AUDIT')) {
            sender = 'System';
            type = 'system';
        }

        this.messages.push({
            id: `evt-${evt.id || Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            sender,
            type,
            time: new Date(evt.occurredAt || Date.now()).toLocaleTimeString(),
            content,
            eventData: evt
        });

        if (this.messages.length > 200) {
            this.messages.shift();
        }

        if (shouldScroll) {
            this.updateChatStream();
        }
    }

    handleLiveEvent(event) {
        if (!event) return;
        this.liveEvents.unshift(event);
        if (this.liveEvents.length > 100) this.liveEvents.pop();

        // Update task state if event matches a task
        if (event.taskId) {
            const task = this.tasks.find(t => t.id === event.taskId);
            if (task) {
                if (event.status) task.status = event.status;
                if (typeof event.progress === 'number') task.progress = event.progress;
                if (event.evidence) task.evidence = event.evidence;
                if (event.toolActivity) task.toolActivity = event.toolActivity;
            }

            for (const plan of this.plans) {
                const planTask = plan.tasks?.find(t => t.id === event.taskId);
                if (planTask) {
                    if (event.status) planTask.status = event.status;
                    if (typeof event.progress === 'number') planTask.progress = event.progress;
                    if (event.evidence) planTask.evidence = event.evidence;
                    if (event.toolActivity) planTask.toolActivity = event.toolActivity;
                }
            }
        }

        if (event.planId) {
            const plan = this.plans.find(p => p.id === event.planId);
            if (plan && event.status && (event.type === 'PLAN_APPROVED' || event.type === 'PLAN_REJECTED' || event.type === 'OBJECTIVE_COMPLETED')) {
                plan.status = event.status;
            }
        }

        this.appendEventToMessages(event, true);
        this.updateUpperRegion();
    }

    async refreshData() {
        try {
            this.hierarchy = await window.headroomApi.headroom.getHierarchy();
            this.plans = await window.headroomApi.headroom.getPlans();
            this.tasks = await window.headroomApi.headroom.getTasks();
            this.onChange({ hierarchy: this.hierarchy, plans: this.plans, tasks: this.tasks });
        } catch (e) {
            console.error('[AgentManager] Error refreshing data:', e);
        }
    }

    render() {
        this.containerEl.innerHTML = `
            <div class="agent-header">
                <div class="agent-title">
                    <span class="antigravity-dot"></span>
                    <span id="agent-manager-title">HEADROOM Agent Manager</span>
                </div>
            </div>
            <div class="agent-grid-container">
                <!-- Upper 40%: Task & Context Region -->
                <div class="agent-upper-region" id="agent-upper-region"></div>

                <!-- Lower 60%: Conversation & Anchored Composer -->
                <div class="agent-lower-region" id="agent-lower-region">
                    <div class="agent-chat-stream" id="agent-chat-stream"></div>
                    <div class="agent-composer-anchor" id="agent-composer-anchor"></div>
                </div>
            </div>
        `;

        this.renderUpperRegion();
        this.renderChatStream();
        this.renderComposer();
    }

    updateUpperRegion() {
        const upperEl = this.containerEl.querySelector('#agent-upper-region');
        if (upperEl) {
            this.renderUpperRegionContent(upperEl);
        }
    }

    renderUpperRegion() {
        const upperEl = this.containerEl.querySelector('#agent-upper-region');
        if (!upperEl) return;
        this.renderUpperRegionContent(upperEl);
    }

    renderUpperRegionContent(upperEl) {
        upperEl.innerHTML = '';

        // Tabs Strip
        const tabsStrip = document.createElement('div');
        tabsStrip.className = 'agent-tabs-strip';
        tabsStrip.innerHTML = `
            <button class="agent-tab-btn ${this.activeTab === 'chat' ? 'active' : ''}" id="tab-btn-chat">Chat</button>
            <button class="agent-tab-btn ${this.activeTab === 'tasks' ? 'active' : ''}" id="tab-btn-tasks">Tasks (${this.tasks.length})</button>
            <button class="agent-tab-btn ${this.activeTab === 'workforce' ? 'active' : ''}" id="tab-btn-workforce">Workforce</button>
            <button class="agent-tab-btn ${this.activeTab === 'audit' ? 'active' : ''}" id="tab-btn-audit">Audit</button>
        `;
        upperEl.appendChild(tabsStrip);

        tabsStrip.querySelector('#tab-btn-chat').onclick = () => {
            this.activeTab = 'chat';
            this.updateUpperRegion();
        };
        tabsStrip.querySelector('#tab-btn-tasks').onclick = () => {
            this.activeTab = 'tasks';
            this.updateUpperRegion();
        };
        tabsStrip.querySelector('#tab-btn-workforce').onclick = () => {
            this.activeTab = 'workforce';
            this.updateUpperRegion();
        };
        tabsStrip.querySelector('#tab-btn-audit').onclick = () => {
            this.activeTab = 'audit';
            this.updateUpperRegion();
        };

        const tabBody = document.createElement('div');
        tabBody.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';
        upperEl.appendChild(tabBody);

        if (this.activeTab === 'chat') {
            this.renderContextSummary(tabBody);
        } else if (this.activeTab === 'tasks') {
            this.renderTasksList(tabBody);
        } else if (this.activeTab === 'workforce') {
            this.renderWorkforceList(tabBody);
        } else if (this.activeTab === 'audit') {
            this.renderAuditList(tabBody);
        }
    }

    renderContextSummary(parentEl) {
        const latestPlan = this.plans[0];
        const latestTask = this.tasks[0];

        const card = document.createElement('div');
        card.className = 'context-card';

        if (latestPlan) {
            const statusClass = (latestPlan.status || '').toLowerCase();
            card.innerHTML = `
                <div class="context-card-header">
                    <span class="context-card-title">${latestPlan.id}: ${latestPlan.objective.slice(0, 48)}${latestPlan.objective.length > 48 ? '...' : ''}</span>
                    <span class="status-badge ${statusClass}">${latestPlan.status}</span>
                </div>
                <div class="context-meta-row">
                    <span>Tasks: <strong>${latestPlan.tasks?.length || 0}</strong></span>
                    <span>Created: <strong>${new Date(latestPlan.createdAt).toLocaleTimeString()}</strong></span>
                </div>
            `;

            if (latestPlan.status === 'NEEDS_APPROVAL') {
                const actionRow = document.createElement('div');
                actionRow.className = 'plan-actions';
                actionRow.innerHTML = `
                    <button class="primary" id="ctx-approve-btn-${latestPlan.id}" style="font-size: 11px; padding: 3px 8px;">Approve Plan</button>
                    <button class="danger" id="ctx-reject-btn-${latestPlan.id}" style="font-size: 11px; padding: 3px 8px;">Reject</button>
                `;
                card.appendChild(actionRow);

                actionRow.querySelector(`#ctx-approve-btn-${latestPlan.id}`).onclick = async () => {
                    await window.headroomApi.headroom.approvePlan(latestPlan.id);
                    await this.refreshData();
                    this.updateUpperRegion();
                };
                actionRow.querySelector(`#ctx-reject-btn-${latestPlan.id}`).onclick = async () => {
                    await window.headroomApi.headroom.rejectPlan(latestPlan.id, 'Declined by CEO');
                    await this.refreshData();
                    this.updateUpperRegion();
                };
            }
        } else {
            card.innerHTML = `
                <div class="context-card-header">
                    <span class="context-card-title">Active Workforce Status</span>
                    <span class="status-badge approved">STANDBY</span>
                </div>
                <div class="context-meta-row">
                    <span>CEO Authority active &bull; Ready for executive objectives</span>
                </div>
            `;
        }
        parentEl.appendChild(card);

        // Active task snippet if currently executing
        if (latestTask && (latestTask.status === 'IN_PROGRESS' || latestTask.status === 'ASSIGNED')) {
            const taskCard = document.createElement('div');
            taskCard.className = 'context-card';
            taskCard.innerHTML = `
                <div class="context-card-header">
                    <span class="context-card-title">Task: ${latestTask.title}</span>
                    <span class="status-badge ${latestTask.status.toLowerCase()}">${latestTask.status}</span>
                </div>
                <div class="context-meta-row">
                    <span>Role: <strong>${latestTask.assignedPosition || latestTask.assignedTitle}</strong></span>
                    <span>Dept: <strong>${latestTask.department}</strong></span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width: ${latestTask.progress || 0}%;"></div>
                </div>
            `;
            parentEl.appendChild(taskCard);
        }
    }

    renderTasksList(parentEl) {
        if (this.plans.length === 0) {
            parentEl.innerHTML = '<div style="font-size: 11px; color: var(--text-muted); padding: 8px 0;">No active plans or tasks found.</div>';
            return;
        }

        for (const plan of this.plans) {
            const planCard = document.createElement('div');
            planCard.className = 'plan-banner';
            const statusClass = (plan.status || '').toLowerCase();

            planCard.innerHTML = `
                <div class="plan-header">
                    <span class="plan-title">${plan.id}: ${plan.objective.slice(0, 42)}...</span>
                    <span class="status-badge ${statusClass}">${plan.status}</span>
                </div>
            `;

            if (plan.status === 'NEEDS_APPROVAL') {
                const actionRow = document.createElement('div');
                actionRow.className = 'plan-actions';
                actionRow.innerHTML = `
                    <button class="primary" id="tab-approve-btn-${plan.id}" style="font-size: 10px; padding: 2px 7px;">Approve</button>
                    <button class="danger" id="tab-reject-btn-${plan.id}" style="font-size: 10px; padding: 2px 7px;">Reject</button>
                `;
                planCard.appendChild(actionRow);

                actionRow.querySelector(`#tab-approve-btn-${plan.id}`).onclick = async () => {
                    await window.headroomApi.headroom.approvePlan(plan.id);
                    await this.refreshData();
                    this.updateUpperRegion();
                };
                actionRow.querySelector(`#tab-reject-btn-${plan.id}`).onclick = async () => {
                    await window.headroomApi.headroom.rejectPlan(plan.id, 'Declined by CEO');
                    await this.refreshData();
                    this.updateUpperRegion();
                };
            }

            for (const task of plan.tasks || []) {
                const taskEl = document.createElement('div');
                taskEl.className = 'task-item';
                taskEl.style.marginTop = '4px';

                taskEl.innerHTML = `
                    <div class="task-item-top">
                        <span class="task-item-title">${task.title}</span>
                        <span class="status-badge ${task.status.toLowerCase()}">${task.status}</span>
                    </div>
                    <div class="task-item-meta">
                        <span>${task.assignedPosition || task.assignedTitle} &bull; ${task.department}</span>
                    </div>
                `;

                if (task.status === 'IN_PROGRESS' || task.status === 'ASSIGNED') {
                    const btnRow = document.createElement('div');
                    btnRow.style.cssText = 'display: flex; gap: 4px; margin-top: 4px; align-self: flex-end;';

                    const execBtn = document.createElement('button');
                    execBtn.className = 'primary';
                    execBtn.style.cssText = 'font-size: 10px; padding: 2px 6px;';
                    execBtn.textContent = 'Execute';
                    execBtn.onclick = async () => {
                        execBtn.disabled = true;
                        execBtn.textContent = 'Running...';
                        try {
                            await window.headroomApi.headroom.executeTask(task.id);
                            await this.refreshData();
                            this.updateUpperRegion();
                        } catch (err) {
                            alert(`Failed: ${err.message}`);
                        }
                    };
                    btnRow.appendChild(execBtn);

                    const cancelBtn = document.createElement('button');
                    cancelBtn.className = 'danger';
                    cancelBtn.style.cssText = 'font-size: 10px; padding: 2px 6px;';
                    cancelBtn.textContent = 'Cancel';
                    cancelBtn.onclick = async () => {
                        await window.headroomApi.headroom.cancelTask(task.id, 'Cancelled by user');
                        await this.refreshData();
                        this.updateUpperRegion();
                    };
                    btnRow.appendChild(cancelBtn);
                    taskEl.appendChild(btnRow);
                }

                planCard.appendChild(taskEl);
            }

            parentEl.appendChild(planCard);
        }
    }

    renderWorkforceList(parentEl) {
        if (!this.hierarchy) {
            parentEl.innerHTML = '<div style="font-size: 11px; color: var(--text-muted); padding: 8px 0;">Loading workforce hierarchy...</div>';
            return;
        }

        const summary = document.createElement('div');
        summary.style.cssText = 'font-size: 11px; color: var(--text-secondary); line-height: 1.4; padding: 4px 0;';
        summary.innerHTML = `<strong>1 CEO &bull; 1 AI Director &bull; 4 Offices &bull; 20 Depts &bull; 80 Roles</strong>`;
        parentEl.appendChild(summary);

        for (const office of this.hierarchy.offices || []) {
            const card = document.createElement('div');
            card.className = 'office-card';
            card.innerHTML = `
                <div class="office-card-header">
                    <span>${office.name}</span>
                    <span style="font-size: 10px; color: var(--text-secondary);">${office.departments.length} Depts</span>
                </div>
            `;
            parentEl.appendChild(card);
        }
    }

    async renderAuditList(parentEl) {
        parentEl.innerHTML = '<div style="font-size: 11px; color: var(--text-muted); padding: 6px 0;">Loading audit logs...</div>';
        try {
            const logs = await window.headroomApi.headroom.getAuditLogs(20);
            parentEl.innerHTML = '';
            for (const log of logs) {
                const item = document.createElement('div');
                item.style.cssText = 'font-size: 11px; border-bottom: 1px solid var(--border-subtle); padding: 4px 0;';
                item.innerHTML = `
                    <div style="display: flex; justify-content: space-between;">
                        <strong style="color: var(--accent);">${log.actor}</strong>
                        <span style="color: var(--text-muted); font-size: 10px;">${new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div style="color: var(--text-primary);">${log.action}</div>
                `;
                parentEl.appendChild(item);
            }
        } catch {
            parentEl.innerHTML = '<div style="font-size: 11px; color: var(--text-muted);">Audit log unavailable.</div>';
        }
    }

    // Lower 60%: Chat Stream & Anchored Composer
    renderChatStream() {
        const streamEl = this.containerEl.querySelector('#agent-chat-stream');
        if (!streamEl) return;
        this.updateChatStream();
    }

    updateChatStream() {
        const streamEl = this.containerEl.querySelector('#agent-chat-stream');
        if (!streamEl) return;

        streamEl.innerHTML = '';
        for (const msg of this.messages) {
            const msgEl = document.createElement('div');
            msgEl.className = `chat-message ${msg.type}`;

            let speakerClass = msg.type;
            msgEl.innerHTML = `
                <div class="chat-speaker-header">
                    <span class="speaker-badge ${speakerClass}">${msg.sender}</span>
                    <span class="chat-time">${msg.time}</span>
                </div>
                <div class="chat-content">${msg.content}</div>
            `;
            streamEl.appendChild(msgEl);
        }

        streamEl.scrollTop = streamEl.scrollHeight;
    }

    renderComposer() {
        const composerEl = this.containerEl.querySelector('#agent-composer-anchor');
        if (!composerEl) return;

        composerEl.innerHTML = `
            <div class="composer-box">
                <div class="composer-header">
                    <span>Executive Objective Composer</span>
                    <span style="color: var(--accent);">CEO Direct Link</span>
                </div>
                <textarea class="composer-textarea" id="agent-objective-input" placeholder="Type objective for HEADROOM workforce (e.g. Implement comprehensive unit tests)..." rows="2"></textarea>
                <div class="composer-footer">
                    <span class="composer-hints">Press Propose to delegate to AI Director</span>
                    <button class="primary" id="agent-submit-btn">Propose Plan</button>
                </div>
            </div>
        `;

        const submitBtn = composerEl.querySelector('#agent-submit-btn');
        const input = composerEl.querySelector('#agent-objective-input');

        submitBtn.onclick = async () => {
            const text = input.value.trim();
            if (!text) return;

            // Add user message to conversation
            this.messages.push({
                id: `usr-${Date.now()}`,
                sender: 'CEO (User)',
                type: 'user',
                time: new Date().toLocaleTimeString(),
                content: text
            });
            input.value = '';
            this.updateChatStream();

            try {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Decomposing...';
                await window.headroomApi.headroom.submitObjective(text);
                await this.refreshData();
                this.updateUpperRegion();
            } catch (err) {
                this.messages.push({
                    id: `err-${Date.now()}`,
                    sender: 'System',
                    type: 'system',
                    time: new Date().toLocaleTimeString(),
                    content: `Error submitting objective: ${err.message}`
                });
                this.updateChatStream();
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Propose Plan';
            }
        };

        input.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                submitBtn.click();
            }
        });
    }
}
