/**
 * HEADROOM Desktop IDE — Team & Enterprise Readiness Service
 *
 * Implements PHASE-39 (HR-267 through HR-273):
 * - HR-267: Role-Based Access Control (RBAC) & Team Permission Policies
 * - HR-268: Enterprise Audit Log Export (JSON/CSV with Tamper-Resistant Signatures)
 * - HR-269: Shared Workspace Governance & Collaborative Config Synchronization
 * - HR-270: Centralized Security Policy Enforcement
 * - HR-271: Multi-Seat License Verification & Offline Grace Period Management
 * - HR-272: Enterprise Proxy & Corporate CA Certificate Trust Store Integration
 * - HR-273: Compliance Event Journaling (SOC2/ISO27001 Activity Logging)
 */

const crypto = require('crypto');
const EventEmitter = require('events');

const ROLES = {
    ADMIN: ['READ_WORKSPACE', 'WRITE_WORKSPACE', 'EXECUTE_COMMANDS', 'EXECUTE_BUILDS', 'INVOKE_AI', 'MODIFY_SETTINGS', 'ADMIN_SETTINGS', 'EXECUTIVE_APPROVAL'],
    ENGINEER: ['READ_WORKSPACE', 'WRITE_WORKSPACE', 'EXECUTE_COMMANDS', 'EXECUTE_BUILDS', 'INVOKE_AI', 'MODIFY_SETTINGS'],
    VIEWER: ['READ_WORKSPACE', 'VIEW_LOGS', 'VIEW_METRICS']
};

class EnterpriseGovernanceService extends EventEmitter {
    constructor(options = {}) {
        super();
        this.currentRole = options.initialRole || 'ADMIN';
        this.complianceLogs = [];
        this.lastLogHash = '0000000000000000000000000000000000000000000000000000000000000000';
        this.proxyConfig = options.proxyConfig || null;
        this.caCertificates = [];
        this.licenseInfo = options.licenseInfo || {
            licenseKey: 'HR-ENTERPRISE-EVAL',
            seats: 5,
            tier: 'ENTERPRISE',
            expiresAt: Date.now() + (365 * 24 * 3600 * 1000),
            offlineGracePeriodDays: 30,
            lastValidatedAt: Date.now()
        };
        this.sharedConfig = options.sharedConfig || {
            enforcePreCommitSecretScan: true,
            maxBudgetCeiling: 100.0,
            blockedDependencies: ['left-pad', 'crypto-js-eval']
        };
    }

    /**
     * HR-267: Role-Based Access Control (RBAC)
     */
    setRole(role) {
        if (!ROLES[role.toUpperCase()]) {
            throw new Error(`Invalid role: ${role}. Must be one of: ${Object.keys(ROLES).join(', ')}`);
        }
        const oldRole = this.currentRole;
        this.currentRole = role.toUpperCase();
        this.logComplianceEvent('ROLE_CHANGED', { oldRole, newRole: this.currentRole });
        return { success: true, currentRole: this.currentRole };
    }

    getPolicySummary() {
        return {
            role: this.currentRole,
            permissions: ROLES[this.currentRole] || [],
            license: this.validateLicense(),
            sharedConfig: { ...this.sharedConfig },
            proxyActive: Boolean(this.proxyConfig),
            isLocalEnforcementOnly: true
        };
    }

    getComplianceLogs(limit = 50) {
        return this.complianceLogs.slice(-limit);
    }

    hasPermission(permission) {
        const allowed = ROLES[this.currentRole] || [];
        return allowed.includes(permission);
    }

    enforcePermission(permission) {
        if (!this.hasPermission(permission)) {
            const err = `Enterprise Security: Current role "${this.currentRole}" lacks required permission "${permission}"`;
            this.logComplianceEvent('PERMISSION_DENIED', { permission, role: this.currentRole });
            throw new Error(err);
        }
        return true;
    }

    /**
     * HR-273: Compliance Event Journaling (with Cryptographic Chain)
     */
    logComplianceEvent(action, details = {}, actor = 'system') {
        const timestamp = new Date().toISOString();
        const eventId = `comp-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
        
        // Cryptographic tamper-resistant chaining
        const payloadToHash = `${this.lastLogHash}|${eventId}|${action}|${actor}|${timestamp}|${JSON.stringify(details)}`;
        const hash = crypto.createHash('sha256').update(payloadToHash).digest('hex');

        const record = {
            eventId,
            action,
            actor,
            timestamp,
            details,
            previousHash: this.lastLogHash,
            signatureHash: hash
        };

        this.lastLogHash = hash;
        this.complianceLogs.push(record);
        if (this.complianceLogs.length > 500) {
            this.complianceLogs.shift();
        }

        this.emit('complianceEvent', record);
        return record;
    }

    /**
     * HR-268: Enterprise Audit Log Export (JSON or CSV)
     */
    exportAuditLog(format = 'json') {
        if (format.toLowerCase() === 'csv') {
            const headers = 'eventId,action,actor,timestamp,signatureHash\n';
            const rows = this.complianceLogs.map(l => 
                `"${l.eventId}","${l.action}","${l.actor}","${l.timestamp}","${l.signatureHash}"`
            ).join('\n');
            return headers + rows;
        }

        return {
            exportedAt: new Date().toISOString(),
            totalEvents: this.complianceLogs.length,
            chainVerification: this.verifyLogChain(),
            events: [...this.complianceLogs]
        };
    }

    verifyLogChain() {
        let prev = '0000000000000000000000000000000000000000000000000000000000000000';
        for (const log of this.complianceLogs) {
            const payload = `${prev}|${log.eventId}|${log.action}|${log.actor}|${log.timestamp}|${JSON.stringify(log.details)}`;
            const computed = crypto.createHash('sha256').update(payload).digest('hex');
            if (computed !== log.signatureHash) {
                return { valid: false, brokenAt: log.eventId };
            }
            prev = log.signatureHash;
        }
        return { valid: true };
    }

    /**
     * HR-269 & HR-270: Governance & Central Policy Enforcement
     */
    validateProjectAgainstPolicy(projectConfig = {}) {
        const violations = [];
        if (this.sharedConfig.enforcePreCommitSecretScan && projectConfig.secretScanEnabled === false) {
            violations.push('Mandatory enterprise pre-commit secret scanning cannot be disabled');
        }

        if (projectConfig.budget && projectConfig.budget > this.sharedConfig.maxBudgetCeiling) {
            violations.push(`Project budget ($${projectConfig.budget}) exceeds enterprise ceiling ($${this.sharedConfig.maxBudgetCeiling})`);
        }

        if (projectConfig.dependencies && Array.isArray(projectConfig.dependencies)) {
            for (const dep of projectConfig.dependencies) {
                if (this.sharedConfig.blockedDependencies.includes(dep)) {
                    violations.push(`Dependency "${dep}" is blocked by enterprise security policy`);
                }
            }
        }

        return {
            compliant: violations.length === 0,
            violations
        };
    }

    /**
     * HR-271: License & Multi-Seat Verification
     */
    validateLicense() {
        const now = Date.now();
        const isExpired = now > this.licenseInfo.expiresAt;
        const daysSinceValidation = Math.floor((now - this.licenseInfo.lastValidatedAt) / (24 * 3600 * 1000));
        const withinGracePeriod = daysSinceValidation <= this.licenseInfo.offlineGracePeriodDays;

        const valid = !isExpired || withinGracePeriod;
        return {
            valid,
            tier: this.licenseInfo.tier,
            seats: this.licenseInfo.seats,
            isExpired,
            withinGracePeriod,
            daysSinceValidation
        };
    }

    /**
     * HR-272: Enterprise Proxy & CA Certificates
     */
    setProxyConfig(proxyUrl, bypassList = []) {
        this.proxyConfig = { proxyUrl, bypassList };
        this.logComplianceEvent('PROXY_CONFIGURED', { proxyUrl });
        return { success: true, proxyConfig: this.proxyConfig };
    }

    addCustomCertificate(certPem) {
        if (!certPem || !certPem.includes('CERTIFICATE')) {
            throw new Error('Invalid PEM certificate string');
        }
        const fingerprint = crypto.createHash('sha256').update(certPem).digest('hex');
        this.caCertificates.push({ fingerprint, addedAt: new Date().toISOString() });
        this.logComplianceEvent('CA_CERT_INSTALLED', { fingerprint });
        return { success: true, fingerprint };
    }
}

module.exports = EnterpriseGovernanceService;
