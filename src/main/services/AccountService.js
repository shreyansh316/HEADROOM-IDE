/**
 * HEADROOM IDE — Account & Session Service
 *
 * Implements local developer profiles, secure password hashing (PBKDF2),
 * cryptographically strong session tokens, session expiration, inactivity timeout,
 * and machine identity fingerprinting.
 *
 * 100% Pure JavaScript. Zero TypeScript.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

class AccountService {
    constructor({ storageDir = null } = {}) {
        this.storageDir = storageDir || path.join(os.homedir(), '.headroom');
        this.profilesFile = path.join(this.storageDir, 'profiles.json');
        this.sessionsFile = path.join(this.storageDir, 'sessions.json');
        this.auditLogFile = path.join(this.storageDir, 'auth_audit.log');

        this.currentSession = null;
        this.sessionDurationMs = 24 * 60 * 60 * 1000; // 24 hours
        this.inactivityTimeoutMs = 30 * 60 * 1000; // 30 minutes
        this.lastActivityTime = Date.now();

        this._ensureStorage();
        this._loadOrCreateDefaultProfile();
    }

    _ensureStorage() {
        if (!fs.existsSync(this.storageDir)) {
            try {
                fs.mkdirSync(this.storageDir, { recursive: true });
            } catch (e) {
                console.warn('[AccountService] Could not create storage directory:', e.message);
            }
        }
    }

    _getDeviceFingerprint() {
        const raw = `${os.hostname()}:${os.platform()}:${os.arch()}:${os.cpus().length}`;
        return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16);
    }

    _hashPassword(password, salt = null) {
        const s = salt || crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync(password, s, 100000, 64, 'sha512').toString('hex');
        return { salt: s, hash };
    }

    _verifyPassword(password, salt, storedHash) {
        const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
        return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
    }

    _readProfiles() {
        try {
            if (fs.existsSync(this.profilesFile)) {
                return JSON.parse(fs.readFileSync(this.profilesFile, 'utf8'));
            }
        } catch (e) {
            console.warn('[AccountService] Error reading profiles:', e.message);
        }
        return { profiles: [], activeProfileId: null };
    }

    _writeProfiles(data) {
        try {
            this._ensureStorage();
            fs.writeFileSync(this.profilesFile, JSON.stringify(data, null, 2), 'utf8');
        } catch (e) {
            console.warn('[AccountService] Error writing profiles:', e.message);
        }
    }

    _recordAudit(action, profileId, details = {}) {
        const entry = {
            timestamp: new Date().toISOString(),
            action,
            profileId,
            deviceFingerprint: this._getDeviceFingerprint(),
            details
        };
        try {
            this._ensureStorage();
            fs.appendFileSync(this.auditLogFile, JSON.stringify(entry) + '\n', 'utf8');
        } catch (e) {
            // Ignore audit write errors
        }
    }

    _loadOrCreateDefaultProfile() {
        const data = this._readProfiles();
        if (data.profiles.length === 0) {
            // Create default initial developer profile
            const defaultId = 'profile-local-dev';
            const { salt, hash } = this._hashPassword('headroom');
            const defaultProfile = {
                id: defaultId,
                name: 'Local Developer',
                handle: 'developer',
                email: 'dev@headroom.local',
                role: 'Lead Architect',
                created: new Date().toISOString(),
                salt,
                passwordHash: hash,
                onboardingComplete: false
            };
            data.profiles.push(defaultProfile);
            data.activeProfileId = defaultId;
            this._writeProfiles(data);
            this._recordAudit('PROFILE_INITIALIZED', defaultId, { name: defaultProfile.name });
        }

        // Initialize active session
        const active = data.profiles.find(p => p.id === data.activeProfileId) || data.profiles[0];
        this._createSession(active);
    }

    _createSession(profile) {
        const token = crypto.randomBytes(32).toString('hex');
        const now = Date.now();
        this.currentSession = {
            token,
            profileId: profile.id,
            name: profile.name,
            handle: profile.handle,
            email: profile.email,
            role: profile.role,
            onboardingComplete: Boolean(profile.onboardingComplete),
            deviceFingerprint: this._getDeviceFingerprint(),
            createdAt: now,
            expiresAt: now + this.sessionDurationMs,
            isLocked: false
        };
        this.lastActivityTime = now;
        this._recordAudit('SESSION_CREATED', profile.id, { tokenPreview: token.substring(0, 8) + '...' });
        return this.getPublicSession();
    }

    getPublicSession() {
        this.checkInactivity();
        if (!this.currentSession) {
            return { authenticated: false };
        }
        return {
            authenticated: true,
            profileId: this.currentSession.profileId,
            name: this.currentSession.name,
            handle: this.currentSession.handle,
            email: this.currentSession.email,
            role: this.currentSession.role,
            onboardingComplete: this.currentSession.onboardingComplete,
            deviceFingerprint: this.currentSession.deviceFingerprint,
            expiresAt: this.currentSession.expiresAt,
            isLocked: this.currentSession.isLocked
        };
    }

    touchActivity() {
        this.lastActivityTime = Date.now();
    }

    checkInactivity() {
        if (!this.currentSession || this.currentSession.isLocked) return;
        const now = Date.now();
        if (now - this.lastActivityTime > this.inactivityTimeoutMs) {
            this.currentSession.isLocked = true;
            this._recordAudit('SESSION_LOCKED_INACTIVITY', this.currentSession.profileId);
        }
        if (now > this.currentSession.expiresAt) {
            this.currentSession = null;
            this._recordAudit('SESSION_EXPIRED', null);
        }
    }

    unlockSession(password) {
        if (!this.currentSession) {
            return { ok: false, error: 'No active session to unlock.' };
        }
        const data = this._readProfiles();
        const profile = data.profiles.find(p => p.id === this.currentSession.profileId);
        if (!profile) {
            return { ok: false, error: 'Profile not found.' };
        }

        const valid = this._verifyPassword(password, profile.salt, profile.passwordHash);
        if (!valid) {
            this._recordAudit('UNLOCK_FAILED_BAD_PASSWORD', profile.id);
            return { ok: false, error: 'Invalid password.' };
        }

        this.currentSession.isLocked = false;
        this.lastActivityTime = Date.now();
        this._recordAudit('SESSION_UNLOCKED', profile.id);
        return { ok: true, session: this.getPublicSession() };
    }

    signIn(profileIdOrHandle, password) {
        const data = this._readProfiles();
        const profile = data.profiles.find(
            p => p.id === profileIdOrHandle || p.handle.toLowerCase() === profileIdOrHandle.toLowerCase()
        );

        if (!profile) {
            return { ok: false, error: 'Profile not found.' };
        }

        const valid = this._verifyPassword(password, profile.salt, profile.passwordHash);
        if (!valid) {
            this._recordAudit('SIGN_IN_FAILED', profile.id);
            return { ok: false, error: 'Invalid profile credentials.' };
        }

        data.activeProfileId = profile.id;
        this._writeProfiles(data);
        const session = this._createSession(profile);
        return { ok: true, session };
    }

    signOut() {
        if (this.currentSession) {
            this._recordAudit('SESSION_SIGNED_OUT', this.currentSession.profileId);
            this.currentSession = null;
        }
        return { ok: true, authenticated: false };
    }

    createProfile({ name, handle, email, role, password }) {
        if (!name || !handle || !password) {
            return { ok: false, error: 'Name, handle, and password are required.' };
        }

        const data = this._readProfiles();
        const existing = data.profiles.find(p => p.handle.toLowerCase() === handle.toLowerCase());
        if (existing) {
            return { ok: false, error: `Handle "${handle}" is already taken.` };
        }

        const id = `profile-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const { salt, hash } = this._hashPassword(password);
        const newProfile = {
            id,
            name,
            handle,
            email: email || `${handle}@headroom.local`,
            role: role || 'Developer',
            created: new Date().toISOString(),
            salt,
            passwordHash: hash,
            onboardingComplete: true
        };

        data.profiles.push(newProfile);
        data.activeProfileId = id;
        this._writeProfiles(data);
        this._recordAudit('PROFILE_CREATED', id, { name, handle });

        const session = this._createSession(newProfile);
        return { ok: true, session };
    }

    listProfiles() {
        const data = this._readProfiles();
        return data.profiles.map(p => ({
            id: p.id,
            name: p.name,
            handle: p.handle,
            email: p.email,
            role: p.role,
            isActive: p.id === data.activeProfileId,
            onboardingComplete: Boolean(p.onboardingComplete)
        }));
    }

    completeOnboarding() {
        if (!this.currentSession) return { ok: false };
        const data = this._readProfiles();
        const profile = data.profiles.find(p => p.id === this.currentSession.profileId);
        if (profile) {
            profile.onboardingComplete = true;
            this._writeProfiles(data);
        }
        this.currentSession.onboardingComplete = true;
        this._recordAudit('ONBOARDING_COMPLETED', this.currentSession.profileId);
        return { ok: true, session: this.getPublicSession() };
    }

    getAuditLogs(limit = 50) {
        if (!fs.existsSync(this.auditLogFile)) return [];
        try {
            const lines = fs.readFileSync(this.auditLogFile, 'utf8').trim().split('\n').filter(Boolean);
            return lines.slice(-limit).map(l => JSON.parse(l)).reverse();
        } catch (e) {
            return [];
        }
    }
}

module.exports = AccountService;
