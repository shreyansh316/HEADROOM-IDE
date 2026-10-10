import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { revealHeading } from '../src/renderer/js/common/typewriter.js';

describe('HEADROOM IDE UI Professional Redesign Verification', () => {
    const root = path.resolve(__dirname, '..');
    const themeCss = fs.readFileSync(path.join(root, 'src', 'renderer', 'css', 'theme.css'), 'utf8');
    const layoutCss = fs.readFileSync(path.join(root, 'src', 'renderer', 'css', 'layout.css'), 'utf8');
    const componentsCss = fs.readFileSync(path.join(root, 'src', 'renderer', 'css', 'components.css'), 'utf8');

    it('defines the centralized design tokens according to specification', () => {
        // Dark Application Chrome tokens (Dark Charcoal or Legacy)
        expect(themeCss.includes('--chrome-bg: #1E1E1E') || themeCss.includes('--chrome-bg: #171A20')).toBe(true);
        expect(themeCss.includes('--chrome-panel: #252526') || themeCss.includes('--chrome-panel: #1D2129')).toBe(true);
        expect(themeCss.includes('--chrome-hover: #2D2D30') || themeCss.includes('--chrome-hover: #282E38')).toBe(true);
        expect(themeCss.includes('--chrome-selected: #37373D') || themeCss.includes('--chrome-selected: #30394A')).toBe(true);
        expect(themeCss.includes('--chrome-border: #383838') || themeCss.includes('--chrome-border: #343A45')).toBe(true);
        expect(themeCss.includes('--chrome-text: #CCCCCC') || themeCss.includes('--chrome-text: #E6EAF0')).toBe(true);
        expect(themeCss.includes('--chrome-muted: #929292') || themeCss.includes('--chrome-muted: #929BAA')).toBe(true);

        // Coordinated Light Working Surfaces
        expect(themeCss).toContain('--workspace-bg: #F3F5F8');
        expect(themeCss).toContain('--surface-primary: #FFFFFF');
        expect(themeCss).toContain('--surface-secondary: #EDF0F5');
        expect(themeCss).toContain('--surface-tertiary: #E6EAF1');
        expect(themeCss).toContain('--workspace-border: #D6DCE5');
        expect(themeCss).toContain('--text-primary: #202631');
        expect(themeCss).toContain('--text-secondary: #687385');
        expect(themeCss).toContain('--accent: #6479D8');
        expect(themeCss).toContain('--accent-hover: #5368C7');
        expect(themeCss).toContain('--success: #27835A');
        expect(themeCss).toContain('--warning: #A86B12');
        expect(themeCss).toContain('--error: #C44747');
    });

    it('enforces square geometry (0-2px) throughout tokens and styling', () => {
        expect(themeCss).toContain('--radius-none: 0px');
        expect(themeCss).toContain('--radius-sm: 1px');
        expect(themeCss).toContain('--radius-md: 2px');
        expect(themeCss).toContain('--radius-lg: 2px');

        // Verify editor tabs have square corners
        expect(componentsCss).toContain('border-radius: var(--radius-none)');
    });

    it('configures dark chrome for titlebar, activity bar, sidebar, and statusbar in layout', () => {
        // Titlebar uses dark chrome
        expect(layoutCss).toContain('background-color: var(--chrome-bg)');
        expect(layoutCss).toContain('border-bottom: 1px solid var(--chrome-border)');

        // Activity bar uses chrome-panel
        expect(layoutCss).toContain('background-color: var(--chrome-panel)');
        expect(layoutCss).toContain('border-right: 1px solid var(--chrome-border)');

        // Sidebar uses chrome-panel
        expect(layoutCss).toContain('.sidebar');
        expect(layoutCss).toContain('border-right: 1px solid var(--chrome-border)');

        // Statusbar uses chrome-bg
        expect(layoutCss).toContain('.statusbar');
        expect(layoutCss).toContain('border-top: 1px solid var(--chrome-border)');
    });

    it('implements the 40/60 vertical split in the Agent Manager', () => {
        expect(layoutCss).toContain('.agent-grid-container');
        expect(layoutCss).toContain('.agent-upper-region');
        expect(layoutCss).toContain('max-height: 40%');
        expect(layoutCss).toContain('.agent-lower-region');
        expect(layoutCss).toContain('flex: 1 1 60%');
        expect(layoutCss).toContain('.agent-chat-stream');
        expect(layoutCss).toContain('.agent-composer-anchor');
    });

    it('unifies the terminal into the coordinated workspace surface', () => {
        // Bottom panel border matches workspace border
        expect(layoutCss).toContain('border-top: 1px solid var(--workspace-border)');
        expect(layoutCss).toContain('.panel-tab');
        expect(layoutCss).toContain('border-right: 1px solid var(--workspace-border)');
        expect(componentsCss).toContain('.terminal-container');
        expect(componentsCss).toContain('background-color: var(--chrome-bg)');
        expect(componentsCss).toContain('.terminal-prompt-row');
    });

    it('verifies custom SVG outline icon file tree implementation', () => {
        const fileTreeJs = fs.readFileSync(path.join(root, 'src', 'renderer', 'js', 'explorer', 'fileTree.js'), 'utf8');
        const iconsJs = fs.readFileSync(path.join(root, 'src', 'renderer', 'js', 'common', 'icons.js'), 'utf8');
        expect(iconsJs).toContain('folderClosed: `<svg');
        expect(iconsJs).toContain('folderOpen: `<svg');
        expect(iconsJs).toContain('chevron: `<svg');
        expect(iconsJs).toContain('fileCode: `<svg');
        expect(fileTreeJs).toContain('import { ICONS, getFileIcon }');
        expect(fileTreeJs).toContain('expanded-folder');
        expect(componentsCss).toContain('.tree-node.expanded-folder');
        expect(componentsCss).toContain('.tree-children');
        expect(componentsCss).toContain('border-left: 1px solid #282E38');
    });

    it('verifies center workspace repair and geometry styling', () => {
        expect(layoutCss).toContain('.center-workspace');
        expect(layoutCss).toContain('min-width: 0');
        expect(layoutCss).toContain('min-height: 0');
        expect(layoutCss).toContain('.editor-container.is-empty');

        // Editor tab bar improvements
        expect(componentsCss).toContain('.empty-tabs-hint');
        expect(componentsCss).toContain('.tab-file-icon');

        // Compact useful empty workspace state card
        expect(componentsCss).toContain('.workspace-empty-state');
        expect(componentsCss).toContain('.empty-state-card');
        expect(componentsCss).toContain('.empty-btn-group');
        expect(componentsCss).toContain('.empty-shortcut-hints');
    });

    it('verifies heading reveal animation satisfies requirements', () => {
        const mockEl = {
            textContent: '',
            attributes: {},
            setAttribute(name, val) {
                this.attributes[name] = val;
            }
        };

        // When revealHeading is called, aria-label is immediately set for accessibility
        revealHeading(mockEl, 'HEADROOM IDE', 700);
        expect(mockEl.attributes['aria-label']).toBe('HEADROOM IDE');
    });
});
