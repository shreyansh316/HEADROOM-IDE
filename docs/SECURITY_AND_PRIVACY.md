# HEADROOM IDE — SECURITY & PRIVACY SPECIFICATION

**Document Version:** 1.0.0 (Release Acceptance Baseline)  
**Classification:** Public Security Policy  
**Product:** HEADROOM — AI Development Operating System

---

## 1. CORE SECURITY PRINCIPLES

HEADROOM is engineered with a **zero-trust, sovereign desktop architecture**. Developer source code, proprietary algorithms, and sensitive enterprise assets are treated as high-value confidential data.

1. **Local-First Processing:** Code analysis, workspace indexing, AST parsing, and terminal executions occur 100% locally on the host machine.
2. **Explicit AI Dispatch:** No code or file context is ever transmitted to an external AI provider unless explicitly requested by the user during an agent task or prompt.
3. **Zero Plaintext Secret Exposure:** API credentials for OpenAI, Anthropic, Gemini, and custom providers are encrypted at rest and never exposed to the UI renderer.

---

## 2. CREDENTIAL STORAGE & SECRET REDACTION

### 2.1 Storage Architecture
- **Location:** Main process `CredentialManager.js`.
- **Encryption:** Encryption-at-rest utilizes OS-level cryptographic primitives where available, backed by local AES-256-GCM authenticated encryption.
- **Renderer Protection:** The Electron renderer has zero access to raw keys. When settings or status are requested, keys are returned in masked format:
  ```json
  {
    "provider": "anthropic",
    "maskedKey": "sk-ant-...ab12",
    "isConfigured": true
  }
  ```

### 2.2 Telemetry & Output Redaction
All system output—including PTY terminal streams, agent execution logs, task diffs, and error stack traces—passes through a stream sanitizer in `SecurityHardeningService.js`:
- Regex filters automatically scrub patterns matching API keys (`sk-[a-zA-Z0-9]{32,}`, `AIzaSy[a-zA-Z0-9_-]{33}`, `ghp_[a-zA-Z0-9]{36}`).
- Matched secrets are replaced with `[REDACTED_API_KEY]` prior to persistence or UI delivery.

---

## 3. ELECTRON PROCESS & IPC SECURITY

### 3.1 Sandboxing & Isolation
- **Context Isolation:** `contextIsolation: true` is strictly enforced across all `BrowserWindow` instances.
- **Node Integration Disabled:** `nodeIntegration: false` ensures no renderer script can execute Node.js built-ins (`fs`, `child_process`, `net`).
- **Webview Disabled:** No remote webview tags are permitted in the application shell.

### 3.2 IPC Authorization Gateway
- All IPC calls must pass through predefined channel registries in `src/main/preload.js`.
- Arguments are validated against strict schema types.
- Path traversal attacks (`../../Windows/System32`) are proactively blocked by canonical path resolution within active workspace boundaries.

---

## 4. LOCAL PERSISTENCE & PRIVACY BOUNDARIES

### 4.1 SQLite Database Boundaries
All IDE state is maintained in three local SQLite databases within the application data directory:
1. `headroom-tasks.db`: Agent task specifications, step logs, tool invocations, and diff artifacts.
2. `headroom-gateway.db`: Token usage ledger and spend accounting.
3. `headroom-account.db`: Local user profiles, salted PBKDF2 password hashes, and session audit trails.

### 4.2 Data Deletion & Retention
- **Reset Workspace:** Users can execute a zero-trace wipe of task histories and local caches from `Settings › Privacy › Purge Local Cache`.
- **No Cloud Telemetry:** HEADROOM contains zero background tracking, analytics beacons, or remote telemetry pings.

---

## 5. INCIDENT RESPONSE & SECURITY AUDIT CHECKLIST

In the event of suspected key leakage or environment compromise:
1. **Instant Session Lock:** Press `Ctrl+Alt+L` to immediately lock all IDE surfaces.
2. **Key Invalidation:** Access `Settings › AI Providers`, select the compromised key, and click **Revoke / Clear**.
3. **Local Cache Purge:** Execute `npm run clean:cache` or remove `headroom-gateway.db` to flush cached credentials.
4. **Audit Review:** Review `docs/INTEGRATION-AUDIT-*.md` and `headroom-account.db` audit logs for unauthorized access timestamps.
