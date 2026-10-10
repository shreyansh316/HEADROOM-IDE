/**
 * HEADROOM Desktop IDE — Security Hardening & Zero-Leak Isolation Service
 *
 * Implements PHASE-25 (HR-169 through HR-175):
 * - HR-169: SSRF Protection & Private Network IP Blocking
 * - HR-170: Shell Argument & Process Execution Sanitization
 * - HR-171: Path Traversal & Workspace Sandbox Confinement
 * - HR-172: Sensitive Secret Redaction & Token Masking in Logs
 * - HR-173: Secure Environment Variable Isolation
 * - HR-174: Content Security Policy & Webview Sandbox Hardening
 * - HR-175: Zero-Leak Data Loss Prevention Gate
 */

const path = require('path');
const net = require('net');

class SecurityHardeningService {
    constructor(options = {}) {
        this.workspaceRoot = options.workspaceRoot ? path.resolve(options.workspaceRoot) : process.cwd();
        this.allowedPrivateHosts = new Set(options.allowedPrivateHosts || ['localhost', '127.0.0.1', '::1']);
        this.secretPatterns = [
            /sk-[a-zA-Z0-9_\-]{16,}/g,
            /ghp_[a-zA-Z0-9]{20,}/g,
            /github_pat_[a-zA-Z0-9_]{22,}/g,
            /bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi,
            /x-api-key\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{16,}['"]?/gi,
            /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g
        ];
    }

    /**
     * HR-169: SSRF Protection & Private Network IP Blocking
     */
    isSafeOutboundUrl(targetUrl, allowLocalLoopback = false) {
        try {
            const parsed = new URL(targetUrl);
            const hostname = parsed.hostname.toLowerCase();

            // Check if protocol is safe
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                return { safe: false, reason: `Disallowed protocol: ${parsed.protocol}` };
            }

            // Loopback check
            const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
            if (isLoopback) {
                if (allowLocalLoopback || this.allowedPrivateHosts.has(hostname)) {
                    return { safe: true, hostname, isLoopback: true };
                }
                return { safe: false, reason: 'Loopback requests blocked by SSRF policy' };
            }

            // AWS / Cloud Metadata endpoint
            if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
                return { safe: false, reason: 'Cloud instance metadata endpoint blocked' };
            }

            // Check IP address ranges
            if (net.isIP(hostname)) {
                if (this.isPrivateIp(hostname)) {
                    if (this.allowedPrivateHosts.has(hostname)) {
                        return { safe: true, hostname };
                    }
                    return { safe: false, reason: `Private/internal IP range blocked: ${hostname}` };
                }
            }

            return { safe: true, hostname };
        } catch (err) {
            return { safe: false, reason: `Invalid URL format: ${err.message}` };
        }
    }

    isPrivateIp(ip) {
        if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip === '0.0.0.0') {
            return true;
        }
        // 172.16.0.0 - 172.31.255.255
        if (ip.startsWith('172.')) {
            const parts = ip.split('.');
            const second = parseInt(parts[1], 10);
            if (second >= 16 && second <= 31) return true;
        }
        // IPv6 private/link-local/unique-local
        if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) {
            return true;
        }
        return false;
    }

    /**
     * HR-170: Shell Argument & Process Execution Sanitization
     */
    sanitizeShellArg(arg) {
        if (arg === null || arg === undefined) return "''";
        const str = String(arg);
        // On Windows and POSIX, wrap securely
        if (/^[a-zA-Z0-9_\-\.\/\\:=]+$/.test(str)) {
            return str;
        }
        // Escape quotes
        return `"${str.replace(/"/g, '\\"')}"`;
    }

    validateCommandString(commandStr) {
        // Disallow dangerous shell chaining if executing in restricted mode
        const dangerousPatterns = [
            /;\s*rm\s+-rf/i,
            /\|\s*sh/i,
            /\|\s*bash/i,
            /&\s*del\s+\/f/i,
            />\s*\/dev\/null/i
        ];
        for (const pattern of dangerousPatterns) {
            if (pattern.test(commandStr)) {
                return { valid: false, reason: `Command contains forbidden destructive pattern: ${pattern}` };
            }
        }
        return { valid: true };
    }

    /**
     * HR-171: Path Traversal & Workspace Sandbox Confinement
     */
    validatePathConfinement(targetPath, baseDir = null) {
        const root = baseDir ? path.resolve(baseDir) : this.workspaceRoot;
        const resolved = path.resolve(root, targetPath);

        const relative = path.relative(root, resolved);
        const isOutside = relative.startsWith('..') || path.isAbsolute(relative);

        if (isOutside) {
            return {
                confined: false,
                resolvedPath: resolved,
                error: `Security Violation: Path "${targetPath}" resolves outside workspace root "${root}"`
            };
        }

        return {
            confined: true,
            resolvedPath: resolved,
            relativePath: relative
        };
    }

    /**
     * HR-172: Sensitive Secret Redaction & Token Masking in Logs
     */
    redactSecrets(content) {
        if (typeof content !== 'string') return content;
        let redacted = content;
        for (const pattern of this.secretPatterns) {
            redacted = redacted.replace(pattern, (match) => {
                if (match.startsWith('bearer ') || match.startsWith('Bearer ')) {
                    return 'Bearer [REDACTED_SECRET]';
                }
                return '[REDACTED_SECRET]';
            });
        }
        return redacted;
    }

    /**
     * HR-173: Secure Environment Variable Isolation
     */
    createIsolatedEnvironment(customEnv = {}, options = {}) {
        const blacklist = new Set([
            'AWS_SECRET_ACCESS_KEY',
            'AWS_SESSION_TOKEN',
            'OPENAI_API_KEY',
            'ANTHROPIC_API_KEY',
            'GEMINI_API_KEY',
            'GITHUB_TOKEN',
            'GH_TOKEN',
            'HEADROOM_MASTER_KEY',
            'SSH_AUTH_SOCK',
            ...(options.additionalBlacklist || [])
        ]);

        const sanitized = {};
        for (const [key, value] of Object.entries(process.env)) {
            if (!blacklist.has(key) && !key.toUpperCase().includes('SECRET') && !key.toUpperCase().includes('TOKEN')) {
                sanitized[key] = value;
            }
        }

        // Apply whitelisted or custom variables
        for (const [key, value] of Object.entries(customEnv)) {
            sanitized[key] = value;
        }

        return sanitized;
    }

    /**
     * HR-174: Content Security Policy & Webview Sandbox Hardening
     */
    getCspPolicy(isDev = false) {
        if (isDev) {
            return "default-src 'self' 'unsafe-inline' 'unsafe-eval' ws: http:; img-src 'self' data: https:;";
        }
        return [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https://open-vsx.org",
            "connect-src 'self' https://open-vsx.org http://127.0.0.1:* ws://127.0.0.1:*",
            "font-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'"
        ].join('; ');
    }

    validateWebviewSandbox(sandboxAttributes) {
        const flags = String(sandboxAttributes || '').split(/\s+/).filter(Boolean);
        const forbiddenFlags = ['allow-top-navigation', 'allow-top-navigation-by-user-activation', 'allow-modals'];
        const violations = flags.filter(f => forbiddenFlags.includes(f));
        if (violations.length > 0) {
            return {
                valid: false,
                reason: `Webview contains insecure sandbox flags: ${violations.join(', ')}`
            };
        }
        return { valid: true, flags };
    }

    /**
     * HR-175: Zero-Leak Data Loss Prevention Gate
     */
    validateZeroLeakOutbound(payload) {
        const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
        for (const pattern of this.secretPatterns) {
            if (pattern.test(payloadStr)) {
                return {
                    passed: false,
                    reason: 'Payload contains unmasked credentials or private keys'
                };
            }
        }
        return { passed: true };
    }
}

module.exports = SecurityHardeningService;
