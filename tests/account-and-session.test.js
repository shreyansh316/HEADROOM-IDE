import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import AccountService from '../src/main/services/AccountService.js';

describe('Account & Session Service Lifecycle (PHASE-04 & PHASE-05)', () => {
    let tempDir;
    let accountService;

    beforeEach(() => {
        tempDir = path.join(os.tmpdir(), `headroom-test-auth-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`);
        fs.mkdirSync(tempDir, { recursive: true });
        accountService = new AccountService({ storageDir: tempDir });
    });

    afterEach(() => {
        try {
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        } catch (e) {
            // Cleanup error ignored
        }
    });

    it('HR-022: initializes default local developer profile upon first run', () => {
        const session = accountService.getPublicSession();
        expect(session.authenticated).toBe(true);
        expect(session.name).toBe('Local Developer');
        expect(session.handle).toBe('developer');
        expect(session.role).toBe('Lead Architect');
        expect(session.onboardingComplete).toBe(false);
        expect(session.isLocked).toBe(false);
    });

    it('HR-023: manages onboarding completion lifecycle', () => {
        const before = accountService.getPublicSession();
        expect(before.onboardingComplete).toBe(false);

        const res = accountService.completeOnboarding();
        expect(res.ok).toBe(true);

        const after = accountService.getPublicSession();
        expect(after.onboardingComplete).toBe(true);
    });

    it('HR-024 & HR-028: validates sign-in credentials and returns structured errors on failure', () => {
        const failed = accountService.signIn('developer', 'wrong-password');
        expect(failed.ok).toBe(false);
        expect(failed.error).toMatch(/Invalid profile credentials/i);

        const success = accountService.signIn('developer', 'headroom');
        expect(success.ok).toBe(true);
        expect(success.session.authenticated).toBe(true);
        expect(success.session.handle).toBe('developer');
    });

    it('HR-025: executes sign-out tearing down session while preserving profile and audit ledger', () => {
        const out = accountService.signOut();
        expect(out.ok).toBe(true);

        const session = accountService.getPublicSession();
        expect(session.authenticated).toBe(false);

        // Verify profiles and audit entries remain durable
        const profiles = accountService.listProfiles();
        expect(profiles.length).toBeGreaterThan(0);

        const audit = accountService.getAuditLogs(10);
        expect(audit.some(a => a.action === 'SESSION_SIGNED_OUT')).toBe(true);
    });

    it('HR-026: supports profile creation and profile switching', () => {
        const createRes = accountService.createProfile({
            name: 'Sarah Connor',
            handle: 'sconnor',
            email: 'sarah@skynet-defense.org',
            role: 'Security Engineer',
            password: 'resistance-pwd'
        });
        expect(createRes.ok).toBe(true);
        expect(createRes.session.name).toBe('Sarah Connor');
        expect(createRes.session.handle).toBe('sconnor');

        const profiles = accountService.listProfiles();
        expect(profiles.length).toBe(2);

        // Switch back to original developer
        const switchRes = accountService.signIn('developer', 'headroom');
        expect(switchRes.ok).toBe(true);
        expect(switchRes.session.handle).toBe('developer');
    });

    it('HR-027, HR-030 & HR-031: enforces session locking and re-authentication unlocking', () => {
        expect(accountService.getPublicSession().isLocked).toBe(false);

        // Simulate timeout trigger
        accountService.currentSession.isLocked = true;
        expect(accountService.getPublicSession().isLocked).toBe(true);

        // Failed unlock
        const badUnlock = accountService.unlockSession('wrong-pwd');
        expect(badUnlock.ok).toBe(false);
        expect(accountService.getPublicSession().isLocked).toBe(true);

        // Successful unlock
        const goodUnlock = accountService.unlockSession('headroom');
        expect(goodUnlock.ok).toBe(true);
        expect(accountService.getPublicSession().isLocked).toBe(false);
    });

    it('HR-032 & HR-035: generates hardware device fingerprint and records audit entries', () => {
        const session = accountService.getPublicSession();
        expect(session.deviceFingerprint).toBeDefined();
        expect(session.deviceFingerprint.length).toBe(16);

        const logs = accountService.getAuditLogs(20);
        expect(logs.length).toBeGreaterThan(0);
        expect(logs[0].deviceFingerprint).toBe(session.deviceFingerprint);
    });
});
