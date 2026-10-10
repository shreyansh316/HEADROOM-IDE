# HEADROOM IDE — ARCHITECTURE SPECIFICATION

Authoritative Document · Process Boundaries, Subsystems & IPC Contracts

---

## 1. Executive Overview

HEADROOM is a standalone Electron desktop AI Development Operating System. It pairs a high-performance Windows desktop IDE environment with the authoritative HEADROOM AI workforce engine (`D:\codex room\headroom`).

HEADROOM is **not a VS Code extension**. It enforces strict zero-trust process isolation between the Electron Main process (node execution host) and the Electron Renderer process (sandboxed web UI).

---

## 2. Process Boundaries & Security Architecture

```
+-----------------------------------------------------------------------------------+
|                           ELECTRON MAIN PROCESS (Node.js)                         |
|  - WorkspaceService (File I/O, Search)                                            |
|  - GitService (Git CLI wrapper)                                                   |
|  - TerminalService (node-pty, safe shell execution)                              |
|  - HeadroomAdapter (Authoritative SQLite Workforce Bridge)                       |
|  - LanguageSupportService (Host Toolchain Discovery & Linters)                     |
|  - DebuggerService (V8 Inspector Protocol Debug Session)                          |
|  - ExtensionService (Open VSX Registry & Sandboxed Extensions)                   |
|  - GatewayService & Loopback Server (ModelRegistry, Router, Adapters, Usage)     |
|  - AccountService (Local Profiles, PBKDF2 Session Security, Device Fingerprint)   |
+-----------------------------------------------------------------------------------+
                                         ▲
                                         │ IPC (contextBridge, validated handlers)
                                         ▼
+-----------------------------------------------------------------------------------+
|                        PRELOAD SCRIPT (preload.js)                                |
|  - contextIsolation: true                                                         |
|  - nodeIntegration: false                                                         |
|  - Exposes window.headroomApi                                                     |
+-----------------------------------------------------------------------------------+
                                         ▲
                                         │ Pure DOM / JS APIs
                                         ▼
+-----------------------------------------------------------------------------------+
|                        ELECTRON RENDERER PROCESS (UI)                             |
|  - TitleBarManager (Window controls, App menus, Profile Avatar menu)              |
|  - EditorManager (CodeMirror 6, Tabs, Breadcrumbs)                                |
|  - FileTree (Explorer view)                                                       |
|  - TerminalView & DebugView                                                       |
|  - AgentManager (Workforce objective submission, task review, diffs)              |
|  - SettingsView (AI Provider credentials, Models, Gateway diagnostics)            |
|  - AccountView (Sign-in modal, Welcome Onboarding, Session Lock overlay)          |
+-----------------------------------------------------------------------------------+
```

---

## 3. Subsystem Ownership

1. **Workspace & Filesystem**: Managed by `WorkspaceService.js`. Enforces canonical workspace root bounds.
2. **Git & Version Control**: Managed by `GitService.js`. Never force-pushes; provides diffs and branch status.
3. **Execution & Workforce Engine**: Authoritative engine is `D:\codex room\headroom`. HEADROOM IDE binds directly via `HeadroomAdapter.js` using SQLite persistence.
4. **AI Gateway**: Integrated in `src/main/services/gateway/`. Provides model abstraction, multi-credential storage, usage tracking, and loopback HTTP server (`http://127.0.0.1:41400`).
5. **Account & Identity**: Managed by `AccountService.js`. Separates local user developer identity from AI Provider credentials. Stores encrypted sessions, manages inactivity locks, and records audit logs.
