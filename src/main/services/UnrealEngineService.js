/**
 * HEADROOM Desktop IDE — Unreal Engine & Game Development Workflows Service
 *
 * Implements PHASE-37 (HR-253 through HR-259):
 * - HR-253: Unreal Project Discovery & .uproject Manifest Validation
 * - HR-254: Unreal Engine Installation & Build Toolchain Detection
 * - HR-255: Game Project Structure Awareness & Capability Matrix Reporting
 * - HR-256: Safe UnrealBuildTool & AutomationTool Command Invocation
 * - HR-257: Unreal Build & MSVC/Clang Compiler Diagnostic Log Parsing
 * - HR-258: Unreal Automation Test Discovery & Execution Framework
 * - HR-259: Game Engineering Workforce Orchestration & Approval Policy
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const EventEmitter = require('events');

class UnrealEngineService extends EventEmitter {
    constructor(options = {}) {
        super();
        this.workspaceRoot = options.workspaceRoot ? path.resolve(options.workspaceRoot) : process.cwd();
        this.terminalService = options.terminalService || null;
        this.securityHardening = options.securityHardening || null;
        this.workforceEngine = options.workforceEngine || null;
        this.installedEnginesCache = null;
    }

    /**
     * HR-253: Discover all .uproject files in the directory
     */
    discoverProjects(rootDir = this.workspaceRoot, maxDepth = 4) {
        const resolvedRoot = path.resolve(rootDir);
        if (!fs.existsSync(resolvedRoot)) {
            return [];
        }

        const projects = [];
        const ignoredDirs = new Set([
            'node_modules', '.git', 'Intermediate', 'Saved', 'Binaries',
            'DerivedDataCache', '.idea', '.vscode'
        ]);

        const scan = (currentDir, depth) => {
            if (depth > maxDepth) return;
            let entries = [];
            try {
                entries = fs.readdirSync(currentDir, { withFileTypes: true });
            } catch (e) {
                return;
            }

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    if (!ignoredDirs.has(entry.name)) {
                        scan(path.join(currentDir, entry.name), depth + 1);
                    }
                } else if (entry.isFile() && entry.name.endsWith('.uproject')) {
                    const projectPath = path.join(currentDir, entry.name);
                    const validation = this.validateUprojectManifest(projectPath);
                    projects.push({
                        projectName: path.basename(entry.name, '.uproject'),
                        projectPath,
                        projectDir: currentDir,
                        ...validation
                    });
                }
            }
        };

        scan(resolvedRoot, 0);
        return projects;
    }

    /**
     * HR-253: Validate .uproject Manifest Format
     */
    validateUprojectManifest(uprojectPath) {
        const errors = [];
        if (!fs.existsSync(uprojectPath)) {
            return { isValid: false, errors: [`File does not exist: ${uprojectPath}`], manifest: null };
        }

        let raw;
        try {
            raw = fs.readFileSync(uprojectPath, 'utf8');
        } catch (err) {
            return { isValid: false, errors: [`Cannot read file: ${err.message}`], manifest: null };
        }

        let manifest;
        try {
            manifest = JSON.parse(raw);
        } catch (err) {
            return { isValid: false, errors: [`Invalid JSON in .uproject: ${err.message}`], manifest: null };
        }

        if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
            errors.push('Manifest root must be a JSON object');
        } else {
            if (manifest.EngineAssociation === undefined) {
                errors.push('Missing "EngineAssociation" field');
            }
            if (manifest.Modules && !Array.isArray(manifest.Modules)) {
                errors.push('"Modules" field must be an array');
            }
            if (manifest.Plugins && !Array.isArray(manifest.Plugins)) {
                errors.push('"Plugins" field must be an array');
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            manifest: errors.length === 0 ? manifest : null
        };
    }

    /**
     * HR-254: Detect Installed Unreal Engine Versions & Toolchain
     */
    detectInstalledEngines(forceRefresh = false) {
        if (this.installedEnginesCache && !forceRefresh) {
            return this.installedEnginesCache;
        }

        const engines = [];
        const checkedLocations = [];

        // 1. Check environment variables
        const envVars = ['UNREAL_ENGINE_PATH', 'UE_ROOT', 'UE5_DIR', 'UE4_DIR'];
        for (const envVar of envVars) {
            const val = process.env[envVar];
            if (val && fs.existsSync(val)) {
                checkedLocations.push({ source: `env:${envVar}`, path: val });
                const engineInfo = this.probeEngineDirectory(val, `Environment (${envVar})`);
                if (engineInfo) engines.push(engineInfo);
            }
        }

        // 2. Check standard Windows Epic Games directories
        if (process.platform === 'win32') {
            const standardRoots = [
                'C:\\Program Files\\Epic Games',
                'D:\\Program Files\\Epic Games',
                'E:\\Program Files\\Epic Games',
                'C:\\Epic Games',
                'D:\\Epic Games'
            ];

            for (const root of standardRoots) {
                if (fs.existsSync(root)) {
                    try {
                        const subdirs = fs.readdirSync(root, { withFileTypes: true });
                        for (const sub of subdirs) {
                            if (sub.isDirectory() && sub.name.startsWith('UE_')) {
                                const fullPath = path.join(root, sub.name);
                                checkedLocations.push({ source: 'EpicGamesFolder', path: fullPath });
                                const engineInfo = this.probeEngineDirectory(fullPath, sub.name);
                                if (engineInfo) engines.push(engineInfo);
                            }
                        }
                    } catch (e) {}
                }
            }

            // 3. Check Windows Registry (HKCU\Software\Epic Games\Unreal Engine\Builds)
            try {
                const regRes = spawnSync('reg', ['query', 'HKCU\\Software\\Epic Games\\Unreal Engine\\Builds'], { encoding: 'utf8' });
                if (regRes.status === 0 && regRes.stdout) {
                    const lines = regRes.stdout.split('\n');
                    for (const line of lines) {
                        const match = line.trim().match(/^([^\s]+)\s+REG_SZ\s+(.+)$/);
                        if (match) {
                            const versionId = match[1];
                            const installPath = match[2].trim();
                            if (fs.existsSync(installPath)) {
                                checkedLocations.push({ source: 'Registry', path: installPath });
                                const engineInfo = this.probeEngineDirectory(installPath, versionId);
                                if (engineInfo && !engines.some(e => e.path === engineInfo.path)) {
                                    engines.push(engineInfo);
                                }
                            }
                        }
                    }
                }
            } catch (e) {}
        }

        const result = {
            hasEngineInstalled: engines.length > 0,
            primaryEngine: engines[0] || null,
            engines,
            checkedLocationsCount: checkedLocations.length
        };

        this.installedEnginesCache = result;
        return result;
    }

    probeEngineDirectory(enginePath, versionIdentifier) {
        if (!fs.existsSync(enginePath)) return null;

        const isWindows = process.platform === 'win32';
        const batchExt = isWindows ? '.bat' : '.sh';
        const exeExt = isWindows ? '.exe' : '';

        // Check for UnrealBuildTool
        const ubtCandidates = [
            path.join(enginePath, 'Engine', 'Binaries', 'DotNET', 'UnrealBuildTool', `UnrealBuildTool${exeExt}`),
            path.join(enginePath, 'Engine', 'Binaries', 'DotNET', `UnrealBuildTool${exeExt}`),
            path.join(enginePath, 'Engine', 'Build', 'BatchFiles', `Build${batchExt}`)
        ];
        const ubtPath = ubtCandidates.find(p => fs.existsSync(p)) || null;

        // Check for AutomationTool (RunUAT)
        const uatCandidates = [
            path.join(enginePath, 'Engine', 'Build', 'BatchFiles', `RunUAT${batchExt}`)
        ];
        const uatPath = uatCandidates.find(p => fs.existsSync(p)) || null;

        // Check for UnrealEditor
        const editorCandidates = [
            path.join(enginePath, 'Engine', 'Binaries', 'Win64', `UnrealEditor${exeExt}`),
            path.join(enginePath, 'Engine', 'Binaries', 'Win64', `UE4Editor${exeExt}`)
        ];
        const editorPath = editorCandidates.find(p => fs.existsSync(p)) || null;

        // Check for UnrealEditor-Cmd
        const editorCmdCandidates = [
            path.join(enginePath, 'Engine', 'Binaries', 'Win64', `UnrealEditor-Cmd${exeExt}`),
            path.join(enginePath, 'Engine', 'Binaries', 'Win64', `UE4Editor-Cmd${exeExt}`)
        ];
        const editorCmdPath = editorCmdCandidates.find(p => fs.existsSync(p)) || null;

        return {
            version: versionIdentifier,
            path: enginePath,
            hasUbt: Boolean(ubtPath),
            ubtPath,
            hasUat: Boolean(uatPath),
            uatPath,
            hasEditor: Boolean(editorPath),
            editorPath,
            hasEditorCmd: Boolean(editorCmdPath),
            editorCmdPath
        };
    }

    /**
     * HR-255: Game Project Structure Awareness & Capability Matrix
     */
    analyzeProjectStructure(projectDir) {
        const resolvedDir = path.resolve(projectDir);
        if (!fs.existsSync(resolvedDir)) {
            throw new Error(`Project directory does not exist: ${resolvedDir}`);
        }

        // Find .uproject
        const uprojectFiles = fs.readdirSync(resolvedDir).filter(f => f.endsWith('.uproject'));
        if (uprojectFiles.length === 0) {
            throw new Error(`No .uproject file found in ${resolvedDir}`);
        }

        const uprojectPath = path.join(resolvedDir, uprojectFiles[0]);
        const validation = this.validateUprojectManifest(uprojectPath);

        const sourceDir = path.join(resolvedDir, 'Source');
        const configDir = path.join(resolvedDir, 'Config');
        const contentDir = path.join(resolvedDir, 'Content');
        const pluginsDir = path.join(resolvedDir, 'Plugins');

        let isCppProject = false;
        const targetFiles = [];
        const buildFiles = [];
        let cppFilesCount = 0;
        let headerFilesCount = 0;

        if (fs.existsSync(sourceDir)) {
            const scanSource = (dir) => {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const full = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        scanSource(full);
                    } else if (entry.isFile()) {
                        if (entry.name.endsWith('.Target.cs')) targetFiles.push(entry.name);
                        else if (entry.name.endsWith('.Build.cs')) buildFiles.push(entry.name);
                        else if (entry.name.endsWith('.cpp')) cppFilesCount++;
                        else if (entry.name.endsWith('.h')) headerFilesCount++;
                    }
                }
            };
            scanSource(sourceDir);
            isCppProject = targetFiles.length > 0 || buildFiles.length > 0 || cppFilesCount > 0;
        }

        // Detect engine association match
        const installedEngines = this.detectInstalledEngines();
        const assoc = validation.manifest?.EngineAssociation;
        const matchingEngine = installedEngines.engines.find(e => e.version === assoc) || installedEngines.primaryEngine;

        const canBuild = Boolean(isCppProject && matchingEngine?.hasUbt);
        const canRunAutomationTests = Boolean(matchingEngine?.hasUat);

        return {
            projectName: path.basename(uprojectFiles[0], '.uproject'),
            projectDir: resolvedDir,
            uprojectPath,
            isValidManifest: validation.isValid,
            engineAssociation: assoc || 'Unknown',
            projectType: isCppProject ? 'CPP' : 'BLUEPRINT_ONLY',
            isCppProject,
            hasContent: fs.existsSync(contentDir),
            hasConfig: fs.existsSync(configDir),
            hasPlugins: fs.existsSync(pluginsDir),
            structure: {
                targetFiles,
                buildFiles,
                cppFilesCount,
                headerFilesCount,
                pluginsCount: validation.manifest?.Plugins?.length || 0,
                modulesCount: validation.manifest?.Modules?.length || 0
            },
            capabilityMatrix: {
                hasUproject: true,
                isCppProject,
                engineInstalled: Boolean(matchingEngine),
                canBuild,
                canGenerateProjectFiles: Boolean(matchingEngine?.hasUbt),
                canRunAutomationTests
            },
            engineInfo: matchingEngine || null
        };
    }

    /**
     * HR-257: Unreal Build & MSVC/Clang Compiler Diagnostic Log Parsing
     */
    parseBuildLog(logContent) {
        if (typeof logContent !== 'string') return { diagnostics: [], errorCount: 0, warningCount: 0, hasErrors: false };

        const lines = logContent.split(/\r?\n/);
        const diagnostics = [];

        // Regex patterns for MSVC, Clang, UHT, and UBT errors
        // MSVC: C:\path\file.cpp(42,15): error C2065: 'MyVar': undeclared identifier
        const msvcPattern = /^([a-zA-Z]:[^(]+)\((\d+)(?:,(\d+))?\)\s*:\s*(error|fatal error|warning)\s*([A-Z0-9]+)?\s*:\s*(.*)$/i;
        // Clang: /path/file.cpp:42:15: error: undeclared identifier
        const clangPattern = /^([^:]+):(\d+):(\d+):\s*(error|fatal error|warning):\s*(.*)$/i;
        // UBT/UHT: Error: Failed to generate code / ERROR: UnrealBuildTool failed
        const ubtPattern = /^(?:ERROR|Error)\s*:\s*(.*)$/i;

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            const msvcMatch = trimmed.match(msvcPattern);
            if (msvcMatch) {
                const [, file, lineNum, colNum, severityStr, code, message] = msvcMatch;
                const severity = severityStr.toLowerCase().includes('error') ? 'ERROR' : 'WARNING';
                const diag = {
                    file: path.normalize(file),
                    line: parseInt(lineNum, 10),
                    column: colNum ? parseInt(colNum, 10) : 1,
                    severity,
                    code: code || 'MSVC',
                    message: message.trim(),
                    raw: trimmed,
                    remediationHint: this.generateRemediationHint(code, message)
                };
                diagnostics.push(diag);
                continue;
            }

            const clangMatch = trimmed.match(clangPattern);
            if (clangMatch) {
                const [, file, lineNum, colNum, severityStr, message] = clangMatch;
                const severity = severityStr.toLowerCase().includes('error') ? 'ERROR' : 'WARNING';
                const diag = {
                    file: path.normalize(file),
                    line: parseInt(lineNum, 10),
                    column: parseInt(colNum, 10),
                    severity,
                    code: 'CLANG',
                    message: message.trim(),
                    raw: trimmed,
                    remediationHint: this.generateRemediationHint('CLANG', message)
                };
                diagnostics.push(diag);
                continue;
            }

            const ubtMatch = trimmed.match(ubtPattern);
            if (ubtMatch) {
                diagnostics.push({
                    file: null,
                    line: null,
                    column: null,
                    severity: 'ERROR',
                    code: 'UBT_ERROR',
                    message: ubtMatch[1].trim(),
                    raw: trimmed,
                    remediationHint: 'Check Unreal Engine version compatibility or missing project dependency'
                });
            }
        }

        const errorCount = diagnostics.filter(d => d.severity === 'ERROR').length;
        const warningCount = diagnostics.filter(d => d.severity === 'WARNING').length;

        return {
            diagnostics,
            errorCount,
            warningCount,
            hasErrors: errorCount > 0,
            summary: `Parsed ${diagnostics.length} diagnostics (${errorCount} errors, ${warningCount} warnings)`
        };
    }

    generateRemediationHint(code, message) {
        const msg = String(message).toLowerCase();
        if (code === 'C1083' || msg.includes('cannot open include file') || msg.includes('file not found')) {
            return 'Header file not found. Ensure header exists and its parent module is listed in PublicDependencyModuleNames in Build.cs';
        }
        if (code === 'C2065' || msg.includes('undeclared identifier')) {
            return 'Undeclared identifier. Check variable spelling, namespace scope, or include the required header file.';
        }
        if (msg.includes('generated.h')) {
            return 'Ensure "#include \"FileName.generated.h\"" is the LAST include in your header file.';
        }
        if (msg.includes('uclass') || msg.includes('generated_body')) {
            return 'Check that UCLASS() and GENERATED_BODY() are properly defined in your UObject/AActor header.';
        }
        return 'Inspect the code location and ensure appropriate Unreal Engine C++ macros and headers are included.';
    }

    /**
     * HR-258: Unreal Automation Test Discovery
     */
    discoverAutomationTests(projectDir) {
        const resolvedDir = path.resolve(projectDir);
        const sourceDir = path.join(resolvedDir, 'Source');
        if (!fs.existsSync(sourceDir)) {
            return [];
        }

        const tests = [];
        const testMacroRegex = /IMPLEMENT_(SIMPLE|COMPLEX)_AUTOMATION_TEST\s*\(\s*([a-zA-Z0-9_]+)\s*,\s*"([^"]+)"\s*,\s*([^)]+)\)/g;

        const scanFiles = (dir) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    scanFiles(full);
                } else if (entry.isFile() && (entry.name.endsWith('.cpp') || entry.name.endsWith('.h'))) {
                    try {
                        const content = fs.readFileSync(full, 'utf8');
                        const lines = content.split('\n');
                        for (let i = 0; i < lines.length; i++) {
                            const line = lines[i];
                            let match;
                            while ((match = testMacroRegex.exec(line)) !== null) {
                                tests.push({
                                    testType: match[1], // SIMPLE or COMPLEX
                                    testClass: match[2],
                                    testName: match[3],
                                    flags: match[4].trim(),
                                    file: full,
                                    line: i + 1
                                });
                            }
                        }
                    } catch (e) {}
                }
            }
        };

        scanFiles(sourceDir);
        return tests;
    }

    /**
     * HR-258: Parse Test Execution Logs
     */
    parseAutomationTestResults(logContent) {
        if (typeof logContent !== 'string') return { total: 0, passed: 0, failed: 0, tests: [] };

        const lines = logContent.split(/\r?\n/);
        const tests = [];

        // [2026.10.10-14.20.00:000][  0]LogAutomationController: Test Completed {TestName} (Success/Failed) in 0.052s
        const testResultRegex = /Test Completed\s+([^\s]+)\s+\((Success|Failed)\)(?:\s+in\s+([\d\.]+s))?/i;

        for (const line of lines) {
            const match = line.match(testResultRegex);
            if (match) {
                tests.push({
                    name: match[1],
                    status: match[2].toUpperCase() === 'SUCCESS' ? 'PASSED' : 'FAILED',
                    duration: match[3] || null
                });
            }
        }

        const passed = tests.filter(t => t.status === 'PASSED').length;
        const failed = tests.filter(t => t.status === 'FAILED').length;

        return {
            total: tests.length,
            passed,
            failed,
            tests
        };
    }

    /**
     * HR-256: Safe Command Execution with TerminalService & Approval
     */
    async executeBuild(projectPath, targetName, config = 'Development', options = {}) {
        const engines = this.detectInstalledEngines();
        if (!engines.hasEngineInstalled || !engines.primaryEngine?.hasUbt) {
            return {
                success: false,
                status: 'BLOCKED_MISSING_ENGINE',
                error: 'Unreal Engine installation or UnrealBuildTool not found on host system',
                diagnostics: []
            };
        }

        const ubtPath = engines.primaryEngine.ubtPath;
        const args = [targetName, 'Win64', config, `-Project="${projectPath}"`, '-NoHotReload'];

        // Path validation via SecurityHardening if available
        if (this.securityHardening) {
            const pathCheck = this.securityHardening.validatePathConfinement(projectPath);
            if (!pathCheck.confined) {
                throw new Error(`Security Violation: Project path outside allowed root: ${projectPath}`);
            }
        }

        if (!this.terminalService) {
            throw new Error('TerminalService is required for executing Unreal builds');
        }

        const execResult = await this.terminalService.executeToolCommand(ubtPath, args, {
            cwd: path.dirname(projectPath),
            timeoutMs: options.timeoutMs || 120000
        });

        const logParsed = this.parseBuildLog(execResult.stdout + '\n' + execResult.stderr);

        return {
            success: execResult.exitCode === 0 && !logParsed.hasErrors,
            status: execResult.exitCode === 0 ? 'BUILD_SUCCESS' : 'BUILD_FAILED',
            exitCode: execResult.exitCode,
            timedOut: execResult.timedOut,
            durationMs: execResult.durationMs,
            diagnostics: logParsed.diagnostics,
            errorCount: logParsed.errorCount,
            warningCount: logParsed.warningCount
        };
    }

    /**
     * HR-259: Register Game Development Recipes in EngineeringWorkflowService
     */
    registerGameEngineeringRecipes(workflowService) {
        if (!workflowService?.registerRecipe) return;

        workflowService.registerRecipe({
            id: 'unreal-project-build',
            name: 'Unreal Engine Project Build & Compile',
            category: 'GAME_DEV',
            description: 'Discovers .uproject, generates project rules, invokes UnrealBuildTool, and parses compiler diagnostics.',
            steps: [
                { id: 'validate-uproject', role: 'SYSTEM_ARCHITECT', action: 'Validate .uproject manifest and engine association' },
                { id: 'audit-source-structure', role: 'CODE_REVIEWER', action: 'Scan C++ Source targets and Build.cs dependencies' },
                { id: 'compile-ubt', role: 'BACKEND_ENGINEER', action: 'Invoke UnrealBuildTool for target {target}', dependencies: ['validate-uproject', 'audit-source-structure'] },
                { id: 'parse-diagnostics', role: 'QA_AUTOMATION_ENGINEER', action: 'Parse compiler logs and generate remediation hints', dependencies: ['compile-ubt'] }
            ]
        });

        workflowService.registerRecipe({
            id: 'unreal-automation-test',
            name: 'Unreal Automation Test Discovery & Run',
            category: 'GAME_DEV',
            description: 'Discovers IMPLEMENT_SIMPLE_AUTOMATION_TEST definitions and runs Unreal automation test harness.',
            steps: [
                { id: 'discover-tests', role: 'QA_AUTOMATION_ENGINEER', action: 'Extract automation test macros from Source directory' },
                { id: 'run-uat-tests', role: 'QA_AUTOMATION_ENGINEER', action: 'Execute RunUAT AutomationTool runner', dependencies: ['discover-tests'] },
                { id: 'compile-test-report', role: 'TECH_WRITER', action: 'Format test results and execution times', dependencies: ['run-uat-tests'] }
            ]
        });

        workflowService.registerRecipe({
            id: 'unreal-asset-audit',
            name: 'Unreal Project Plugin & Asset Audit',
            category: 'GAME_DEV',
            description: 'Audits .uproject plugin declarations, enabled modules, and project configuration settings.',
            steps: [
                { id: 'inspect-plugins', role: 'SECURITY_ENGINEER', action: 'Audit declared third-party plugins in .uproject' },
                { id: 'verify-target-platforms', role: 'SYSTEM_ARCHITECT', action: 'Check TargetPlatforms and supported engine versions', dependencies: ['inspect-plugins'] }
            ]
        });
    }
}

module.exports = UnrealEngineService;
