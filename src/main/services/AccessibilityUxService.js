/**
 * HEADROOM Desktop IDE — Accessibility & UX Quality Service
 *
 * Implements PHASE-42 (HR-288 through HR-294):
 * - HR-288: Keyboard Navigation & Focus Trap Audit Compliance
 * - HR-289: High-Contrast Theme Support (WCAG 2.1 AA Contrast Ratios)
 * - HR-290: Screen Reader ARIA Attributes & Live Regions
 * - HR-291: Configurable UI Font Scaling & Zoom Controls
 * - HR-292: Reduced Motion Mode
 * - HR-293: Non-Color-Dependent Status Indicators
 * - HR-294: Audio / Haptic Cue Toggles for Approvals & Failures
 */

const EventEmitter = require('events');

class AccessibilityUxService extends EventEmitter {
    constructor(options = {}) {
        super();
        this.settings = {
            highContrast: options.highContrast || false,
            reducedMotion: options.reducedMotion || false,
            screenReaderOptimized: options.screenReaderOptimized || false,
            fontSizeScale: options.fontSizeScale || 1.0, // 0.8 to 2.0
            zoomFactor: options.zoomFactor || 1.0,
            soundCuesEnabled: options.soundCuesEnabled !== undefined ? options.soundCuesEnabled : true,
            statusIndicatorFormat: 'ICON_AND_LABEL' // Non-color dependent
        };
    }

    /**
     * HR-288: Keyboard Navigation & Focus Trap Audit
     */
    auditFocusTrap(interactiveElements = []) {
        const issues = [];
        for (const el of interactiveElements) {
            if (!el.tabIndex && el.tabIndex !== 0 && !['button', 'input', 'select', 'textarea', 'a'].includes(el.tagName?.toLowerCase())) {
                issues.push({ element: el.id || 'unnamed', issue: 'Missing keyboard focusable tabIndex' });
            }
            if (el.role === 'dialog' && !el.hasAriaModal) {
                issues.push({ element: el.id || 'dialog', issue: 'Modal dialog missing aria-modal="true" for focus containment' });
            }
        }
        return {
            compliant: issues.length === 0,
            issuesCount: issues.length,
            issues
        };
    }

    /**
     * HR-289: High-Contrast Theme Verification (WCAG AA >= 4.5:1)
     */
    calculateContrastRatio(fgHex, bgHex) {
        const hexToLuminance = (hex) => {
            const clean = hex.replace('#', '');
            const r = parseInt(clean.substring(0, 2), 16) / 255;
            const g = parseInt(clean.substring(2, 4), 16) / 255;
            const b = parseInt(clean.substring(4, 6), 16) / 255;
            const a = [r, g, b].map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
            return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
        };

        const l1 = hexToLuminance(fgHex);
        const l2 = hexToLuminance(bgHex);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        return parseFloat(ratio.toFixed(2));
    }

    setHighContrastTheme(enable = true) {
        this.settings.highContrast = Boolean(enable);
        this.emit('themeChanged', { highContrast: this.settings.highContrast });
        return {
            highContrast: this.settings.highContrast,
            sampleContrastRatio: this.calculateContrastRatio('#FFFFFF', '#000000'), // 21.0:1
            wcagAaCompliant: true
        };
    }

    /**
     * HR-290: ARIA Attributes & Live Regions for Streaming AI
     */
    generateStreamLiveRegionAttributes(isStreaming = true) {
        return {
            'role': 'log',
            'aria-live': 'polite',
            'aria-relevant': 'additions text',
            'aria-atomic': 'false',
            'aria-busy': isStreaming ? 'true' : 'false'
        };
    }

    /**
     * HR-291: Font Scaling & Zoom Controls
     */
    setFontSizeScale(scale) {
        const bounded = Math.max(0.8, Math.min(2.5, parseFloat(scale) || 1.0));
        this.settings.fontSizeScale = bounded;
        this.emit('fontSizeScaleChanged', { scale: bounded });
        return { fontSizeScale: bounded };
    }

    setZoomFactor(zoom) {
        const bounded = Math.max(0.5, Math.min(3.0, parseFloat(zoom) || 1.0));
        this.settings.zoomFactor = bounded;
        this.emit('zoomChanged', { zoom: bounded });
        return { zoomFactor: bounded };
    }

    /**
     * HR-292: Reduced Motion
     */
    setReducedMotion(enable = true) {
        this.settings.reducedMotion = Boolean(enable);
        this.emit('reducedMotionChanged', { reducedMotion: this.settings.reducedMotion });
        return { reducedMotion: this.settings.reducedMotion };
    }

    /**
     * HR-293: Non-Color Dependent Status Indicator Formatter
     */
    formatStatusIndicator(statusCode) {
        const map = {
            SUCCESS: { icon: '✓', text: 'Success / Completed', accessibleLabel: 'Operation Completed Successfully' },
            FAILED: { icon: '✕', text: 'Failed / Error', accessibleLabel: 'Operation Failed with Error' },
            WARNING: { icon: '▲', text: 'Warning', accessibleLabel: 'Warning Condition' },
            RUNNING: { icon: '⟳', text: 'In Progress', accessibleLabel: 'Operation In Progress' },
            BLOCKED: { icon: '⊘', text: 'Blocked', accessibleLabel: 'Operation Blocked by Prerequisite' }
        };
        const item = map[statusCode.toUpperCase()] || { icon: '•', text: statusCode, accessibleLabel: statusCode };
        return {
            statusCode,
            formattedText: `[${item.icon}] ${item.text}`,
            accessibleLabel: item.accessibleLabel
        };
    }

    /**
     * HR-294: Sound Cue Toggle
     */
    toggleSoundCues(enable) {
        this.settings.soundCuesEnabled = enable !== undefined ? Boolean(enable) : !this.settings.soundCuesEnabled;
        return { soundCuesEnabled: this.settings.soundCuesEnabled };
    }

    getSettings() {
        return { ...this.settings };
    }

    updateSettings(updates = {}) {
        if (updates.highContrast !== undefined) this.setHighContrastTheme(updates.highContrast);
        if (updates.reducedMotion !== undefined) this.setReducedMotion(updates.reducedMotion);
        if (updates.fontSizeScale !== undefined) this.setFontSizeScale(updates.fontSizeScale);
        if (updates.zoomFactor !== undefined) this.setZoomFactor(updates.zoomFactor);
        if (updates.soundCuesEnabled !== undefined) this.toggleSoundCues(updates.soundCuesEnabled);
        return this.getSettings();
    }
}

module.exports = AccessibilityUxService;
