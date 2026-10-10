/**
 * HEADROOM Desktop IDE — Main Process Service Adapter
 *
 * Extends the authoritative HeadroomEngineAdapter from the integration layer,
 * providing the desktop IDE with access to the full HEADROOM engine.
 */

const HeadroomEngineAdapter = require('../../integration/headroom/HeadroomEngineAdapter.js');
const GatewayService = require('./gateway/GatewayService.js');
const IntegratedWorkforceEngine = require('./IntegratedWorkforceEngine.js');
const SecurityHardeningService = require('./SecurityHardeningService.js');
const NotificationService = require('./NotificationService.js');
const SettingsProfileService = require('./SettingsProfileService.js');
const PerformanceOptimizationService = require('./PerformanceOptimizationService.js');
const MobileRemoteGatewayService = require('./MobileRemoteGatewayService.js');
const MobileUiShellService = require('./MobileUiShellService.js');
const DevicePairingService = require('./DevicePairingService.js');
const ContinuitySyncService = require('./ContinuitySyncService.js');
const OfflineRecoveryService = require('./OfflineRecoveryService.js');
const EngineeringWorkflowService = require('./EngineeringWorkflowService.js');
const TerminalService = require('./TerminalService.js');
const UnrealEngineService = require('./UnrealEngineService.js');
const EnterpriseGovernanceService = require('./EnterpriseGovernanceService.js');
const BackupPortabilityService = require('./BackupPortabilityService.js');
const DiagnosticsSelfRepairService = require('./DiagnosticsSelfRepairService.js');
const AccessibilityUxService = require('./AccessibilityUxService.js');
const QualityGatesRunnerService = require('./QualityGatesRunnerService.js');
const ProviderVerificationService = require('./ProviderVerificationService.js');
const DesktopPackagingService = require('./DesktopPackagingService.js');
const ReliabilityBenchmarkService = require('./ReliabilityBenchmarkService.js');
const ReleaseAcceptanceService = require('./ReleaseAcceptanceService.js');

class HeadroomAdapter extends HeadroomEngineAdapter {
    constructor(dbPath = ':memory:') {
        super(dbPath);
        this.gatewayService = new GatewayService({
            sqliteConnection: this.database
        });
        this.workforceEngine = new IntegratedWorkforceEngine({
            sqliteConnection: this.database,
            adapter: this
        });
        this.securityHardening = new SecurityHardeningService();
        this.notificationService = new NotificationService();
        this.settingsProfileService = new SettingsProfileService();
        this.performanceService = new PerformanceOptimizationService();
        this.devicePairingService = new DevicePairingService();
        this.terminalService = new TerminalService();
        this.continuitySyncService = new ContinuitySyncService({
            workforceEngine: this.workforceEngine,
            pairingService: this.devicePairingService
        });
        this.offlineRecoveryService = new OfflineRecoveryService({
            sqliteConnection: this.database
        });
        this.engineeringWorkflows = new EngineeringWorkflowService({
            workforceEngine: this.workforceEngine,
            sqliteConnection: this.database
        });
        this.unrealEngineService = new UnrealEngineService({
            terminalService: this.terminalService,
            securityHardening: this.securityHardening,
            workforceEngine: this.workforceEngine
        });
        this.unrealEngineService.registerGameEngineeringRecipes(this.engineeringWorkflows);
        this.mobileRemoteGateway = new MobileRemoteGatewayService({
            adapter: this
        });
        this.mobileUiShell = new MobileUiShellService();
        this.enterpriseGovernance = new EnterpriseGovernanceService();
        this.backupPortability = new BackupPortabilityService({
            sqliteConnection: this.database,
            adapter: this
        });
        this.diagnosticsSelfRepair = new DiagnosticsSelfRepairService({
            sqliteConnection: this.database,
            adapter: this
        });
        this.accessibilityUx = new AccessibilityUxService();
        this.qualityGatesRunner = new QualityGatesRunnerService();
        this.providerVerification = new ProviderVerificationService(this.gatewayService);
        this.desktopPackaging = new DesktopPackagingService();
        this.reliabilityBenchmarks = new ReliabilityBenchmarkService();
        this.releaseAcceptance = new ReleaseAcceptanceService();
    }

    getWorkforceEngine() {
        return this.workforceEngine;
    }

    getGatewayService() {
        return this.gatewayService;
    }

    getUnrealEngineService() {
        return this.unrealEngineService;
    }

    getEngineeringWorkflowService() {
        return this.engineeringWorkflows;
    }

    getEnterpriseGovernanceService() {
        return this.enterpriseGovernance;
    }

    getBackupPortabilityService() {
        return this.backupPortability;
    }

    getDiagnosticsSelfRepairService() {
        return this.diagnosticsSelfRepair;
    }

    getAccessibilityUxService() {
        return this.accessibilityUx;
    }

    initializeSecureStorage(storagePath, safeStorage) {
        return this.gatewayService.initializeSecureStorage(storagePath, safeStorage);
    }

    getProviderStatus() {
        const safeStatus = this.gatewayService.getSafeProviderStatus();
        return {
            ...this.providerConfig,
            gatewayStatus: safeStatus,
            supportedProviders: safeStatus.map(s => s.provider),
            models: this.gatewayService.getModels().map(m => m.id)
        };
    }

    setProviderConfig(config) {
        if (config.provider && config.apiKey !== undefined) {
            this.gatewayService.setProviderCredential(config.provider, config.apiKey);
        }
        if (config.provider === 'compatible' && config.endpoint) {
            this.gatewayService.setCompatibleEndpoint(config.endpoint);
        }
        return super.setProviderConfig(config);
    }
}

module.exports = HeadroomAdapter;
