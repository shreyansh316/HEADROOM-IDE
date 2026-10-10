const { app, BrowserWindow, ipcMain, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const WorkspaceService = require('./services/WorkspaceService');
const GitService = require('./services/GitService');
const TerminalService = require('./services/TerminalService');
const HeadroomAdapter = require('./services/HeadroomAdapter');
const LanguageSupportService = require('./services/LanguageSupportService');
const ExtensionService = require('./services/ExtensionService');
const AccountService = require('./services/AccountService');
const AgencyProfileCatalog = require('./services/AgencyProfileCatalog');

let mainWindow = null;
const workspaceService = new WorkspaceService();
const gitService = new GitService();
const terminalService = new TerminalService();
const headroomAdapter = new HeadroomAdapter();
const languageService = new LanguageSupportService();
const extensionService = new ExtensionService();
let agencyProfileCatalog = null;
try {
    agencyProfileCatalog = new AgencyProfileCatalog();
} catch (e) {
    console.warn('[HEADROOM IDE] AgencyProfileCatalog initialization notice:', e.message);
    if (e.diagnostic) {
        console.warn('[HEADROOM IDE] AgencyProfileCatalog diagnostic:', JSON.stringify(e.diagnostic));
    }
}

// Set initial workspace
const defaultWorkspace = fs.existsSync('D:\\codex room\\headroom')
    ? 'D:\\codex room\\headroom'
    : process.cwd();

try {
    workspaceService.setWorkspace(defaultWorkspace);
    gitService.setWorkingDirectory(defaultWorkspace);
    headroomAdapter.setWorkspaceDatabase(defaultWorkspace);
} catch (e) {
    console.warn('[HEADROOM IDE] Could not set default workspace:', e.message);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 680,
        title: 'HEADROOM IDE',
        frame: false,
        backgroundColor: '#1E1E24',
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    const publishMaximizedState = () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('window:maximized-state', mainWindow.isMaximized());
        }
    };
    mainWindow.on('maximize', publishMaximizedState);
    mainWindow.on('unmaximize', publishMaximizedState);

    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://open-vsx.org; img-src 'self' data: https:;"
                ]
            }
        });
    });

    const indexPath = path.join(__dirname, '..', 'renderer', 'index.html');
    mainWindow.loadFile(indexPath);

    headroomAdapter.getEventBridge().attachWindow(mainWindow);

    mainWindow.on('closed', () => {
        headroomAdapter.getEventBridge().detachWindow(mainWindow);
        terminalService.closeAll();
        mainWindow = null;
    });
}

function registerIpcHandler(channel, handler) {
    ipcMain.handle(channel, (event, ...args) => {
        const frame = event.senderFrame;
        if (!mainWindow
            || event.sender !== mainWindow.webContents
            || frame !== mainWindow.webContents.mainFrame
            || frame.url !== mainWindow.webContents.getURL()
            || new URL(frame.url).protocol !== 'file:') {
            throw new Error('Rejected IPC call from an untrusted renderer: ' + channel);
        }
        return handler(event, ...args);
    });
}
// Window control handlers
registerIpcHandler('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
});

registerIpcHandler('window:maximize', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
    return Boolean(mainWindow?.isMaximized());
});

registerIpcHandler('window:isMaximized', () => Boolean(mainWindow?.isMaximized()));

registerIpcHandler('window:close', () => {
    if (mainWindow) mainWindow.close();
});

registerIpcHandler('window:getPlatformInfo', () => {
    return {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        electronVersion: process.versions.electron
    };
});

// Workspace handlers
registerIpcHandler('workspace:openDirectoryDialog', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Select Workspace Directory'
    });
    if (!result.canceled && result.filePaths.length > 0) {
        const selected = result.filePaths[0];
        const ws = workspaceService.setWorkspace(selected);
        gitService.setWorkingDirectory(selected);
        headroomAdapter.setWorkspaceDatabase(selected);
        return ws;
    }
    return null;
});

registerIpcHandler('workspace:openFileDialog', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        title: 'Open File in HEADROOM IDE'
    });
    if (!result.canceled && result.filePaths.length > 0) {
        const filePath = workspaceService.grantUserSelectedFile(result.filePaths[0]);
        return workspaceService.readFile(filePath);
    }
    return null;
});

registerIpcHandler('workspace:setWorkspace', (event, dirPath) => {
    const ws = workspaceService.setWorkspace(dirPath);
    gitService.setWorkingDirectory(dirPath);
    headroomAdapter.setWorkspaceDatabase(dirPath);
    return ws;
});

registerIpcHandler('workspace:getWorkspace', () => {
    return workspaceService.getWorkspace();
});

registerIpcHandler('workspace:readTree', (event, dirPath) => {
    return workspaceService.readDirectoryTree(dirPath);
});

registerIpcHandler('workspace:readFile', (event, filePath) => {
    return workspaceService.readFile(filePath);
});

registerIpcHandler('workspace:writeFile', (event, filePath, content) => {
    return workspaceService.writeFile(filePath, content);
});

registerIpcHandler('workspace:createFile', (event, filePath, content) => {
    return workspaceService.createFile(filePath, content);
});

registerIpcHandler('workspace:createDirectory', (event, dirPath) => {
    return workspaceService.createDirectory(dirPath);
});

registerIpcHandler('workspace:deleteEntry', (event, targetPath) => {
    return workspaceService.deleteEntry(targetPath);
});

registerIpcHandler('workspace:searchFiles', (event, query, options) => {
    return workspaceService.searchFiles(query, options);
});

// Terminal handlers
registerIpcHandler('terminal:createSession', (event, cwd) => {
    const sessionCwd = cwd || workspaceService.getWorkspace()?.path || process.cwd();
    return terminalService.createSession(
        sessionCwd,
        (sessionId, data, isError) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('terminal:data', { sessionId, data, isError });
            }
        },
        (sessionId, code, signal) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('terminal:exit', { sessionId, code, signal });
            }
        }
    );
});

registerIpcHandler('terminal:sendInput', (event, sessionId, input) => {
    terminalService.sendInput(sessionId, input);
    return true;
});

registerIpcHandler('terminal:killSession', (event, sessionId) => {
    return terminalService.killSession(sessionId);
});

// Git handlers
registerIpcHandler('git:getStatus', (event, dir) => {
    return gitService.getStatus(dir);
});

registerIpcHandler('git:getBranches', (event, dir) => {
    return gitService.getBranches(dir);
});

registerIpcHandler('git:getDiff', (event, filePath, staged, dir) => {
    return gitService.getDiff(filePath, staged, dir);
});

registerIpcHandler('git:getRecentCommits', (event, limit, dir) => {
    return gitService.getRecentCommits(limit, dir);
});

registerIpcHandler('git:stageFile', (event, filePath, dir) => {
    return gitService.stageFile(filePath, dir);
});

registerIpcHandler('git:unstageFile', (event, filePath, dir) => {
    return gitService.unstageFile(filePath, dir);
});

registerIpcHandler('git:stageAll', (event, dir) => {
    return gitService.stageAll(dir);
});

registerIpcHandler('git:commit', (event, message, dir) => {
    return gitService.commit(message, dir);
});

// Language Support & Diagnostics handlers
registerIpcHandler('languages:getRegistry', () => {
    return languageService.getLanguages();
});

registerIpcHandler('languages:getCapabilityMatrix', () => {
    return languageService.getCapabilityMatrix();
});

registerIpcHandler('languages:getLanguageForFile', (event, filePath) => {
    return languageService.getLanguageForFile(filePath);
});

registerIpcHandler('languages:diagnose', (event, langId) => {
    return languageService.diagnoseLanguageSupport(langId);
});

registerIpcHandler('languages:detectProjectTypes', (event, projectDir) => {
    return languageService.detectProjectTypes(projectDir || workspaceService.getWorkspace()?.path);
});

registerIpcHandler('languages:getDiagnostics', (event, options) => {
    return languageService.getDiagnostics(options);
});

registerIpcHandler('languages:formatDocument', (event, options) => {
    return languageService.formatDocument(options);
});

registerIpcHandler('languages:runFile', (event, options) => {
    return languageService.runFile(options, (outputChunk) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('languages:runOutput', outputChunk);
        }
    });
});

registerIpcHandler('languages:cancelRun', (event, runId) => {
    return languageService.cancelRun(runId);
});

// Debugger handlers
const dbg = languageService.getDebuggerService();
dbg.on('paused', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('languages:debugEvent', { event: 'paused', data });
    }
});
dbg.on('resumed', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('languages:debugEvent', { event: 'resumed', data });
    }
});
dbg.on('output', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('languages:debugEvent', { event: 'output', data });
    }
});
dbg.on('terminated', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('languages:debugEvent', { event: 'terminated', data });
    }
});

registerIpcHandler('languages:startDebug', (event, options) => {
    return dbg.startSession(options);
});

registerIpcHandler('languages:debugContinue', (event, sessionId) => {
    return dbg.continue(sessionId);
});

registerIpcHandler('languages:debugStepOver', (event, sessionId) => {
    return dbg.stepOver(sessionId);
});

registerIpcHandler('languages:debugStepInto', (event, sessionId) => {
    return dbg.stepInto(sessionId);
});

registerIpcHandler('languages:debugStepOut', (event, sessionId) => {
    return dbg.stepOut(sessionId);
});

registerIpcHandler('languages:debugPause', (event, sessionId) => {
    return dbg.pause(sessionId);
});

registerIpcHandler('languages:debugStop', (event, sessionId) => {
    return dbg.stopSession(sessionId);
});

registerIpcHandler('languages:debugSetBreakpoint', (event, sessionId, file, line) => {
    return dbg.setBreakpoint(sessionId, file, line);
});

registerIpcHandler('languages:debugGetVariables', (event, sessionId, frameId) => {
    return dbg.getVariables(sessionId, frameId);
});

registerIpcHandler('languages:debugEvaluate', (event, sessionId, expr, frameId) => {
    return dbg.evaluate(sessionId, expr, frameId);
});

// HEADROOM Workforce & Agent Manager handlers
registerIpcHandler('headroom:getHierarchy', () => {
    return headroomAdapter.getWorkforceHierarchy();
});

registerIpcHandler('agency:listProfiles', (event, filters) => {
    if (!agencyProfileCatalog) {
        return {
            divisions: [],
            total: 0,
            profiles: [],
            error: 'Agency profile catalog unavailable',
            diagnostic: AgencyProfileCatalog.diagnose()
        };
    }
    return agencyProfileCatalog.list(filters);
});

registerIpcHandler('agency:getProfile', (event, profileId) => {
    if (!agencyProfileCatalog) return null;
    return agencyProfileCatalog.getProfile(profileId);
});

registerIpcHandler('headroom:getProviderStatus', () => {
    return headroomAdapter.getProviderStatus();
});

registerIpcHandler('headroom:setProviderConfig', (event, config) => {
    return headroomAdapter.setProviderConfig(config);
});

registerIpcHandler('headroom:submitObjective', (event, objectiveText, context) => {
    return headroomAdapter.submitObjective(objectiveText, context);
});

registerIpcHandler('headroom:getPlans', () => {
    return headroomAdapter.getPlans();
});

registerIpcHandler('headroom:getTasks', () => {
    return headroomAdapter.getTasks();
});

registerIpcHandler('headroom:approvePlan', (event, planId) => {
    return headroomAdapter.approvePlan(planId);
});

registerIpcHandler('headroom:rejectPlan', (event, planId, reason) => {
    return headroomAdapter.rejectPlan(planId, reason);
});

registerIpcHandler('headroom:advanceTaskProgress', (event, taskId, progress, status, evidence) => {
    return headroomAdapter.advanceTaskProgress(taskId, progress, status, evidence);
});

registerIpcHandler('headroom:getAuditLogs', (event, limit) => {
    return headroomAdapter.getAuditLogs(limit);
});

registerIpcHandler('headroom:getEventHistory', (event, sinceSeq, limit) => {
    return headroomAdapter.getEventBridge().getEventsSince(sinceSeq, limit);
});

registerIpcHandler('headroom:executeTask', async (event, taskId, options) => {
    return headroomAdapter.executeTask(taskId, options);
});

registerIpcHandler('headroom:getTaskDiff', (event, taskId) => {
    return headroomAdapter.getTaskDiff(taskId);
});

registerIpcHandler('headroom:cancelTask', (event, taskId, reason) => {
    return headroomAdapter.cancelTask(taskId, reason);
});

// Open VSX Extensions Handlers
registerIpcHandler('extensions:search', async (event, query, options) => {
    return extensionService.search(query, options);
});

registerIpcHandler('extensions:getDetails', async (event, namespace, name) => {
    return extensionService.getDetails(namespace, name);
});

registerIpcHandler('extensions:getInstalled', () => {
    return extensionService.getInstalled();
});

registerIpcHandler('extensions:install', async (event, ext) => {
    return extensionService.install(ext);
});

registerIpcHandler('extensions:uninstall', async (event, extensionId) => {
    return extensionService.uninstall(extensionId);
});

registerIpcHandler('extensions:checkCompatibility', (event, ext) => {
    return extensionService.checkCompatibility(ext);
});

registerIpcHandler('extensions:activate', (event, extensionId) => {
    return extensionService.activateExtension(extensionId);
});

registerIpcHandler('extensions:deactivate', (event, extensionId) => {
    return extensionService.deactivateExtension(extensionId);
});

registerIpcHandler('extensions:getActiveTheme', () => {
    return extensionService.getActiveTheme();
});

registerIpcHandler('extensions:getAuditLogs', (event, limit) => {
    return extensionService.getAuditLogs(limit);
});

// AI API Gateway Handlers
registerIpcHandler('gateway:getModels', () => {
    return headroomAdapter.getGatewayService().getModels();
});

registerIpcHandler('gateway:getProviders', () => {
    return headroomAdapter.getGatewayService().getSafeProviderStatus();
});

registerIpcHandler('gateway:setCredential', (event, provider, apiKey) => {
    headroomAdapter.getGatewayService().setProviderCredential(provider, apiKey);
    return { ok: true };
});

registerIpcHandler('gateway:setEndpoint', (event, endpointConfig) => {
    headroomAdapter.getGatewayService().setCompatibleEndpoint(endpointConfig);
    return { ok: true };
});

registerIpcHandler('gateway:testConnection', async (event, provider) => {
    return headroomAdapter.getGatewayService().testProviderConnection(provider);
});

registerIpcHandler('gateway:chat', async (event, params) => {
    return headroomAdapter.getGatewayService().chatCompletion(params);
});

registerIpcHandler('gateway:getUsageStats', (event, contextId) => {
    return headroomAdapter.getGatewayService().getUsageStats(contextId);
});

registerIpcHandler('gateway:exportUsage', (event, format, contextId) => {
    return headroomAdapter.getGatewayService().exportUsage(format, contextId);
});

registerIpcHandler('gateway:setBudgetPolicy', (event, scopeId, policy) => {
    return headroomAdapter.getGatewayService().setBudgetPolicy(scopeId, policy);
});

registerIpcHandler('gateway:getBudgetSummary', (event, scopeId) => {
    return headroomAdapter.getGatewayService().getBudgetSummary(scopeId);
});

registerIpcHandler('gateway:grantExecutiveBudgetOverride', (event, overrideParams) => {
    return headroomAdapter.getGatewayService().grantExecutiveBudgetOverride(overrideParams);
});

registerIpcHandler('gateway:revokeExecutiveBudgetOverride', (event, scopeId) => {
    return headroomAdapter.getGatewayService().revokeExecutiveBudgetOverride(scopeId);
});

// Account & Session Lifecycle Handlers
registerIpcHandler('account:getSession', () => {
    return accountService.getPublicSession();
});

registerIpcHandler('account:listProfiles', () => {
    return accountService.listProfiles();
});

registerIpcHandler('account:signIn', (event, profileId, password) => {
    return accountService.signIn(profileId, password);
});

registerIpcHandler('account:signOut', () => {
    return accountService.signOut();
});

registerIpcHandler('account:unlock', (event, password) => {
    return accountService.unlockSession(password);
});

registerIpcHandler('account:createProfile', (event, profileData) => {
    return accountService.createProfile(profileData);
});

registerIpcHandler('account:completeOnboarding', () => {
    return accountService.completeOnboarding();
});

registerIpcHandler('account:getAuditLogs', (event, limit) => {
    return accountService.getAuditLogs(limit);
});

// Unreal Engine & Game Development Workflows (PHASE-37)
registerIpcHandler('unreal:discoverProjects', (event, rootDir) => {
    const ws = rootDir || workspaceService.getWorkspace()?.path || process.cwd();
    return headroomAdapter.getUnrealEngineService().discoverProjects(ws);
});

registerIpcHandler('unreal:validateProject', (event, uprojectPath) => {
    return headroomAdapter.getUnrealEngineService().validateUprojectManifest(uprojectPath);
});

registerIpcHandler('unreal:detectEngines', () => {
    return headroomAdapter.getUnrealEngineService().detectInstalledEngines();
});

registerIpcHandler('unreal:analyzeProject', (event, projectDir) => {
    const dir = projectDir || workspaceService.getWorkspace()?.path || process.cwd();
    return headroomAdapter.getUnrealEngineService().analyzeProjectStructure(dir);
});

registerIpcHandler('unreal:executeBuild', (event, params) => {
    return headroomAdapter.getUnrealEngineService().executeBuild(
        params.projectPath,
        params.targetName,
        params.config,
        params.options
    );
});

registerIpcHandler('unreal:parseLog', (event, logContent) => {
    return headroomAdapter.getUnrealEngineService().parseBuildLog(logContent);
});

registerIpcHandler('unreal:discoverTests', (event, projectDir) => {
    const dir = projectDir || workspaceService.getWorkspace()?.path || process.cwd();
    return headroomAdapter.getUnrealEngineService().discoverAutomationTests(dir);
});

// ==========================================
// Workflows & Automation IPC Handlers (HR-260 - HR-266)
// ==========================================
registerIpcHandler('workflow:listRecipes', (event, options) => {
    return headroomAdapter.getEngineeringWorkflowService().searchCatalog('', options || {});
});

registerIpcHandler('workflow:getRecipe', (event, recipeId) => {
    if (!recipeId || typeof recipeId !== 'string') throw new Error('Invalid recipeId argument');
    return headroomAdapter.getEngineeringWorkflowService().getRecipe(recipeId);
});

registerIpcHandler('workflow:execute', async (event, recipeId, parameters, options) => {
    if (!recipeId || typeof recipeId !== 'string') throw new Error('Invalid recipeId argument');
    const safeParams = (parameters && typeof parameters === 'object') ? parameters : {};
    return headroomAdapter.getEngineeringWorkflowService().executeWorkflow(recipeId, safeParams, {
        maxRetries: 2,
        stepTimeoutMs: 30000,
        onApprovalRequest: async (step) => {
            // Consequential step approval gate
            if (options && options.approvedSteps && options.approvedSteps.includes(step.id)) {
                return true;
            }
            return !step.requiresApproval;
        }
    });
});

registerIpcHandler('workflow:cancel', (event, executionId) => {
    if (!executionId || typeof executionId !== 'string') throw new Error('Invalid executionId argument');
    return headroomAdapter.getEngineeringWorkflowService().cancelWorkflow(executionId);
});

registerIpcHandler('workflow:getHistory', () => {
    return headroomAdapter.getEngineeringWorkflowService().getHistory();
});

// ==========================================
// Diagnostics & Self-Repair IPC Handlers (HR-281 - HR-287)
// ==========================================
registerIpcHandler('diagnostics:runHealthDoctor', () => {
    return headroomAdapter.getDiagnosticsSelfRepairService().runHealthDoctor();
});

registerIpcHandler('diagnostics:checkDatabaseIntegrity', () => {
    return headroomAdapter.getDiagnosticsSelfRepairService().checkDatabaseIntegrity();
});

registerIpcHandler('diagnostics:reclaimStaleLocks', () => {
    return headroomAdapter.getDiagnosticsSelfRepairService().reclaimStaleLocks();
});

registerIpcHandler('diagnostics:exportBundle', () => {
    return headroomAdapter.getDiagnosticsSelfRepairService().exportDiagnosticBundle();
});

// ==========================================
// Backup & Restore IPC Handlers (HR-274 - HR-280)
// ==========================================
registerIpcHandler('backup:createSnapshot', async () => {
    return headroomAdapter.getBackupPortabilityService().createDatabaseBackup();
});

registerIpcHandler('backup:listJournal', () => {
    return headroomAdapter.getBackupPortabilityService().getBackupJournal();
});

registerIpcHandler('backup:restoreDatabase', async (event, backupFile, options) => {
    if (!backupFile || typeof backupFile !== 'string') throw new Error('Invalid backupFile argument');
    if (backupFile.includes('..')) throw new Error('Security Error: Directory traversal in backup path');
    if (!options || options.confirmed !== true) {
        throw new Error('Safety Confirmation Required: Restoring a database overwrites existing state. Explicit confirmation token required.');
    }
    return headroomAdapter.getBackupPortabilityService().restoreDatabase(backupFile);
});

registerIpcHandler('backup:exportBundle', (event, destinationPath) => {
    if (destinationPath && destinationPath.includes('..')) throw new Error('Security Error: Directory traversal in export path');
    const ws = workspaceService.getWorkspace()?.path || process.cwd();
    return headroomAdapter.getBackupPortabilityService().exportWorkspaceBundle(ws, destinationPath);
});

registerIpcHandler('backup:importBundle', (event, bundleContentOrPath) => {
    if (!bundleContentOrPath) throw new Error('Invalid bundle argument');
    if (typeof bundleContentOrPath === 'string' && bundleContentOrPath.includes('..')) {
        throw new Error('Security Error: Directory traversal in bundle path');
    }
    return headroomAdapter.getBackupPortabilityService().importWorkspaceBundle(bundleContentOrPath);
});

// ==========================================
// Governance & Policy IPC Handlers (HR-267 - HR-273)
// ==========================================
registerIpcHandler('governance:getPolicy', () => {
    return headroomAdapter.getEnterpriseGovernanceService().getPolicySummary();
});

registerIpcHandler('governance:getComplianceLogs', (event, limit) => {
    return headroomAdapter.getEnterpriseGovernanceService().getComplianceLogs(limit || 50);
});

registerIpcHandler('governance:exportAuditLog', (event, format) => {
    return headroomAdapter.getEnterpriseGovernanceService().exportAuditLog(format || 'json');
});

// ==========================================
// Accessibility & UX IPC Handlers (HR-288 - HR-294)
// ==========================================
registerIpcHandler('accessibility:getSettings', () => {
    return headroomAdapter.getAccessibilityUxService().getSettings();
});

registerIpcHandler('accessibility:updateSettings', (event, updates) => {
    if (!updates || typeof updates !== 'object') throw new Error('Invalid settings updates');
    return headroomAdapter.getAccessibilityUxService().updateSettings(updates);
});

registerIpcHandler('accessibility:auditFocus', (event, elements) => {
    return headroomAdapter.getAccessibilityUxService().auditFocusTrap(elements || []);
});

let gatewayServer = null;

app.whenReady().then(async () => {
    try {
        const credentialPath = path.join(app.getPath('userData'), 'provider-credentials-v1.json');
        const available = headroomAdapter.initializeSecureStorage(credentialPath, safeStorage);
        if (!available) console.warn('[HEADROOM IDE] OS-backed credential encryption is unavailable.');
    } catch (error) {
        console.warn('[HEADROOM IDE] Secure credential storage could not be initialized:', error.message);
    }
    createWindow();

    // Start local loopback AI Gateway server
    try {
        const GatewayServer = require('./services/gateway/GatewayServer.js');
        gatewayServer = new GatewayServer(headroomAdapter.getGatewayService(), { port: 41400, host: '127.0.0.1' });
        await gatewayServer.start();
        console.log('[HEADROOM IDE] AI API Gateway loopback server active at http://127.0.0.1:41400');
    } catch (e) {
        console.warn('[HEADROOM IDE] Could not bind GatewayServer to port 41400:', e.message);
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (gatewayServer) gatewayServer.stop();
    terminalService.closeAll();
    if (process.platform !== 'darwin') app.quit();
});
