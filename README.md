# HEADROOM IDE

> **Professional Agentic Desktop IDE Inspired by Antigravity**  
> **Technology Policy: 100% Pure JavaScript. Zero TypeScript.**

HEADROOM IDE is a dedicated, production-grade desktop development environment for controlling the HEADROOM autonomous workforce and building real software applications.

---

## 1. Core Architecture

The desktop application is built with **Electron** and pure **ECMAScript JavaScript (ESM & CommonJS)**:

```
D:\codex room\IDE
├── package.json               # Root manifest, scripts & dependencies
├── esbuild.config.js          # Fast JS bundler for renderer UI (0% TS)
├── vitest.config.mjs          # Modern ESM test runner
├── scripts/
│   ├── quality-gate.js        # Prohibits .ts/.tsx, verifies node syntax & AST
│   └── smoke-test.js          # Validates real Electron window launch
├── src/
│   ├── main/
│   │   ├── index.js           # Main process, window management, CSP, IPC routing
│   │   ├── preload.js         # Context-isolated secure IPC bridge (headroomApi)
│   │   └── services/
│   │       ├── WorkspaceService.js       # Real file tree, file I/O, search
│   │       ├── TerminalService.js        # Real streaming shell execution
│   │       ├── GitService.js             # Git status, branches, diffs, commits
│   │       ├── HeadroomAdapter.js        # Autonomous workforce adapter (80 roles)
│   │       └── bundledPositionCatalog.js # Authoritative 80-position catalog
│   └── renderer/
│       ├── index.html         # Semantic 5-region IDE layout
│       ├── css/
│       │   ├── theme.css      # Antigravity-inspired light theme design tokens
│       │   ├── layout.css     # Window, panels, and resizable splitters
│       │   └── components.css # Editor tabs, tree view, terminal, task cards
│       └── js/
│           ├── app.js         # Central application coordinator
│           ├── editor/        # CodeMirror 6 code editor (JS, HTML, CSS, JSON, MD)
│           ├── explorer/      # Real directory navigation & file creation
│           ├── terminal/      # Real-time streaming terminal with input prompt
│           ├── git/           # Source control panel with diff viewer
│           ├── agent/         # Antigravity-inspired Task Composer & Workforce
│           └── settings/      # Provider gateway & security configuration
└── tests/
    ├── quality-gate.test.js      # Verifies 0 .ts/.tsx files in codebase
    ├── workspace-service.test.js # File tree, search, and I/O tests
    ├── git-service.test.js       # Real repo status and diff tests
    ├── headroom-adapter.test.js  # 80-position workforce and plan tests
    └── terminal-service.test.js  # Process spawn and streaming tests
```

---

## 2. Professional Visual Design (Light Theme Default)

Inspired by Google Antigravity's clean, high-contrast, technical usability:

| Token | Value | Semantic Purpose |
| :--- | :--- | :--- |
| `--bg-app` | `#F7F8FA` | Main application canvas background |
| `--bg-surface` | `#FFFFFF` | Primary surface (Editor, panels, cards) |
| `--bg-surface-secondary` | `#F1F3F6` | Secondary surface (Tabs bar, headers, status) |
| `--text-primary` | `#20242C` | High-contrast technical text |
| `--text-secondary` | `#687180` | Metadata, breadcrumbs, hints |
| `--border-color` | `#E1E5EB` | Restrained fine borders |
| `--accent-primary` | `#5267D8` | Antigravity primary accent blue |
| `--accent-hover` | `#4256C4` | Primary hover state |
| `--status-success` | `#27835A` | Passed tests & completed tasks |
| `--status-warning` | `#A86B12` | Approval required & warnings |
| `--status-error` | `#C44747` | Failed processes & errors |

---

## 3. Five-Region Desktop Layout

1. **Region A — Application Title Bar**: Custom drag region, HEADROOM branding, current workspace badge, quick actions (Open Folder, Save, Terminal, Agent Manager), and window controls (minimize, maximize, close).
2. **Region B — Activity Bar & Sidebar**: Activity navigation for Explorer (real file tree), Source Control (Git status, staged changes, diffs, commits), and Settings.
3. **Region C — Central Editor Workspace**: CodeMirror 6 text editor supporting JavaScript, HTML, CSS, JSON, and Markdown. Features multi-tab management, dirty file indicator (`•`), `Ctrl+S` save handling, syntax highlighting, active line highlight, and line numbering.
4. **Region D — Integrated Terminal Panel**: Real process streaming (PowerShell / cmd on Windows) with stdin command execution, command history (up/down arrow), clear terminal, and process termination.
5. **Region E — Agent Manager**: Task composer for executive objectives, real AI Director plan decomposition, CEO approval controls (Approve Plan / Reject), live task progress tracking, and full workforce hierarchy inspection (CEO -> Director -> 4 Offices -> 20 Departments -> 80 Positions).

---

## 4. HEADROOM Workforce Integration

Reuses the authoritative HEADROOM workforce hierarchy without duplication:
- **1 CEO** (User role): Executive Direction, Objective Intake, Plan Approval.
- **1 AI Director**: Workforce Orchestrator, Plan Decomposition, Cross-Office Routing.
- **4 Office Head Managers**:
  - Website Development Office
  - Game Development Office
  - App Development Office
  - Research & Making Office
- **20 Department Managers**: 5 departments per office (e.g. Frontend, Backend, QA & Testing, Security, DevOps, Engine Systems, etc.).
- **80 Employee Positions**: Exactly 4 specialized employees per department with assigned tool scopes, capabilities, and reality verification criteria.

---

## 5. Quality Gates & Verification

Run all repository quality gates:

```bash
# Verify 0 .ts/.tsx files and static syntax/AST checks
npm run typecheck

# Lint hygiene (debugger statements, merge conflict markers)
npm run lint

# Standalone TypeScript prohibition scan
npm run check:ts

# Build renderer bundle via esbuild
npm run build

# Run Vitest test suite
npm test

# Verify Electron desktop launch and main process initialization
npm run smoke

# Launch desktop IDE
npm start
```

---

## 6. License
MIT License — Copyright (c) 2026 HEADROOM Architecture Team.
