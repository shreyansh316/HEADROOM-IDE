/**
 * HEADROOM Desktop IDE — Desktop & Mobile Continuity Service
 *
 * Implements PHASE-34 (HR-232 through HR-238):
 * - HR-232: Bidirectional Desktop-Mobile State Synchronization Engine
 * - HR-233: Push Approval Request Dispatch from Desktop to Paired Mobile
 * - HR-234: Mobile Decision Sync & Desktop State Transition Reconciliation
 * - HR-235: Unified Mission Context Handoff between Desktop and Mobile
 * - HR-236: Mobile-Triggered Emergency Pause Propagation to IDE Desktop
 * - HR-237: Optimistic UI Updates with Server Acknowledgement Tracking
 * - HR-238: Continuity Session Recovery & Resumption on Desktop Wakeup
 */

const EventEmitter = require('events');

class ContinuitySyncService extends EventEmitter {
    constructor(options = {}) {
        super();
        this.desktopState = {
            activeFile: null,
            cursorPosition: null,
            openFiles: [],
            missionStatus: 'IDLE',
            activeMissionId: null,
            isEmergencyPaused: false,
            lastSyncedAt: Date.now()
        };
        this.pendingApprovals = new Map();
        this.ackSequence = 0;
        this.optimisticUpdates = new Map();
        this.pairingService = options.pairingService || null;
        this.workforceEngine = options.workforceEngine || null;
    }

    /**
     * HR-232: State Synchronization
     */
    updateDesktopState(partialState) {
        Object.assign(this.desktopState, partialState, { lastSyncedAt: Date.now() });
        this.emit('stateSynced', this.desktopState);
        return this.desktopState;
    }

    getSnapshot() {
        return { ...this.desktopState };
    }

    /**
     * HR-233: Push Approval Request Dispatch
     */
    dispatchApprovalToMobile(approvalRequest) {
        const id = approvalRequest.requestId || `approval-${Date.now()}`;
        const record = {
            id,
            action: approvalRequest.action,
            summary: approvalRequest.summary,
            riskLevel: approvalRequest.riskLevel || 'MEDIUM',
            status: 'PENDING',
            dispatchedAt: Date.now()
        };
        this.pendingApprovals.set(id, record);
        this.emit('approvalPushedToMobile', record);
        return record;
    }

    /**
     * HR-234: Mobile Decision Sync & Reconciliation
     */
    reconcileMobileDecision(approvalId, decision = 'APPROVE', notes = '') {
        const approval = this.pendingApprovals.get(approvalId);
        if (!approval) {
            throw new Error(`Approval request "${approvalId}" not found or already resolved`);
        }

        approval.status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        approval.resolvedAt = Date.now();
        approval.notes = notes;

        this.pendingApprovals.delete(approvalId);

        // Notify desktop workforce engine
        this.emit('decisionReconciled', {
            approvalId,
            decision: approval.status,
            notes
        });

        return {
            success: true,
            approvalId,
            status: approval.status
        };
    }

    /**
     * HR-235: Unified Mission Context Handoff
     */
    createHandoffPackage(missionId) {
        return {
            handoffId: `handoff-${Date.now()}`,
            timestamp: new Date().toISOString(),
            missionId: missionId || this.desktopState.activeMissionId,
            desktopState: { ...this.desktopState },
            pendingApprovals: Array.from(this.pendingApprovals.values())
        };
    }

    /**
     * HR-236: Mobile-Triggered Emergency Pause Propagation
     */
    triggerMobileEmergencyPause(reason = 'MOBILE_TRIGGERED') {
        this.desktopState.isEmergencyPaused = true;
        this.desktopState.missionStatus = 'EMERGENCY_STOPPED';

        if (this.workforceEngine?.triggerEmergencyStop) {
            this.workforceEngine.triggerEmergencyStop(reason);
        }

        this.emit('emergencyPausePropagated', {
            paused: true,
            reason,
            timestamp: Date.now()
        });

        return { paused: true, reason };
    }

    resumeFromMobilePause() {
        this.desktopState.isEmergencyPaused = false;
        this.desktopState.missionStatus = 'RUNNING';

        if (this.workforceEngine?.resumeFromEmergencyStop) {
            this.workforceEngine.resumeFromEmergencyStop();
        }

        this.emit('emergencyPauseResumed', {
            resumed: true,
            timestamp: Date.now()
        });

        return { resumed: true };
    }

    /**
     * HR-237: Optimistic UI Updates & Acknowledgement Tracking
     */
    registerOptimisticUpdate(clientUpdateId, updatePayload) {
        const seq = ++this.ackSequence;
        this.optimisticUpdates.set(clientUpdateId, {
            seq,
            payload: updatePayload,
            status: 'APPLIED_LOCALLY',
            timestamp: Date.now()
        });
        return { ackSeq: seq, clientUpdateId, status: 'ACKNOWLEDGED' };
    }

    confirmUpdateAck(clientUpdateId) {
        if (this.optimisticUpdates.has(clientUpdateId)) {
            this.optimisticUpdates.delete(clientUpdateId);
            return true;
        }
        return false;
    }

    /**
     * HR-238: Continuity Session Recovery
     */
    recoverContinuitySession(cachedSnapshot) {
        if (cachedSnapshot && typeof cachedSnapshot === 'object') {
            Object.assign(this.desktopState, cachedSnapshot, { lastSyncedAt: Date.now() });
        }
        this.emit('continuitySessionRecovered', this.desktopState);
        return { recovered: true, state: this.desktopState };
    }
}

module.exports = ContinuitySyncService;
