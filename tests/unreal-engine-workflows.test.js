import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import UnrealEngineService from '../src/main/services/UnrealEngineService.js';
import TerminalService from '../src/main/services/TerminalService.js';
import SecurityHardeningService from '../src/main/services/SecurityHardeningService.js';
import EngineeringWorkflowService from '../src/main/services/EngineeringWorkflowService.js';
import HeadroomAdapter from '../src/main/services/HeadroomAdapter.js';

describe('PHASE-37: Unreal Engine & Game Development Workflows (HR-253 through HR-259)', () => {
    let tempDir;
    let service;
    let terminalService;
    let securityService;
    let workflowService;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'headroom-ue-test-'));
        terminalService = new TerminalService();
        securityService = new SecurityHardeningService({ workspaceRoot: tempDir });
        workflowService = new EngineeringWorkflowService();
        service = new UnrealEngineService({
            workspaceRoot: tempDir,
            terminalService,
            securityHardening: securityService
        });
    });

    afterEach(() => {
        terminalService.closeAll();
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (e) {}
    });

    // ==========================================
    // HR-253: Unreal Project Discovery & .uproject Manifest Validation
    // ==========================================
    describe('HR-253: Unreal Project Discovery & Manifest Validation', () => {
        it('discovers valid .uproject manifests and rejects malformed/corrupted files', () => {
            const validProjDir = path.join(tempDir, 'MyGame');
            fs.mkdirSync(validProjDir, { recursive: true });
            const validManifest = {
                FileVersion: 3,
                EngineAssociation: '5.4',
                Category: '',
                Description: '',
                Modules: [
                    { Name: 'MyGame', Type: 'Runtime', LoadingPhase: 'Default' }
                ],
                Plugins: [
                    { Name: 'ModelingToolsEditorMode', Enabled: true, TargetAllowList: ['Editor'] }
                ]
            };
            fs.writeFileSync(path.join(validProjDir, 'MyGame.uproject'), JSON.stringify(validManifest, null, 2), 'utf8');

            const invalidProjDir = path.join(tempDir, 'CorruptGame');
            fs.mkdirSync(invalidProjDir, { recursive: true });
            fs.writeFileSync(path.join(invalidProjDir, 'CorruptGame.uproject'), '{ invalid json ...', 'utf8');

            const missingFieldDir = path.join(tempDir, 'MissingFieldGame');
            fs.mkdirSync(missingFieldDir, { recursive: true });
            fs.writeFileSync(path.join(missingFieldDir, 'MissingFieldGame.uproject'), JSON.stringify({ FileVersion: 3 }), 'utf8');

            const discovered = service.discoverProjects(tempDir);
            expect(discovered.length).toBe(3);

            const valid = discovered.find(p => p.projectName === 'MyGame');
            expect(valid.isValid).toBe(true);
            expect(valid.manifest.EngineAssociation).toBe('5.4');
            expect(valid.manifest.Modules.length).toBe(1);

            const corrupt = discovered.find(p => p.projectName === 'CorruptGame');
            expect(corrupt.isValid).toBe(false);
            expect(corrupt.errors[0]).toContain('Invalid JSON');

            const missing = discovered.find(p => p.projectName === 'MissingFieldGame');
            expect(missing.isValid).toBe(false);
            expect(missing.errors).toContain('Missing "EngineAssociation" field');
        });
    });

    // ==========================================
    // HR-254: Unreal Engine Installation & Build Toolchain Detection
    // ==========================================
    describe('HR-254: Unreal Engine Installation & Toolchain Detection', () => {
        it('probes host environment honestly and returns real installation state', () => {
            const detection = service.detectInstalledEngines(true);
            expect(detection).toHaveProperty('hasEngineInstalled');
            expect(detection).toHaveProperty('engines');
            expect(Array.isArray(detection.engines)).toBe(true);
            expect(typeof detection.checkedLocationsCount).toBe('number');

            // If an engine was found on host, verify its tool properties
            if (detection.hasEngineInstalled) {
                const engine = detection.primaryEngine;
                expect(engine.path).toBeDefined();
                expect(typeof engine.hasUbt).toBe('boolean');
                expect(typeof engine.hasUat).toBe('boolean');
            } else {
                expect(detection.primaryEngine).toBeNull();
            }
        });

        it('correctly inspects and identifies valid engine directory structures', () => {
            const fakeEngineDir = path.join(tempDir, 'MockUE_5.4');
            const ubtDir = path.join(fakeEngineDir, 'Engine', 'Binaries', 'DotNET', 'UnrealBuildTool');
            const uatDir = path.join(fakeEngineDir, 'Engine', 'Build', 'BatchFiles');
            fs.mkdirSync(ubtDir, { recursive: true });
            fs.mkdirSync(uatDir, { recursive: true });

            const exeExt = process.platform === 'win32' ? '.exe' : '';
            const batExt = process.platform === 'win32' ? '.bat' : '.sh';
            fs.writeFileSync(path.join(ubtDir, `UnrealBuildTool${exeExt}`), 'mock binary');
            fs.writeFileSync(path.join(uatDir, `RunUAT${batExt}`), 'mock script');

            const probe = service.probeEngineDirectory(fakeEngineDir, '5.4');
            expect(probe).not.toBeNull();
            expect(probe.hasUbt).toBe(true);
            expect(probe.hasUat).toBe(true);
            expect(probe.hasEditor).toBe(false);
        });
    });

    // ==========================================
    // HR-255: Game Project Structure Awareness & Capability Matrix Reporting
    // ==========================================
    describe('HR-255: Project Structure Awareness & Capability Matrix', () => {
        it('classifies Blueprint-only vs C++ projects with honest capability reporting', () => {
            // 1. Blueprint-only project
            const bpDir = path.join(tempDir, 'BlueprintProject');
            fs.mkdirSync(path.join(bpDir, 'Content'), { recursive: true });
            fs.mkdirSync(path.join(bpDir, 'Config'), { recursive: true });
            fs.writeFileSync(path.join(bpDir, 'BlueprintProject.uproject'), JSON.stringify({
                FileVersion: 3,
                EngineAssociation: '5.3'
            }));

            const bpAnalysis = service.analyzeProjectStructure(bpDir);
            expect(bpAnalysis.projectType).toBe('BLUEPRINT_ONLY');
            expect(bpAnalysis.isCppProject).toBe(false);
            expect(bpAnalysis.capabilityMatrix.isCppProject).toBe(false);
            expect(bpAnalysis.capabilityMatrix.canBuild).toBe(false);

            // 2. C++ Project
            const cppDir = path.join(tempDir, 'CppGame');
            const sourceDir = path.join(cppDir, 'Source', 'CppGame');
            fs.mkdirSync(sourceDir, { recursive: true });
            fs.writeFileSync(path.join(cppDir, 'CppGame.uproject'), JSON.stringify({
                FileVersion: 3,
                EngineAssociation: '5.4',
                Modules: [{ Name: 'CppGame', Type: 'Runtime' }]
            }));
            fs.writeFileSync(path.join(sourceDir, 'CppGame.Target.cs'), '// Target rules');
            fs.writeFileSync(path.join(sourceDir, 'CppGame.Build.cs'), '// Module rules');
            fs.writeFileSync(path.join(sourceDir, 'CppGame.cpp'), '#include "CppGame.h"');
            fs.writeFileSync(path.join(sourceDir, 'CppGame.h'), '#pragma once');

            const cppAnalysis = service.analyzeProjectStructure(cppDir);
            expect(cppAnalysis.projectType).toBe('CPP');
            expect(cppAnalysis.isCppProject).toBe(true);
            expect(cppAnalysis.structure.targetFiles).toContain('CppGame.Target.cs');
            expect(cppAnalysis.structure.buildFiles).toContain('CppGame.Build.cs');
            expect(cppAnalysis.structure.cppFilesCount).toBe(1);
            expect(cppAnalysis.structure.headerFilesCount).toBe(1);
        });
    });

    // ==========================================
    // HR-256: Safe Command Invocation & Validation
    // ==========================================
    describe('HR-256: Safe Unreal Command Invocation', () => {
        it('blocks execution when engine is missing and validates path boundaries', async () => {
            // When engine is not detected on host
            const fakeUproject = path.join(tempDir, 'Test.uproject');
            fs.writeFileSync(fakeUproject, JSON.stringify({ EngineAssociation: '5.0' }));

            // Overwrite cache to simulate missing engine
            service.installedEnginesCache = { hasEngineInstalled: false, engines: [], primaryEngine: null };

            const result = await service.executeBuild(fakeUproject, 'TestEditor');
            expect(result.status).toBe('BLOCKED_MISSING_ENGINE');
            expect(result.success).toBe(false);
            expect(result.error).toContain('not found on host system');

            // Outside path confinement test
            service.installedEnginesCache = {
                hasEngineInstalled: true,
                primaryEngine: { hasUbt: true, ubtPath: 'fake.exe' },
                engines: [{ hasUbt: true, ubtPath: 'fake.exe' }]
            };

            await expect(service.executeBuild('C:\\Windows\\System32\\game.uproject', 'TestEditor'))
                .rejects.toThrow('Security Violation');
        });
    });

    // ==========================================
    // HR-257: Unreal Build & Compiler Diagnostic Log Parsing
    // ==========================================
    describe('HR-257: Unreal Build & Compiler Diagnostic Log Parsing', () => {
        it('parses MSVC, Clang, and UBT build logs into structured actionable diagnostics', () => {
            const rawLog = [
                'Building UnrealEditor - Game...',
                'D:\\Projects\\Game\\Source\\Game\\Player.cpp(102,18): error C2065: \'UnknownHealth\': undeclared identifier',
                'D:\\Projects\\Game\\Source\\Game\\Weapon.cpp(12): fatal error C1083: Cannot open include file: \'WeaponCore.h\': No such file or directory',
                'D:\\Projects\\Game\\Source\\Game\\AI.cpp(45,8): warning C4996: \'GetPawn\': was declared deprecated',
                '/Users/dev/Game/Source/Game/MacAudio.cpp:30:12: error: use of undeclared identifier \'AudioBuffer\'',
                'ERROR: UnrealBuildTool failed. See log for details.'
            ].join('\r\n');

            const parsed = service.parseBuildLog(rawLog);
            expect(parsed.hasErrors).toBe(true);
            expect(parsed.errorCount).toBe(4);
            expect(parsed.warningCount).toBe(1);
            expect(parsed.diagnostics.length).toBe(5);

            // Check MSVC C2065 diagnostic
            const c2065 = parsed.diagnostics.find(d => d.code === 'C2065');
            expect(c2065).toBeDefined();
            expect(c2065.line).toBe(102);
            expect(c2065.column).toBe(18);
            expect(c2065.severity).toBe('ERROR');
            expect(c2065.remediationHint).toContain('Undeclared identifier');

            // Check MSVC C1083 include error
            const c1083 = parsed.diagnostics.find(d => d.code === 'C1083');
            expect(c1083).toBeDefined();
            expect(c1083.remediationHint).toContain('Header file not found');

            // Check UBT general failure
            const ubtDiag = parsed.diagnostics.find(d => d.code === 'UBT_ERROR');
            expect(ubtDiag).toBeDefined();
            expect(ubtDiag.severity).toBe('ERROR');
        });
    });

    // ==========================================
    // HR-258: Unreal Automation Test Discovery & Results Parsing
    // ==========================================
    describe('HR-258: Unreal Automation Test Discovery & Results Parsing', () => {
        it('discovers automation tests from C++ source files using standard macros', () => {
            const sourceDir = path.join(tempDir, 'Source', 'Game');
            fs.mkdirSync(sourceDir, { recursive: true });

            const testFileContent = `
#include "CoreMinimal.h"
#include "Misc/AutomationTest.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FPlayerMovementTest, "Game.Player.Movement", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FPlayerMovementTest::RunTest(const FString& Parameters)
{
    TestTrue("Movement should be valid", true);
    return true;
}

IMPLEMENT_COMPLEX_AUTOMATION_TEST(FInventoryStressTest, "Game.Inventory.StressTest", EAutomationTestFlags::ClientContext)
            `;
            fs.writeFileSync(path.join(sourceDir, 'GameTests.cpp'), testFileContent, 'utf8');

            const tests = service.discoverAutomationTests(tempDir);
            expect(tests.length).toBe(2);

            const simpleTest = tests.find(t => t.testClass === 'FPlayerMovementTest');
            expect(simpleTest).toBeDefined();
            expect(simpleTest.testName).toBe('Game.Player.Movement');
            expect(simpleTest.testType).toBe('SIMPLE');
            expect(simpleTest.line).toBe(5);

            const complexTest = tests.find(t => t.testClass === 'FInventoryStressTest');
            expect(complexTest).toBeDefined();
            expect(complexTest.testName).toBe('Game.Inventory.StressTest');
            expect(complexTest.testType).toBe('COMPLEX');
        });

        it('parses automation test execution logs with pass/fail counts', () => {
            const testOutput = [
                '[2026.10.10-14.00.00:100][  0]LogAutomationController: Test Completed Game.Player.Movement (Success) in 0.045s',
                '[2026.10.10-14.00.00:200][  0]LogAutomationController: Test Completed Game.Player.Collision (Failed) in 0.120s',
                '[2026.10.10-14.00.00:300][  0]LogAutomationController: Test Completed Game.Inventory.StressTest (Success) in 1.450s'
            ].join('\n');

            const results = service.parseAutomationTestResults(testOutput);
            expect(results.total).toBe(3);
            expect(results.passed).toBe(2);
            expect(results.failed).toBe(1);
            expect(results.tests[0].status).toBe('PASSED');
            expect(results.tests[1].status).toBe('FAILED');
        });
    });

    // ==========================================
    // HR-259: Game Engineering Workforce Orchestration
    // ==========================================
    describe('HR-259: Game Engineering Workforce Recipes & Integration', () => {
        it('registers game engineering DAG recipes and integrates with HeadroomAdapter', () => {
            service.registerGameEngineeringRecipes(workflowService);

            const recipes = workflowService.listRecipes();
            expect(recipes.some(r => r.id === 'unreal-project-build')).toBe(true);
            expect(recipes.some(r => r.id === 'unreal-automation-test')).toBe(true);
            expect(recipes.some(r => r.id === 'unreal-asset-audit')).toBe(true);

            const mission = workflowService.instantiateRecipe('unreal-project-build', { target: 'MyGameEditor' });
            expect(mission.tasks.length).toBe(4);
            expect(mission.tasks[2].action).toContain('MyGameEditor');

            // Verify HeadroomAdapter wire-up
            const adapter = new HeadroomAdapter(':memory:');
            const ueService = adapter.getUnrealEngineService();
            expect(ueService).toBeDefined();
            expect(ueService.constructor.name).toBe('UnrealEngineService');
            expect(typeof ueService.discoverProjects).toBe('function');

            const adapterRecipes = adapter.engineeringWorkflows.listRecipes();
            expect(adapterRecipes.some(r => r.id === 'unreal-project-build')).toBe(true);
        });
    });
});
