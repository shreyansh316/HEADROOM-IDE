# HEADROOM IDE — TROUBLESHOOTING & RECOVERY MANUAL

**Product:** HEADROOM — AI Development Operating System  
**Version:** 0.1.0  
**Target Platform:** Windows 10/11 (x64)

---

## 1. BUILD & RUNTIME ISSUES

### 1.1 "TypeScript Prohibition Violation" on `npm run check:ts`
- **Symptom:** The quality gate fails reporting `.ts` or `.tsx` files in the repository.
- **Cause:** HEADROOM enforces a strict 100% Pure JavaScript mandate.
- **Resolution:**
  - Verify no accidental TypeScript files were generated:
    ```powershell
    node scripts/quality-gate.js check-ts
    ```
  - Convert any `.ts` source to clean JavaScript syntax (`.js`) and remove TypeScript type annotations.

### 1.2 "Cannot find module 'better-sqlite3'" During Native Start
- **Symptom:** Application fails to launch with an unhandled exception regarding `better-sqlite3.node`.
- **Cause:** Electron Node ABI mismatch with host Node.js version.
- **Resolution:**
  - Ensure `package.json` uses `-c.npmRebuild=false` for electron-builder, and rebuild native dependencies for Electron:
    ```powershell
    npx electron-rebuild -f -w better-sqlite3
    ```

---

## 2. AI PROVIDER & GATEWAY FAILURES

### 2.1 "Gateway Loopback Server Unreachable (Port 41400)"
- **Symptom:** Agent tasks fail immediately with error `ECONNREFUSED 127.0.0.1:41400`.
- **Cause:** Another process is binding port 41400 or local firewall blocked loopback traffic.
- **Resolution:**
  - Check port availability in PowerShell:
    ```powershell
    netstat -ano | findstr 41400
    ```
  - Kill orphaned processes or restart HEADROOM to re-bind the Gateway service.

### 2.2 "Provider Authentication Error (401 Unauthorized)"
- **Symptom:** Agent prompts report invalid API key for OpenAI, Anthropic, or Gemini.
- **Cause:** API key expired, malformed, or missing leading prefix (`sk-ant-...`, `sk-...`).
- **Resolution:**
  - Open `Settings › AI Providers`.
  - Re-enter the valid key and click **Test Connection** to verify before dispatching agent tasks.

### 2.3 "Model Rate Limit or Spend Cap Exceeded (429 / BudgetExceeded)"
- **Symptom:** Task halts with `BudgetExceededError` or upstream provider rate limits.
- **Cause:** Per-task spend cap reached or cloud API quota exhausted.
- **Resolution:**
  - Increase spend limit under `Settings › AI Providers › Spend Controls`.
  - Switch the Model Router strategy to `Economy` to leverage cheaper, higher-rate models.

---

## 3. AGENT WORKFORCE & DATABASE RECOVERY

### 3.1 Corrupted SQLite Database (`headroom-tasks.db`)
- **Symptom:** SQLite throws `SQLITE_CORRUPT: database disk image is malformed`.
- **Resolution:**
  - HEADROOM incorporates automated corrupt database recovery (`HR-325`):
    - The engine detects corruption via `PRAGMA integrity_check`.
    - Automatically backs up the corrupted file to `headroom-tasks.corrupted.<timestamp>.bak`.
    - Initializes a fresh, clean database schema while preserving uncorrupted project files.

### 3.2 Stale Worker Process Lock
- **Symptom:** A task is marked as `RUNNING` indefinitely after an unexpected machine shutdown.
- **Resolution:**
  - The stale worker eviction drill (`HR-327`) checks PID liveness on application startup.
  - If the worker process PID is dead, HEADROOM releases the lock and resets the task status to `FAILED_NEEDS_RESUMPTION`.
  - Click **Resume Task** in the Agent panel to restart from the last verified step checkpoint.

---

## 4. PACKAGING & ELECTRON DISTRIBUTION

### 4.1 Packaging Fails with electron-builder Error
- **Symptom:** `npm run package` fails during directory packaging.
- **Resolution:**
  - Ensure the authoritative engine bridge and renderer bundle are compiled first:
    ```powershell
    npm run build
    npm run package:dir
    ```
  - Verify that `release\win-unpacked\HEADROOM IDE.exe` exists and has execute permissions.
