/**
 * HEADROOM Desktop IDE — Notifications & Activity Center Service
 *
 * Implements PHASE-28 (HR-190 through HR-196):
 * - HR-190: Real-Time Workforce Activity Feed Event Ingestion
 * - HR-191: Priority-Based Notification Categorization (INFO, WARNING, ERROR, CRITICAL)
 * - HR-192: Interactive CEO Approval Action Notifications & Responses
 * - HR-193: Budget Alert & Token Consumption Threshold Warnings
 * - HR-194: Activity Badge Counters & Unread Indicator Management
 * - HR-195: Notification History Persistence & Searchable Activity Archive
 * - HR-196: Toast Dispatch & Custom Notification Dismissal Lifecycle
 */

const EventEmitter = require('events');

class NotificationService extends EventEmitter {
    constructor(options = {}) {
        super();
        this.notifications = [];
        this.toasts = new Map();
        this.nextId = 1;
        this.maxHistory = options.maxHistory || 500;
        this.approvalCallbacks = new Map();
    }

    /**
     * HR-190 & HR-191: Ingestion & Priority-based Categorization
     */
    addNotification({ title, message, priority = 'INFO', category = 'GENERAL', metadata = {} }) {
        const validPriorities = ['INFO', 'WARNING', 'ERROR', 'CRITICAL'];
        const normalizedPriority = validPriorities.includes(priority.toUpperCase()) 
            ? priority.toUpperCase() 
            : 'INFO';

        const id = `notif-${Date.now()}-${this.nextId++}`;
        const item = {
            id,
            title,
            message,
            priority: normalizedPriority,
            category,
            metadata,
            read: false,
            createdAt: new Date().toISOString()
        };

        this.notifications.unshift(item);
        if (this.notifications.length > this.maxHistory) {
            this.notifications.pop();
        }

        this.emit('notificationAdded', item);
        this.emit('badgeCountChanged', this.getUnreadCount());

        return item;
    }

    /**
     * Ingest workforce events and convert to activity notifications
     */
    ingestWorkforceEvent(event) {
        const type = event.type || 'WORKFORCE_EVENT';
        let priority = 'INFO';
        if (type.includes('FAIL') || type.includes('ERROR')) priority = 'ERROR';
        if (type.includes('APPROVAL_REQUIRED')) priority = 'CRITICAL';
        if (type.includes('WARN')) priority = 'WARNING';

        return this.addNotification({
            title: `Workforce: ${event.employeeTitle || event.position || 'Agent'}`,
            message: event.description || event.message || `Lifecycle event: ${type}`,
            priority,
            category: 'WORKFORCE',
            metadata: event
        });
    }

    /**
     * HR-192: Interactive CEO Approval Action Notifications & Responses
     */
    createApprovalNotification(approvalRequest, onDecision = null) {
        const id = `approval-${Date.now()}-${this.nextId++}`;
        const item = {
            id,
            title: `Executive Approval Required: ${approvalRequest.actionName || 'Sensitive Action'}`,
            message: approvalRequest.summary || `Agent requires permission to execute: ${approvalRequest.command || approvalRequest.action}`,
            priority: 'CRITICAL',
            category: 'APPROVAL',
            metadata: {
                requestId: approvalRequest.requestId || id,
                details: approvalRequest,
                status: 'PENDING'
            },
            read: false,
            createdAt: new Date().toISOString()
        };

        if (onDecision) {
            this.approvalCallbacks.set(item.metadata.requestId, onDecision);
        }

        this.notifications.unshift(item);
        this.emit('approvalRequested', item);
        this.emit('notificationAdded', item);
        this.emit('badgeCountChanged', this.getUnreadCount());

        return item;
    }

    resolveApproval(requestId, approved = true, notes = '') {
        const target = this.notifications.find(n => n.metadata?.requestId === requestId);
        if (target) {
            target.metadata.status = approved ? 'APPROVED' : 'REJECTED';
            target.metadata.resolutionNotes = notes;
            target.read = true;
        }

        const callback = this.approvalCallbacks.get(requestId);
        if (callback) {
            try {
                callback(approved, notes);
            } catch (e) {
                console.error('[NotificationService] Approval callback error:', e);
            }
            this.approvalCallbacks.delete(requestId);
        }

        this.emit('approvalResolved', { requestId, approved, notes });
        this.emit('badgeCountChanged', this.getUnreadCount());

        return { success: true, requestId, status: target?.metadata?.status };
    }

    /**
     * HR-193: Budget Alert & Token Consumption Threshold Warnings
     */
    checkBudgetThreshold(usageTracker, thresholdPercent = 80) {
        if (!usageTracker) return null;
        const currentCost = usageTracker.getTotalCost ? usageTracker.getTotalCost() : (usageTracker.currentCost || 0);
        const maxBudget = usageTracker.maxBudget || 10.0;
        const percentage = (currentCost / maxBudget) * 100;

        if (percentage >= 100) {
            return this.addNotification({
                title: 'CRITICAL: Budget Limit Reached (100%)',
                message: `Current spend ($${currentCost.toFixed(2)}) has reached or exceeded max budget ($${maxBudget.toFixed(2)}).`,
                priority: 'CRITICAL',
                category: 'BUDGET',
                metadata: { currentCost, maxBudget, percentage }
            });
        } else if (percentage >= thresholdPercent) {
            return this.addNotification({
                title: `Budget Alert: ${percentage.toFixed(0)}% Consumed`,
                message: `Current spend ($${currentCost.toFixed(2)}) has reached ${percentage.toFixed(1)}% of your $${maxBudget.toFixed(2)} ceiling.`,
                priority: 'WARNING',
                category: 'BUDGET',
                metadata: { currentCost, maxBudget, percentage }
            });
        }
        return null;
    }

    /**
     * HR-194: Activity Badge Counters & Unread Indicator Management
     */
    getUnreadCount() {
        return this.notifications.filter(n => !n.read).length;
    }

    markAsRead(id) {
        const item = this.notifications.find(n => n.id === id);
        if (item && !item.read) {
            item.read = true;
            this.emit('badgeCountChanged', this.getUnreadCount());
            return true;
        }
        return false;
    }

    markAllRead() {
        let changed = false;
        for (const item of this.notifications) {
            if (!item.read) {
                item.read = true;
                changed = true;
            }
        }
        if (changed) {
            this.emit('badgeCountChanged', 0);
        }
        return this.notifications.length;
    }

    /**
     * HR-195: Notification History Persistence & Searchable Activity Archive
     */
    getHistory({ category, priority, query, limit = 50, offset = 0 } = {}) {
        let list = this.notifications;

        if (category) {
            list = list.filter(n => n.category.toUpperCase() === category.toUpperCase());
        }
        if (priority) {
            list = list.filter(n => n.priority.toUpperCase() === priority.toUpperCase());
        }
        if (query) {
            const q = query.toLowerCase();
            list = list.filter(n => 
                n.title.toLowerCase().includes(q) || 
                n.message.toLowerCase().includes(q)
            );
        }

        return {
            total: list.length,
            unreadCount: this.getUnreadCount(),
            items: list.slice(offset, offset + limit)
        };
    }

    /**
     * HR-196: Toast Dispatch & Custom Notification Dismissal Lifecycle
     */
    dispatchToast(message, type = 'info', durationMs = 4000) {
        const id = `toast-${Date.now()}-${this.nextId++}`;
        const toast = {
            id,
            message,
            type,
            durationMs,
            createdAt: Date.now()
        };

        this.toasts.set(id, toast);
        this.emit('toastDispatched', toast);

        if (durationMs > 0) {
            setTimeout(() => {
                this.dismissToast(id);
            }, durationMs);
        }

        return toast;
    }

    dismissToast(id) {
        if (this.toasts.has(id)) {
            this.toasts.delete(id);
            this.emit('toastDismissed', id);
            return true;
        }
        return false;
    }
}

module.exports = NotificationService;
