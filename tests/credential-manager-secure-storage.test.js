import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import CredentialManager from '../src/main/services/gateway/CredentialManager.js';

const temporaryDirectories = [];

function createTempPath(name) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'headroom-credentials-'));
    temporaryDirectories.push(directory);
    return path.join(directory, name);
}

function createSafeStorage() {
    return {
        isEncryptionAvailable: () => true,
        encryptString: (value) => Buffer.from(`cipher:${value}`, 'utf8'),
        decryptString: (value) => value.toString('utf8').replace(/^cipher:/, '')
    };
}

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('CredentialManager OS-backed persistence contract', () => {
    it('persists ciphertext and reloads credentials through the safeStorage port', () => {
        const storagePath = createTempPath('provider-credentials-v1.json');
        const safeStorage = createSafeStorage();
        const manager = new CredentialManager();
        manager.initializeSecureStorage(storagePath, safeStorage);
        manager.setCredential('openai', 'sk-test-secret-123');

        const raw = fs.readFileSync(storagePath, 'utf8');
        expect(raw).not.toContain('sk-test-secret-123');
        expect(raw).toContain('encryptedCredentials');
        const reloaded = new CredentialManager({ storagePath, safeStorage });
        expect(reloaded.getCredential('openai')).toBe('sk-test-secret-123');
    });

    it('refuses persistence when OS-backed encryption is unavailable', () => {
        const manager = new CredentialManager();
        manager.initializeSecureStorage(createTempPath('provider-credentials-v1.json'), {
            ...createSafeStorage(), isEncryptionAvailable: () => false
        });
        expect(() => manager.setCredential('gemini', 'secret')).toThrow(/encryption is unavailable/i);
        expect(manager.hasCredential('gemini')).toBe(false);
    });

    it('does not load or overwrite an unencrypted legacy payload', () => {
        const storagePath = createTempPath('legacy.json');
        fs.writeFileSync(storagePath, JSON.stringify({ credentials: { gemini: 'legacy-secret' } }));
        const manager = new CredentialManager({ storagePath, safeStorage: createSafeStorage() });
        expect(manager.getCredential('gemini')).toBeNull();
        expect(manager.legacyCredentialFileDetected).toBe(true);
        expect(fs.readFileSync(storagePath, 'utf8')).toContain('legacy-secret');
    });
});
