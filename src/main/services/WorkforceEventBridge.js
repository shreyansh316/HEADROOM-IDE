const { EventEmitter } = require('events');

const MAX_EVENT_BUFFER = 500;
const MAX_METADATA_LENGTH = 1000;

function sanitizeValue(val, depth = 0) {
    if (depth > 5) return '[Truncated]';
    if (val === null || val === undefined) return val;
    if (typeof val === 'string') {
        // Redact potential secrets or long auth strings
        let sanitized = val.replace(/(api[_-]?key|secret|token|password|bearer\s+[a-zA-Z0-9_\-.]+)/gi, '[REDACTED]');
        if (sanitized.length > MAX_METADATA_LENGTH) {
            sanitized = sanitized.slice(0, MAX_METADATA_LENGTH) + '... [truncated]';
        }
        return sanitized;
    }
    if (typeof val === 'number' || typeof val === 'boolean') return val;
    if (Array.isArray(val)) {
        return val.slice(0, 50).map(item => sanitizeValue(item, depth + 1));
    }
    if (typeof val === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(val)) {
            if (/key|secret|token|password|auth/i.test(k) && typeof v === 'string') {
                out[k] = '[REDACTED]';
            } else {
                out[k] = sanitizeValue(v, depth + 1);
            }
        }
        return out;
    }
    return String(val);
}

class WorkforceEventBridge extends EventEmitter {
    constructor(options = {}) {
        super();
        this.maxBuffer = options.maxBuffer || MAX_EVENT_BUFFER;
        this.events = [];
        this.sequence = 0;
        this.attachedWindows = new Set();
        this.seenEventIds = new Set();
    }

    publish(eventData) {
        if (!eventData || typeof eventData !== 'object') {
            throw new TypeError('Event data must be an object.');
        }

        const seq = ++this.sequence;
        const eventId = eventData.id || `evt-${Date.now()}-${seq}`;
        if (this.seenEventIds.has(eventId)) {
            // Prevent duplicate event delivery
            return null;
        }
        this.seenEventIds.add(eventId);
        if (this.seenEventIds.size > 2000) {
            const first = this.seenEventIds.values().next().value;
            this.seenEventIds.delete(first);
        }

        const sanitized = {
            id: eventId,
            sequence: seq,
            type: eventData.type || 'TASK_PROGRESS',
            taskId: eventData.taskId || null,
            planId: eventData.planId || null,
            aggregateId: eventData.aggregateId || eventData.taskId || eventId,
            actor: eventData.actor || 'SYSTEM',
            status: eventData.status || null,
            progress: typeof eventData.progress === 'number' ? eventData.progress : null,
            office: eventData.office || null,
            department: eventData.department || null,
            position: eventData.position || null,
            employeeName: eventData.employeeName || null,
            action: eventData.action || null,
            toolActivity: eventData.toolActivity ? sanitizeValue(eventData.toolActivity) : null,
            evidence: eventData.evidence ? sanitizeValue(eventData.evidence) : null,
            diff: eventData.diff ? sanitizeValue(eventData.diff) : null,
            payload: eventData.payload ? sanitizeValue(eventData.payload) : {},
            occurredAt: eventData.occurredAt || new Date().toISOString()
        };

        // Add to ordered circular buffer
        this.events.push(sanitized);
        if (this.events.length > this.maxBuffer) {
            this.events.shift();
        }

        // Emit internally
        this.emit('event', sanitized);

        // Forward to all attached Electron windows safely
        this.forwardToWindows(sanitized);

        return sanitized;
    }

    attachWindow(browserWindow) {
        if (!browserWindow || typeof browserWindow.webContents?.send !== 'function') {
            return;
        }

        this.attachedWindows.add(browserWindow);

        browserWindow.on('closed', () => {
            this.attachedWindows.delete(browserWindow);
        });
    }

    detachWindow(browserWindow) {
        this.attachedWindows.delete(browserWindow);
    }

    forwardToWindows(event) {
        for (const win of this.attachedWindows) {
            try {
                if (!win.isDestroyed() && win.webContents) {
                    win.webContents.send('headroom:event', event);
                }
            } catch (err) {
                console.warn('[WorkforceEventBridge] Failed to forward event to window:', err.message);
                this.attachedWindows.delete(win);
            }
        }
    }

    getEventsSince(lastSequence = 0, limit = 100) {
        const seq = Number(lastSequence) || 0;
        const lim = Math.min(Math.max(1, Number(limit) || 50), this.maxBuffer);
        return this.events.filter(e => e.sequence > seq).slice(0, lim);
    }

    getRecentEvents(limit = 50) {
        const lim = Math.min(Math.max(1, Number(limit) || 50), this.maxBuffer);
        return this.events.slice(-lim);
    }

    clear() {
        this.events = [];
        this.seenEventIds.clear();
        this.sequence = 0;
    }
}

module.exports = WorkforceEventBridge;
