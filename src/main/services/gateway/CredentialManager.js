/** Secure provider credential storage backed by Electron safeStorage. */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const STORAGE_VERSION = 2;
const PROVIDERS = new Set(['openai', 'anthropic', 'gemini', 'compatible']);

class CredentialManager {
    constructor({ storagePath, safeStorage } = {}) {
        this.storagePath = storagePath || null;
        this.safeStorage = safeStorage || null;
        this.credentials = new Map();
        this.endpointConfigs = new Map();
        this.secureStorageReady = false;
        this.legacyCredentialFileDetected = false;

        if (this.storagePath && this.safeStorage) this.initializeSecureStorage(this.storagePath, this.safeStorage);
    }

    initializeSecureStorage(storagePath, safeStorage) {
        if (typeof storagePath !== 'string' || !storagePath.trim()
            || typeof safeStorage?.encryptString !== 'function'
            || typeof safeStorage?.decryptString !== 'function'
            || typeof safeStorage?.isEncryptionAvailable !== 'function') {
            throw new TypeError('Encrypted credential storage requires a path and Electron safeStorage API.');
        }
        this.storagePath = path.resolve(storagePath);
        this.safeStorage = safeStorage;
        this.secureStorageReady = this.isEncryptionAvailable();
        if (!this.secureStorageReady) return false;
        if (fs.existsSync(this.storagePath)) this.loadFromFile();
        return true;
    }

    isEncryptionAvailable() {
        if (!this.safeStorage?.isEncryptionAvailable?.()) return false;
        if (process.platform === 'linux' && typeof this.safeStorage.getSelectedStorageBackend === 'function') {
            const backend = this.safeStorage.getSelectedStorageBackend();
            return backend !== 'basic_text' && backend !== 'unknown';
        }
        return true;
    }

    loadFromFile() {
        if (!this.secureStorageReady || !this.storagePath) return false;
        try {
            const data = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
            if (data.version !== STORAGE_VERSION || !data.encryptedCredentials || typeof data.encryptedCredentials !== 'object') {
                this.legacyCredentialFileDetected = Boolean(data.credentials);
                return false;
            }
            for (const [provider, ciphertext] of Object.entries(data.encryptedCredentials)) {
                if (!PROVIDERS.has(provider) || typeof ciphertext !== 'string' || ciphertext.length > 16_384) continue;
                try {
                    const secret = this.safeStorage.decryptString(Buffer.from(ciphertext, 'base64'));
                    if (typeof secret === 'string' && secret.trim()) this.credentials.set(provider, secret);
                } catch {
                    // A corrupt or OS-inaccessible secret remains unavailable; never fall back to plaintext.
                }
            }
            if (data.encryptedEndpoints && typeof data.encryptedEndpoints === 'object' && !Array.isArray(data.encryptedEndpoints)) {
                for (const [provider, ciphertext] of Object.entries(data.encryptedEndpoints)) {
                    if (!PROVIDERS.has(provider) || typeof ciphertext !== 'string' || ciphertext.length > 32_768) continue;
                    try {
                        const endpoint = JSON.parse(this.safeStorage.decryptString(Buffer.from(ciphertext, 'base64')));
                        if (endpoint && typeof endpoint === 'object' && !Array.isArray(endpoint)) this.endpointConfigs.set(provider, endpoint);
                    } catch {
                        // Keep an inaccessible endpoint configuration unavailable.
                    }
                }
            }
            return true;
        } catch {
            return false;
        }
    }

    saveToFile() {
        if (!this.storagePath) return false;
        if (!this.secureStorageReady || !this.isEncryptionAvailable()) {
            throw new Error('OS-backed credential encryption is unavailable; credentials were not saved.');
        }
        const dir = path.dirname(this.storagePath);
        fs.mkdirSync(dir, { recursive: true });
        const encryptedCredentials = {};
        for (const [provider, secret] of this.credentials) {
            encryptedCredentials[provider] = this.safeStorage.encryptString(secret).toString('base64');
        }
        const encryptedEndpoints = {};
        for (const [provider, endpoint] of this.endpointConfigs) {
            encryptedEndpoints[provider] = this.safeStorage.encryptString(JSON.stringify(endpoint)).toString('base64');
        }
        const payload = JSON.stringify({
            version: STORAGE_VERSION,
            encryptedCredentials,
            encryptedEndpoints
        });
        const temporaryPath = `${this.storagePath}.${randomUUID()}.tmp`;
        try {
            fs.writeFileSync(temporaryPath, payload, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
            fs.renameSync(temporaryPath, this.storagePath);
            return true;
        } catch (error) {
            try { fs.rmSync(temporaryPath, { force: true }); } catch {}
            throw new Error(`Could not persist encrypted credentials: ${error.message}`);
        }
    }

    setCredential(provider, apiKey) {
        if (!PROVIDERS.has(provider)) throw new Error('Unsupported provider identifier.');
        const previous = this.credentials.get(provider);
        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') this.credentials.delete(provider);
        else this.credentials.set(provider, apiKey.trim());
        try { this.saveToFile(); }
        catch (error) {
            if (previous === undefined) this.credentials.delete(provider);
            else this.credentials.set(provider, previous);
            throw error;
        }
    }

    getCredential(provider) {
        return this.credentials.get(provider) || null;
    }

    hasCredential(provider) {
        const value = this.credentials.get(provider);
        return typeof value === 'string' && value.trim().length > 0;
    }

    removeCredential(provider) {
        const previous = this.credentials.get(provider);
        this.credentials.delete(provider);
        try { this.saveToFile(); }
        catch (error) {
            if (previous !== undefined) this.credentials.set(provider, previous);
            throw error;
        }
    }

    setEndpointConfig(providerId, config) {
        if (!PROVIDERS.has(providerId) || !config || typeof config !== 'object' || Array.isArray(config)) {
            throw new TypeError('A supported provider and endpoint configuration object are required.');
        }
        const previous = this.endpointConfigs.get(providerId);
        this.endpointConfigs.set(providerId, config);
        try { this.saveToFile(); }
        catch (error) {
            if (previous === undefined) this.endpointConfigs.delete(providerId);
            else this.endpointConfigs.set(providerId, previous);
            throw error;
        }
    }

    getEndpointConfig(providerId) {
        return this.endpointConfigs.get(providerId) || null;
    }

    getSafeStatus() {
        const supported = ['openai', 'anthropic', 'gemini', 'compatible', 'mock'];
        return supported.map((provider) => {
            const hasKey = provider === 'mock' || this.hasCredential(provider);
            const rawKey = this.credentials.get(provider) || '';
            let masked = '';
            if (rawKey.length > 8) masked = `${rawKey.substring(0, 4)}...${rawKey.substring(rawKey.length - 4)}`;
            else if (rawKey.length > 0) masked = '****';
            return { provider, configured: hasKey, maskedKey: masked,
                endpoint: this.endpointConfigs.get(provider)?.baseUrl || null };
        });
    }
}

module.exports = CredentialManager;
