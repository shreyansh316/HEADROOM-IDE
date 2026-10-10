const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('headroomApi', {
    // Window management
    window: {
        minimize: () => ipcRenderer.invoke('window:minimize'),
        maximize: () => ipcRenderer.invoke('window:maximize'),
        close: () => ipcRenderer.invoke('window:close'),
        isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
        onMaximizedChange: (callback) => {
            const listener = (event, isMaximized) => callback(isMaximized);
            ipcRenderer.on('window:maximized-state', listener);
            return () => ipcRenderer.removeListener('window:maximized-state', listener);
        },
        getPlatformInfo: () => ipcRenderer.invoke('window:getPlatformInfo')
    },

    // Workspace & Filesystem
    workspace: {
        openDirectoryDialog: () => ipcRenderer.invoke('workspace:openDirectoryDialog'),
        openFileDialog: () => ipcRenderer.invoke('workspace:openFileDialog'),
        setWorkspace: (dirPath) => ipcRenderer.invoke('workspace:setWorkspace', dirPath),
        getWorkspace: () => ipcRenderer.invoke('workspace:getWorkspace'),
        readTree: (dirPath) => ipcRenderer.invoke('workspace:readTree', dirPath),
        readFile: (filePath) => ipcRenderer.invoke('workspace:readFile', filePath),
        writeFile: (filePath, content) => ipcRenderer.invoke('workspace:writeFile', filePath, content),
        createFile: (filePath, content) => ipcRenderer.invoke('workspace:createFile', filePath, content),
        createDirectory: (dirPath) => ipcRenderer.invoke('workspace:createDirectory', dirPath),
        deleteEntry: (targetPath) => ipcRenderer.invoke('workspace:deleteEntry', targetPath),
        searchFiles: (query, options) => ipcRenderer.invoke('workspace:searchFiles', query, options)
    },

    // Terminal
    terminal: {
        createSession: (cwd) => ipcRenderer.invoke('terminal:createSession', cwd),
        sendInput: (sessionId, input) => ipcRenderer.invoke('terminal:sendInput', sessionId, input),
        killSession: (sessionId) => ipcRenderer.invoke('terminal:killSession', sessionId),
        onData: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('terminal:data', listener);
            return () => ipcRenderer.removeListener('terminal:data', listener);
        },
        onExit: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('terminal:exit', listener);
            return () => ipcRenderer.removeListener('terminal:exit', listener);
        }
    },

    // Git
    git: {
        getStatus: (dir) => ipcRenderer.invoke('git:getStatus', dir),
        getBranches: (dir) => ipcRenderer.invoke('git:getBranches', dir),
        getDiff: (filePath, staged, dir) => ipcRenderer.invoke('git:getDiff', filePath, staged, dir),
        getRecentCommits: (limit, dir) => ipcRenderer.invoke('git:getRecentCommits', limit, dir),
        stageFile: (filePath, dir) => ipcRenderer.invoke('git:stageFile', filePath, dir),
        unstageFile: (filePath, dir) => ipcRenderer.invoke('git:unstageFile', filePath, dir),
        stageAll: (dir) => ipcRenderer.invoke('git:stageAll', dir),
        commit: (message, dir) => ipcRenderer.invoke('git:commit', message, dir)
    },

    // Multi-Language Support, Diagnostics, Formatting & Debugging
    languages: {
        getRegistry: () => ipcRenderer.invoke('languages:getRegistry'),
        getCapabilityMatrix: () => ipcRenderer.invoke('languages:getCapabilityMatrix'),
        getLanguageForFile: (filePath) => ipcRenderer.invoke('languages:getLanguageForFile', filePath),
        diagnose: (langId) => ipcRenderer.invoke('languages:diagnose', langId),
        detectProjectTypes: (projectDir) => ipcRenderer.invoke('languages:detectProjectTypes', projectDir),
        getDiagnostics: (options) => ipcRenderer.invoke('languages:getDiagnostics', options),
        formatDocument: (options) => ipcRenderer.invoke('languages:formatDocument', options),
        runFile: (options) => ipcRenderer.invoke('languages:runFile', options),
        cancelRun: (runId) => ipcRenderer.invoke('languages:cancelRun', runId),
        onRunOutput: (callback) => {
            const listener = (event, data) => callback(data);
            ipcRenderer.on('languages:runOutput', listener);
            return () => ipcRenderer.removeListener('languages:runOutput', listener);
        },
        startDebug: (options) => ipcRenderer.invoke('languages:startDebug', options),
        debugContinue: (sessionId) => ipcRenderer.invoke('languages:debugContinue', sessionId),
        debugStepOver: (sessionId) => ipcRenderer.invoke('languages:debugStepOver', sessionId),
        debugStepInto: (sessionId) => ipcRenderer.invoke('languages:debugStepInto', sessionId),
        debugStepOut: (sessionId) => ipcRenderer.invoke('languages:debugStepOut', sessionId),
        debugPause: (sessionId) => ipcRenderer.invoke('languages:debugPause', sessionId),
        debugStop: (sessionId) => ipcRenderer.invoke('languages:debugStop', sessionId),
        debugSetBreakpoint: (sessionId, file, line) => ipcRenderer.invoke('languages:debugSetBreakpoint', sessionId, file, line),
        debugGetVariables: (sessionId, frameId) => ipcRenderer.invoke('languages:debugGetVariables', sessionId, frameId),
        debugEvaluate: (sessionId, expr, frameId) => ipcRenderer.invoke('languages:debugEvaluate', sessionId, expr, frameId),
        onDebugEvent: (callback) => {
            const listener = (event, payload) => callback(payload);
            ipcRenderer.on('languages:debugEvent', listener);
            return () => ipcRenderer.removeListener('languages:debugEvent', listener);
        }
    },

    debugger: {
        start: (options) => ipcRenderer.invoke('languages:startDebug', options),
        continue: (sessionId) => ipcRenderer.invoke('languages:debugContinue', sessionId),
        stepOver: (sessionId) => ipcRenderer.invoke('languages:debugStepOver', sessionId),
        stepInto: (sessionId) => ipcRenderer.invoke('languages:debugStepInto', sessionId),
        stepOut: (sessionId) => ipcRenderer.invoke('languages:debugStepOut', sessionId),
        pause: (sessionId) => ipcRenderer.invoke('languages:debugPause', sessionId),
        stop: (sessionId) => ipcRenderer.invoke('languages:debugStop', sessionId),
        setBreakpoint: (sessionId, file, line) => ipcRenderer.invoke('languages:debugSetBreakpoint', sessionId, file, line),
        getVariables: (sessionId, frameId) => ipcRenderer.invoke('languages:debugGetVariables', sessionId, frameId),
        evaluate: (sessionId, expr, frameId) => ipcRenderer.invoke('languages:debugEvaluate', sessionId, expr, frameId),
        onDebugEvent: (callback) => {
            const listener = (event, payload) => callback(payload);
            ipcRenderer.on('languages:debugEvent', listener);
            return () => ipcRenderer.removeListener('languages:debugEvent', listener);
        }
    },

    // HEADROOM Workforce & Agent Manager
    headroom: {
        getHierarchy: () => ipcRenderer.invoke('headroom:getHierarchy'),
        getProviderStatus: () => ipcRenderer.invoke('headroom:getProviderStatus'),
        setProviderConfig: (config) => ipcRenderer.invoke('headroom:setProviderConfig', config),
        submitObjective: (objectiveText, context) => ipcRenderer.invoke('headroom:submitObjective', objectiveText, context),
        getPlans: () => ipcRenderer.invoke('headroom:getPlans'),
        getTasks: () => ipcRenderer.invoke('headroom:getTasks'),
        approvePlan: (planId) => ipcRenderer.invoke('headroom:approvePlan', planId),
        rejectPlan: (planId, reason) => ipcRenderer.invoke('headroom:rejectPlan', planId, reason),
        advanceTaskProgress: (taskId, progress, status, evidence) => ipcRenderer.invoke('headroom:advanceTaskProgress', taskId, progress, status, evidence),
        getAuditLogs: (limit) => ipcRenderer.invoke('headroom:getAuditLogs', limit),
        getEventHistory: (sinceSeq, limit) => ipcRenderer.invoke('headroom:getEventHistory', sinceSeq, limit),
        executeTask: (taskId, options) => ipcRenderer.invoke('headroom:executeTask', taskId, options),
        getTaskDiff: (taskId) => ipcRenderer.invoke('headroom:getTaskDiff', taskId),
        cancelTask: (taskId, reason) => ipcRenderer.invoke('headroom:cancelTask', taskId, reason),
        onEvent: (callback) => {
            const listener = (event, eventData) => callback(eventData);
            ipcRenderer.on('headroom:event', listener);
            return () => ipcRenderer.removeListener('headroom:event', listener);
        }
    },

    // Agency profiles are reference guidance only; permissions remain HEADROOM-owned.
    agency: {
        listProfiles: (filters) => ipcRenderer.invoke('agency:listProfiles', filters),
        getProfile: (profileId) => ipcRenderer.invoke('agency:getProfile', profileId)
    },

    // Extensions (Open VSX)
    extensions: {
        search: (query, options) => ipcRenderer.invoke('extensions:search', query, options),
        getDetails: (namespace, name) => ipcRenderer.invoke('extensions:getDetails', namespace, name),
        getInstalled: () => ipcRenderer.invoke('extensions:getInstalled'),
        install: (ext) => ipcRenderer.invoke('extensions:install', ext),
        uninstall: (extensionId) => ipcRenderer.invoke('extensions:uninstall', extensionId),
        checkCompatibility: (ext) => ipcRenderer.invoke('extensions:checkCompatibility', ext),
        activate: (extensionId) => ipcRenderer.invoke('extensions:activate', extensionId),
        deactivate: (extensionId) => ipcRenderer.invoke('extensions:deactivate', extensionId),
        getActiveTheme: () => ipcRenderer.invoke('extensions:getActiveTheme'),
        getAuditLogs: (limit) => ipcRenderer.invoke('extensions:getAuditLogs', limit)
    },

    // AI API Gateway
    gateway: {
        getModels: () => ipcRenderer.invoke('gateway:getModels'),
        getProviders: () => ipcRenderer.invoke('gateway:getProviders'),
        setCredential: (provider, apiKey) => ipcRenderer.invoke('gateway:setCredential', provider, apiKey),
        setEndpoint: (config) => ipcRenderer.invoke('gateway:setEndpoint', config),
        testConnection: (provider) => ipcRenderer.invoke('gateway:testConnection', provider),
        chat: (params) => ipcRenderer.invoke('gateway:chat', params),
        getUsageStats: (contextId) => ipcRenderer.invoke('gateway:getUsageStats', contextId),
        exportUsage: (format, contextId) => ipcRenderer.invoke('gateway:exportUsage', format, contextId),
        setBudgetPolicy: (scopeId, policy) => ipcRenderer.invoke('gateway:setBudgetPolicy', scopeId, policy),
        getBudgetSummary: (scopeId) => ipcRenderer.invoke('gateway:getBudgetSummary', scopeId),
        grantExecutiveBudgetOverride: (overrideParams) => ipcRenderer.invoke('gateway:grantExecutiveBudgetOverride', overrideParams),
        revokeExecutiveBudgetOverride: (scopeId) => ipcRenderer.invoke('gateway:revokeExecutiveBudgetOverride', scopeId)
    },

    // Account & Session Lifecycle
    account: {
        getSession: () => ipcRenderer.invoke('account:getSession'),
        listProfiles: () => ipcRenderer.invoke('account:listProfiles'),
        signIn: (profileId, password) => ipcRenderer.invoke('account:signIn', profileId, password),
        signOut: () => ipcRenderer.invoke('account:signOut'),
        unlock: (password) => ipcRenderer.invoke('account:unlock', password),
        createProfile: (profileData) => ipcRenderer.invoke('account:createProfile', profileData),
        completeOnboarding: () => ipcRenderer.invoke('account:completeOnboarding'),
        getAuditLogs: (limit) => ipcRenderer.invoke('account:getAuditLogs', limit)
    },

    // Unreal Engine & Game Development Workflows (PHASE-37)
    unreal: {
        discoverProjects: (rootDir) => ipcRenderer.invoke('unreal:discoverProjects', rootDir),
        validateProject: (uprojectPath) => ipcRenderer.invoke('unreal:validateProject', uprojectPath),
        detectEngines: () => ipcRenderer.invoke('unreal:detectEngines'),
        analyzeProject: (projectDir) => ipcRenderer.invoke('unreal:analyzeProject', projectDir),
        executeBuild: (params) => ipcRenderer.invoke('unreal:executeBuild', params),
        parseLog: (logContent) => ipcRenderer.invoke('unreal:parseLog', logContent),
        discoverTests: (projectDir) => ipcRenderer.invoke('unreal:discoverTests', projectDir)
    }
,

    // Workflows & Automation (PHASE-38)
    workflows: {
        listRecipes: (options) => ipcRenderer.invoke('workflow:listRecipes', options),
        getRecipe: (recipeId) => ipcRenderer.invoke('workflow:getRecipe', recipeId),
        execute: (recipeId, parameters, options) => ipcRenderer.invoke('workflow:execute', recipeId, parameters, options),
        cancel: (executionId) => ipcRenderer.invoke('workflow:cancel', executionId),
        getHistory: () => ipcRenderer.invoke('workflow:getHistory')
    },

    // Diagnostics & Self-Repair (PHASE-41)
    diagnostics: {
        runHealthDoctor: () => ipcRenderer.invoke('diagnostics:runHealthDoctor'),
        checkDatabaseIntegrity: () => ipcRenderer.invoke('diagnostics:checkDatabaseIntegrity'),
        reclaimStaleLocks: () => ipcRenderer.invoke('diagnostics:reclaimStaleLocks'),
        exportBundle: () => ipcRenderer.invoke('diagnostics:exportBundle')
    },

    // Backup & Restore (PHASE-40)
    backup: {
        createSnapshot: () => ipcRenderer.invoke('backup:createSnapshot'),
        listJournal: () => ipcRenderer.invoke('backup:listJournal'),
        restoreDatabase: (backupFile) => ipcRenderer.invoke('backup:restoreDatabase', backupFile),
        exportBundle: (destinationPath) => ipcRenderer.invoke('backup:exportBundle', destinationPath),
        importBundle: (bundlePath) => ipcRenderer.invoke('backup:importBundle', bundlePath)
    },

    // Governance & Policy (PHASE-39)
    governance: {
        getPolicy: () => ipcRenderer.invoke('governance:getPolicy'),
        getComplianceLogs: (limit) => ipcRenderer.invoke('governance:getComplianceLogs', limit),
        exportAuditLog: (format) => ipcRenderer.invoke('governance:exportAuditLog', format)
    },

    // Accessibility & UX (PHASE-42)
    accessibility: {
        getSettings: () => ipcRenderer.invoke('accessibility:getSettings'),
        updateSettings: (updates) => ipcRenderer.invoke('accessibility:updateSettings', updates),
        auditFocus: (elements) => ipcRenderer.invoke('accessibility:auditFocus', elements)
    }
});
