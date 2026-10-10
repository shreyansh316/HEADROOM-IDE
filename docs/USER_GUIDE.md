# HEADROOM IDE — USER GUIDE

**Product:** HEADROOM — AI Development Operating System  
**Version:** 0.1.0 (Production Release Baseline)  
**Target Platform:** Windows 10/11 (x64)

---

## 1. WELCOME TO HEADROOM

HEADROOM is a standalone developer environment designed for autonomous AI pair programming, multi-agent workforce orchestration, and full-stack software engineering. Inspired by the clean, ergonomic interface of Antigravity IDE, HEADROOM integrates code editing, terminal management, Git control, and multi-provider AI model routing in a single sovereign desktop application.

---

## 2. INSTALLATION & FIRST LAUNCH

### 2.1 System Requirements
- **OS:** Windows 10 (Build 19041+) or Windows 11 (64-bit).
- **RAM:** 8 GB minimum (16 GB recommended for multi-agent workloads).
- **Disk Space:** 1.5 GB available space for IDE and runtime caches.
- **Node.js:** Node.js 18.x or 20.x (if developing from source).
- **PowerShell:** PowerShell 5.1+ (included with Windows).

### 2.2 Launching the Application
- **Packaged Executable:** Launch `release\win-unpacked\HEADROOM IDE.exe` or click the desktop shortcut.
- **Development Launch:** In the repository root, run:
  ```powershell
  npm start
  ```

### 2.3 First-Time Onboarding
Upon first launch, HEADROOM displays the Welcome & Profile Setup dialog:
1. **Developer Profile:** Enter your developer name or handle (e.g. `LeadEngineer`).
2. **Security PIN:** Set an optional 6-digit session lock PIN to safeguard sensitive operations and credential modifications.
3. **Workspace Folder:** Select an initial project directory, or click **Open Folder** in the top title bar menu.

---

## 3. NAVIGATING THE INTERFACE

```
+-----------------------------------------------------------------------------------------------+
| [HEADROOM] File Edit Selection View Go Run Terminal Help | HEADROOM / Project › File.js • | [] - X |
+-----------------------------------------------------------------------------------------------+
| EXPLORER  |  file.js [x]   style.css [x]                   | AGENT WORKFORCE                  |
| > src     |------------------------------------------------| Active Tasks: 1                  |
|   index.js| 1 | function initApp() {                       | [Engineering Department]         |
|   app.js  | 2 |     console.log('Running HEADROOM IDE');   | > Analyzing codebase AST...      |
| > tests   | 3 | }                                          | [Diff Review] [Approve] [Cancel] |
|           |                                                |                                  |
|-----------+------------------------------------------------+----------------------------------|
| TERMINAL  | HEADROOM PowerShell Session 1                                                     |
|           | PS D:\my-project> npm test                                                        |
+-----------------------------------------------------------------------------------------------+
```

### 3.1 The Native Title Bar
- **App Menus (Left):** Access standard commands through `File`, `Edit`, `Selection`, `View`, `Go`, `Run`, `Terminal`, and `Help`.
- **Centered Workspace Title (Middle):** Shows the current project folder and active file path. A prominent bullet (`•`) appears whenever the current file has unsaved edits.
- **Layout Toolbar (Right):**
  - **Split Editor:** Splits the editor into horizontal/vertical panes.
  - **Toggle Sidebar:** Hides or reveals the left File Explorer / Git pane.
  - **Toggle Terminal:** Opens or collapses the bottom terminal and diagnostics panel.
  - **Toggle Agent Panel:** Shows or hides the right-hand Agent Workforce panel.
  - **Layout Settings:** Quick-switch between Coding, Review, and Fullscreen layouts.
  - **Runtime Status Indicator:** Displays connectivity state (`Ready`, `Connecting`, `Offline`).
  - **Agent Badge:** Displays real-time active executing agent count.
- **Native Window Controls (Far Right):** Minimize, Maximize/Restore, and Close with native Windows styling.

---

## 4. CORE WORKFLOWS

### 4.1 Working with Files & Workspaces
- **Open Project:** Press `Ctrl+K Ctrl+O` or select `File › Open Folder...` to point HEADROOM to any directory.
- **New File:** Press `Ctrl+N` to create an unsaved buffer.
- **Save File:** Press `Ctrl+S` to write the active document to disk.
- **Save All:** Press `Ctrl+K S` to save all open dirty buffers simultaneously.
- **Find in Workspace:** Press `Ctrl+Shift+F` or use `Edit › Find in Workspace` to perform ripgrep-accelerated file searches.

### 4.2 Code Editing & Intelligence
- **CodeMirror 6 Editor:** Equipped with syntax highlighting for JavaScript, TypeScript definitions, Markdown, JSON, HTML, and CSS.
- **Diagnostics:** Inline syntax warning and error markers extracted from local compilers and linters.
- **Format Code:** Press `Shift+Alt+F` to reformat the active file with syntax preservation.

### 4.3 Agent Workforce & Mission Delegation
HEADROOM connects directly to the authoritative multi-agent workforce:
1. **Open Agent Panel:** Press `Ctrl+Alt+A` or click the robot badge in the title bar.
2. **Submit Objective:** Enter an engineering objective (e.g., *"Refactor authentication service to support OAuth2 tokens and add unit tests"*).
3. **Execution Review:**
   - Watch the agent decomposition into subtasks across specialized departments (Engineering, QA, Architecture).
   - Review file diffs in the live activity feed.
   - Click **Approve** on critical changes or trigger an **Emergency Stop** at any moment.

### 4.4 Interactive Terminal & Debugging
- **Terminal:** Press `Ctrl+\`` to toggle the integrated PowerShell terminal. Sessions support ANSI color formatting, piping, interactive commands, and background task execution.
- **Debugger:** Select `Run › Debug Active File` to launch a Node.js debug session. Inspect the call stack, toggle breakpoints, step through code, and evaluate variables over the V8 Inspector protocol.

---

## 5. SETTINGS & AI PROVIDER CONFIGURATION

Access Settings via `File › Settings` or the gear icon in the activity bar:

### 5.1 AI Providers
HEADROOM features a zero-leak credential vault supporting:
- **Anthropic:** Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku.
- **OpenAI:** GPT-4o, GPT-4o mini, o1, o3-mini.
- **Google Gemini:** Gemini 1.5 Pro, Gemini 2.0 Flash, Gemini 1.5 Flash.
- **Local/Compatible:** Ollama, vLLM, LM Studio via custom base URLs.

### 5.2 Model Routing & Spend Limits
- **Routing Strategy:** Choose from `Balanced` (default), `Quality` (prefers frontier models), `Economy` (prefers cost-effective models), or `Fast` (low-latency streaming).
- **Task Budget Cap:** Set a maximum dollar spend per task (e.g., `$0.50`). Tasks reaching the limit pause and request confirmation before continuing.
- **Token Efficiency:** Keep context pruning enabled to eliminate redundant files and whitespace, saving up to 80% on prompt tokens.

---

## 6. SESSIONS, PRIVACY & BACKUP

- **Session Inactivity Lock:** If left unattended for 30 minutes, HEADROOM locks the screen to prevent unauthorized access. Unlock using your configured PIN.
- **Zero Cloud Leakage:** All workspace files, agent task histories, diffs, and settings are stored locally on your machine in SQLite databases (`headroom-tasks.db`, `headroom-gateway.db`).
- **Backup & Restore:** Use `File › Export Workspace Bundle` to package your complete task history and configuration into a single portable `.json` archive.
