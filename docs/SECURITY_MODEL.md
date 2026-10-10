# HEADROOM IDE — SECURITY MODEL

Authoritative Specification · Threat Model, Zero-Leak Credentials & Privilege Boundaries

---

## 1. Principles of Least Privilege

1. **Renderer Isolation**: Renderer has no access to `node:fs`, `node:child_process`, or OS primitives. All access is mediated through validated IPC channels in `preload.js`.
2. **Credential Separation**:
   - User identity credentials (passwords, PINs, profile sessions) authenticate the human operator.
   - AI provider API keys (OpenAI, Anthropic, Gemini) are stored in `CredentialManager.js` in the main process.
   - API keys are **never** returned to the renderer in plaintext; masked representations (`sk-4o...1234`) are provided for UI verification.
3. **SSRF Defense**: Configurable AI model endpoints are validated against IP blocklists (`169.254.169.254`, `metadata.google.internal`) to prevent cloud credential exfiltration.
4. **Local Logout vs Remote Revocation**:
   - Local logout clears the active session token, locks sensitive UI controls, and invalidates in-memory session tokens.
   - It **never** silently deletes Git branches, project files, workforce task histories, or configured AI API keys.
5. **Session Security & Timeout**:
   - Inactivity timeouts lock the workspace after a configurable period (default: 30 minutes).
   - Sensitive actions (modifying API keys, switching profiles, deleting credentials) require re-authentication.
