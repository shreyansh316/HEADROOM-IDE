/**
 * HEADROOM Desktop IDE — Settings & Workspace Profiles Service
 *
 * Implements PHASE-29 (HR-197 through HR-203):
 * - HR-197: Layered Settings Hierarchy (System Default -> User Profile -> Workspace Local)
 * - HR-198: Schema Validation & Type Enforcement for User Preferences
 * - HR-199: Dynamic Keybinding Customization & Shortcut Conflict Resolution
 * - HR-200: Workspace Profile Switching & Isolated Configuration Sets
 * - HR-201: Settings Export & Portable JSON Backup Generation
 * - HR-202: Settings Import with Schema Migration & Validation
 * - HR-203: Live Settings Change Event Broadcasting across IDE Subsystems
 */

const EventEmitter = require('events');

const SYSTEM_DEFAULTS = {
    'editor.fontSize': 14,
    'editor.tabSize': 4,
    'editor.wordWrap': 'on',
    'editor.theme': 'headroom-dark',
    'telemetry.enabled': false,
    'ai.model': 'anthropic/claude-3.5-sonnet',
    'ai.temperature': 0.2,
    'gateway.budgetLimit': 25.0,
    'terminal.defaultShell': 'powershell.exe'
};

const SCHEMA_DEFINITIONS = {
    'editor.fontSize': { type: 'number', min: 8, max: 48 },
    'editor.tabSize': { type: 'number', min: 1, max: 8 },
    'editor.wordWrap': { type: 'string', enum: ['off', 'on', 'wordWrapColumn'] },
    'editor.theme': { type: 'string' },
    'telemetry.enabled': { type: 'boolean' },
    'ai.model': { type: 'string' },
    'ai.temperature': { type: 'number', min: 0.0, max: 2.0 },
    'gateway.budgetLimit': { type: 'number', min: 0.0, max: 1000.0 },
    'terminal.defaultShell': { type: 'string' }
};

class SettingsProfileService extends EventEmitter {
    constructor(options = {}) {
        super();
        this.systemDefaults = { ...SYSTEM_DEFAULTS };
        this.userSettings = options.userSettings || {};
        this.workspaceOverrides = options.workspaceOverrides || {};
        this.keybindings = options.keybindings || new Map([
            ['workbench.action.save', 'ctrl+s'],
            ['workbench.action.find', 'ctrl+f'],
            ['workbench.action.terminal.toggle', 'ctrl+`'],
            ['workbench.action.quickOpen', 'ctrl+p']
        ]);
        this.activeProfile = options.initialProfile || 'default';
        this.profiles = new Map([
            ['default', { name: 'Default Development', settings: {} }],
            ['agentic-heavy', { name: 'AI Autonomous Heavy', settings: { 'ai.temperature': 0.1, 'gateway.budgetLimit': 50.0 } }],
            ['minimalist', { name: 'Focus & Minimalist', settings: { 'editor.wordWrap': 'off' } }]
        ]);
    }

    /**
     * HR-197: Layered Settings Hierarchy
     * System Default -> Active Profile -> User -> Workspace
     */
    get(key) {
        if (key in this.workspaceOverrides) {
            return this.workspaceOverrides[key];
        }
        if (key in this.userSettings) {
            return this.userSettings[key];
        }
        const profile = this.profiles.get(this.activeProfile);
        if (profile && profile.settings && key in profile.settings) {
            return profile.settings[key];
        }
        if (key in this.systemDefaults) {
            return this.systemDefaults[key];
        }
        return undefined;
    }

    getAllResolved() {
        const resolved = { ...this.systemDefaults };
        const profile = this.profiles.get(this.activeProfile);
        if (profile?.settings) {
            Object.assign(resolved, profile.settings);
        }
        Object.assign(resolved, this.userSettings);
        Object.assign(resolved, this.workspaceOverrides);
        return resolved;
    }

    /**
     * HR-198: Schema Validation & Type Enforcement
     */
    validateSetting(key, value) {
        const schema = SCHEMA_DEFINITIONS[key];
        if (!schema) {
            return { valid: true }; // allow custom/unregistered settings
        }

        if (typeof value !== schema.type) {
            return { valid: false, error: `Setting "${key}" expects type "${schema.type}", received "${typeof value}"` };
        }

        if (schema.type === 'number') {
            if (schema.min !== undefined && value < schema.min) {
                return { valid: false, error: `Setting "${key}" value ${value} is less than min ${schema.min}` };
            }
            if (schema.max !== undefined && value > schema.max) {
                return { valid: false, error: `Setting "${key}" value ${value} is greater than max ${schema.max}` };
            }
        }

        if (schema.enum && !schema.enum.includes(value)) {
            return { valid: false, error: `Setting "${key}" value must be one of [${schema.enum.join(', ')}]` };
        }

        return { valid: true };
    }

    set(key, value, scope = 'user') {
        const validation = this.validateSetting(key, value);
        if (!validation.valid) {
            throw new Error(`Validation Error: ${validation.error}`);
        }

        const oldValue = this.get(key);
        if (scope === 'workspace') {
            this.workspaceOverrides[key] = value;
        } else {
            this.userSettings[key] = value;
        }

        // HR-203: Live Settings Change Event Broadcasting
        this.emit('settingsChanged', {
            key,
            newValue: value,
            oldValue,
            scope,
            resolved: this.getAllResolved()
        });

        return { success: true, key, value, scope };
    }

    /**
     * HR-199: Dynamic Keybinding Customization & Shortcut Conflict Resolution
     */
    setKeybinding(command, shortcut) {
        const normalized = shortcut.toLowerCase().replace(/\s+/g, '');
        const conflicts = [];

        for (const [cmd, existingShortcut] of this.keybindings.entries()) {
            if (cmd !== command && existingShortcut === normalized) {
                conflicts.push(cmd);
            }
        }

        this.keybindings.set(command, normalized);

        this.emit('keybindingChanged', { command, shortcut: normalized, conflicts });
        return {
            command,
            shortcut: normalized,
            hasConflict: conflicts.length > 0,
            conflictingCommands: conflicts
        };
    }

    getKeybinding(command) {
        return this.keybindings.get(command);
    }

    /**
     * HR-200: Workspace Profile Switching & Isolated Configuration Sets
     */
    switchProfile(profileId) {
        if (!this.profiles.has(profileId)) {
            throw new Error(`Profile "${profileId}" does not exist`);
        }
        const previousProfile = this.activeProfile;
        this.activeProfile = profileId;

        this.emit('profileSwitched', {
            activeProfile: profileId,
            previousProfile,
            resolved: this.getAllResolved()
        });

        return { success: true, activeProfile: profileId };
    }

    createProfile(profileId, name, settings = {}) {
        if (this.profiles.has(profileId)) {
            throw new Error(`Profile "${profileId}" already exists`);
        }
        this.profiles.set(profileId, { name, settings });
        return { success: true, profileId, name };
    }

    /**
     * HR-201: Settings Export & Portable JSON Backup Generation
     */
    exportSettings() {
        return {
            version: '2.0.0',
            exportedAt: new Date().toISOString(),
            activeProfile: this.activeProfile,
            userSettings: this.userSettings,
            workspaceOverrides: this.workspaceOverrides,
            keybindings: Array.from(this.keybindings.entries()),
            profiles: Array.from(this.profiles.entries())
        };
    }

    /**
     * HR-202: Settings Import with Schema Migration & Validation
     */
    importSettings(payload) {
        if (!payload || typeof payload !== 'object') {
            throw new Error('Invalid import payload: object expected');
        }

        const errors = [];
        if (payload.userSettings && typeof payload.userSettings === 'object') {
            for (const [k, v] of Object.entries(payload.userSettings)) {
                const check = this.validateSetting(k, v);
                if (!check.valid) {
                    errors.push(check.error);
                }
            }
        }

        if (errors.length > 0) {
            return { success: false, errors };
        }

        if (payload.userSettings) Object.assign(this.userSettings, payload.userSettings);
        if (payload.keybindings && Array.isArray(payload.keybindings)) {
            for (const [cmd, sc] of payload.keybindings) {
                this.keybindings.set(cmd, sc);
            }
        }
        if (payload.profiles && Array.isArray(payload.profiles)) {
            for (const [id, prof] of payload.profiles) {
                this.profiles.set(id, prof);
            }
        }

        this.emit('settingsImported', this.getAllResolved());
        return { success: true, importedKeys: Object.keys(payload.userSettings || {}).length };
    }
}

module.exports = SettingsProfileService;
