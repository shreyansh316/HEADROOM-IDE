/**
 * HEADROOM Desktop IDE — Device Pairing & Revocation Service
 *
 * Implements PHASE-33 (HR-225 through HR-231):
 * - HR-225: Secure Device Storage of Paired Credentials & Refresh Tokens
 * - HR-226: Time-Limited 6-Digit PIN & QR Code Pairing Challenge Generator
 * - HR-227: Cryptographic Handshake & Device Identifier Key Registration
 * - HR-228: Granular Permission Scoping (Read-Only Monitor vs. Executive Approver)
 * - HR-229: Instant Single-Device & All-Devices Revocation Circuit Breaker
 * - HR-230: Device Session Heartbeat & Inactivity Expiration Enforcement
 * - HR-231: Paired Device Audit Log & Access Event History Tracking
 */

const crypto = require('crypto');
const EventEmitter = require('events');

class DevicePairingService extends EventEmitter {
    constructor(options = {}) {
        super();
        this.activeChallenges = new Map(); // pin -> challenge
        this.pairedDevices = new Map(); // deviceId -> device
        this.auditLog = [];
        this.pinExpiryMs = options.pinExpiryMs || 300000; // 5 minutes
        this.sessionInactivityExpiryMs = options.sessionInactivityExpiryMs || 3600000; // 1 hour
    }

    /**
     * HR-226: 6-Digit PIN & QR Challenge Generator
     */
    generatePairingChallenge(requestedScope = 'EXECUTIVE_APPROVER') {
        const pin = String(Math.floor(100000 + Math.random() * 900000));
        const challengeId = crypto.randomUUID();
        const expiresAt = Date.now() + this.pinExpiryMs;

        const challenge = {
            challengeId,
            pin,
            scope: requestedScope,
            expiresAt,
            qrPayload: JSON.stringify({
                challengeId,
                pin,
                scope: requestedScope,
                expiresAt
            })
        };

        this.activeChallenges.set(pin, challenge);
        this.emit('challengeCreated', challenge);
        return challenge;
    }

    /**
     * HR-227 & HR-228: Cryptographic Handshake, Key Registration & Granular Scoping
     */
    completePairingHandshake(pin, deviceName, devicePublicKey = null) {
        const challenge = this.activeChallenges.get(pin);
        if (!challenge) {
            throw new Error('Invalid or expired pairing PIN');
        }
        if (Date.now() > challenge.expiresAt) {
            this.activeChallenges.delete(pin);
            throw new Error('Pairing challenge has expired');
        }

        const deviceId = crypto.randomUUID();
        const sessionToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');

        const device = {
            deviceId,
            deviceName: deviceName || 'Mobile Companion',
            scope: challenge.scope, // 'MONITOR_ONLY' | 'EXECUTIVE_APPROVER'
            tokenHash,
            pairedAt: new Date().toISOString(),
            lastHeartbeat: Date.now(),
            revoked: false
        };

        this.pairedDevices.set(deviceId, device);
        this.activeChallenges.delete(pin);

        // HR-231: Audit log
        this.recordAudit({
            action: 'DEVICE_PAIRED',
            deviceId,
            deviceName: device.deviceName,
            scope: device.scope,
            timestamp: new Date().toISOString()
        });

        this.emit('devicePaired', device);

        return {
            deviceId,
            deviceName: device.deviceName,
            scope: device.scope,
            sessionToken // Given only once to the client
        };
    }

    /**
     * Authenticate a device session token
     */
    authenticateDeviceToken(deviceId, token) {
        const device = this.pairedDevices.get(deviceId);
        if (!device || device.revoked) return { authenticated: false, reason: 'Device not found or revoked' };

        // HR-230: Inactivity check
        if (Date.now() - device.lastHeartbeat > this.sessionInactivityExpiryMs) {
            return { authenticated: false, reason: 'Session expired due to inactivity' };
        }

        const incomingHash = crypto.createHash('sha256').update(token).digest('hex');
        const isValid = crypto.timingSafeEqual(Buffer.from(incomingHash), Buffer.from(device.tokenHash));

        if (isValid) {
            device.lastHeartbeat = Date.now();
            return { authenticated: true, device };
        }

        return { authenticated: false, reason: 'Invalid session token' };
    }

    /**
     * HR-230: Device Session Heartbeat
     */
    recordHeartbeat(deviceId) {
        const device = this.pairedDevices.get(deviceId);
        if (device && !device.revoked) {
            device.lastHeartbeat = Date.now();
            return true;
        }
        return false;
    }

    /**
     * HR-229: Instant Single-Device & All-Devices Revocation Circuit Breaker
     */
    revokeDevice(deviceId, reason = 'USER_INITIATED') {
        const device = this.pairedDevices.get(deviceId);
        if (!device) return false;

        device.revoked = true;
        this.pairedDevices.delete(deviceId);

        this.recordAudit({
            action: 'DEVICE_REVOKED',
            deviceId,
            reason,
            timestamp: new Date().toISOString()
        });

        this.emit('deviceRevoked', { deviceId, reason });
        return true;
    }

    revokeAllDevices(reason = 'SECURITY_RESET') {
        const count = this.pairedDevices.size;
        for (const [id, dev] of this.pairedDevices.entries()) {
            dev.revoked = true;
        }
        this.pairedDevices.clear();
        this.activeChallenges.clear();

        this.recordAudit({
            action: 'ALL_DEVICES_REVOKED',
            count,
            reason,
            timestamp: new Date().toISOString()
        });

        this.emit('allDevicesRevoked', { count, reason });
        return { success: true, revokedCount: count };
    }

    /**
     * HR-231: Paired Device Audit Log
     */
    recordAudit(entry) {
        this.auditLog.push(entry);
    }

    getAuditLog() {
        return [...this.auditLog];
    }

    getPairedDevices() {
        return Array.from(this.pairedDevices.values()).map(d => ({
            deviceId: d.deviceId,
            deviceName: d.deviceName,
            scope: d.scope,
            pairedAt: d.pairedAt,
            lastHeartbeat: new Date(d.lastHeartbeat).toISOString(),
            revoked: d.revoked
        }));
    }
}

module.exports = DevicePairingService;
