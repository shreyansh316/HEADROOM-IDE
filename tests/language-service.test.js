import { describe, it, expect } from 'vitest';
import LanguageSupportService from '../src/main/services/LanguageSupportService.js';

describe('LanguageSupportService', () => {
    const service = new LanguageSupportService();

    it('registers all 22 core supported languages and game engine extensions', () => {
        const langs = service.getLanguages();
        expect(langs.length).toBeGreaterThanOrEqual(22);

        const expectedIds = [
            'javascript', 'python', 'c_cpp', 'csharp', 'java', 'go', 'rust',
            'php', 'ruby', 'kotlin', 'swift', 'dart', 'lua', 'r', 'sql',
            'html_css', 'markup_data', 'shell', 'markdown', 'unreal', 'unity', 'godot'
        ];

        for (const id of expectedIds) {
            const found = langs.find(l => l.id === id);
            expect(found).toBeDefined();
            expect(found.name).toBeDefined();
        }
    });

    it('correctly detects language by file extension', () => {
        expect(service.getLanguageForFile('main.py').id).toBe('python');
        expect(service.getLanguageForFile('engine.cpp').id).toBe('c_cpp');
        expect(service.getLanguageForFile('GameManager.cs').id).toBe('csharp');
        expect(service.getLanguageForFile('server.go').id).toBe('go');
        expect(service.getLanguageForFile('lib.rs').id).toBe('rust');
        expect(service.getLanguageForFile('schema.sql').id).toBe('sql');
        expect(service.getLanguageForFile('script.gd').id).toBe('godot');
        expect(service.getLanguageForFile('MyProject.uproject').id).toBe('unreal');
        expect(service.getLanguageForFile('unknown.xyz').id).toBe('plaintext');
    });

    it('diagnoses installed tools for language runtimes', () => {
        const jsDiag = service.diagnoseLanguageSupport('javascript');
        expect(jsDiag.name).toBe('JavaScript / JSX');
        expect(jsDiag.tools.length).toBeGreaterThan(0);
        // Node is running the test, so Node must be detected
        const nodeTool = jsDiag.tools.find(t => t.name === 'Node.js');
        expect(nodeTool).toBeDefined();
        expect(nodeTool.installed).toBe(true);
        expect(nodeTool.version).toContain('v24');
    });

    it('detects project framework markers in a directory', () => {
        const detected = service.detectProjectTypes(process.cwd());
        expect(Array.isArray(detected)).toBe(true);
        const nodeProject = detected.find(d => d.language === 'javascript');
        expect(nodeProject).toBeDefined();
    });
});
