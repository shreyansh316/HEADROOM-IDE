# HEADROOM IDE — PRODUCTION RELEASE NOTES (v0.1.0)

**Release Version:** v0.1.0 (Golden Master Candidate)  
**Release Date:** October 10, 2026  
**Build Platform:** Windows 10/11 (x64)  
**Binary Location:** `release\win-unpacked\HEADROOM IDE.exe`

---

## 1. RELEASE HIGHLIGHTS

HEADROOM v0.1.0 represents the inaugural production release of the **AI Development Operating System**. Built from the ground up as a sovereign desktop developer environment, HEADROOM combines the speed of an Antigravity-inspired desktop interface with an autonomous AI workforce.

### Key Milestones Delivered:
1. **Premium Native Title Bar:**
   - 8 application menus (`File`, `Edit`, `Selection`, `View`, `Go`, `Run`, `Terminal`, `Help`) wired to actual IDE commands.
   - Absolute horizontal midpoint workspace title with live dirty-document indicator (`•`).
   - Integrated layout controls, runtime connection status, and active agent execution counter.
   - Synchronized native Windows window controls with maximize/restore icon toggle and red close hover.
2. **Authoritative AI Workforce Integration:**
   - Direct binding to `D:\codex room\headroom` authoritative engine.
   - Real-time task progress streaming, tool execution audit feed, and multi-file diff review.
3. **Provider-Neutral Gateway:**
   - Unified routing across Anthropic, OpenAI, Gemini, and local Ollama/LM Studio models.
   - Token efficiency context pruning (>80% token savings on redundant code).
   - Real-time token ledger and spend limit caps.
4. **Full-Stack Developer Tooling:**
   - CodeMirror 6 multi-tab editor with JavaScript, Markdown, JSON, HTML, and CSS support.
   - Interactive PTY PowerShell terminal console.
   - V8 Inspector protocol debugger with breakpoints and variable inspection.
   - Open VSX extension marketplace integration with zip-slip security protections.
5. **100% Pure JavaScript Architecture:**
   - Zero TypeScript runtime dependencies across all application layers, passing automated AST syntax and hygiene quality gates.

---

## 2. SYSTEM REQUIREMENTS & SUPPORTED PLATFORMS

| Component | Specification |
| :--- | :--- |
| **Operating System** | Windows 10 (64-bit, Version 2004+) or Windows 11 |
| **Architecture** | x86_64 / x64 |
| **Memory (RAM)** | 8 GB minimum, 16 GB recommended |
| **Storage** | 1.5 GB free disk space for IDE, dependencies, and local databases |
| **Shell** | Windows PowerShell 5.1 or PowerShell 7.x |

---

## 3. KNOWN LIMITATIONS & CONSIDERATIONS

- **Linux / macOS Support:** Current packaging targets Windows x64 (`win-unpacked`). Cross-platform packaging configurations for macOS (.dmg) and Linux (.AppImage) are planned for v0.2.0.
- **Node Inspector Single Session:** Debugging currently supports one active V8 Inspector session at a time per workspace.
- **Offline Agent Execution:** Agent missions require either local LLM connectivity (via Ollama on `127.0.0.1:11434`) or active internet connection to cloud AI providers.

---

## 4. UPGRADE & ROLLBACK INSTRUCTIONS

### Upgrading from Alpha / Development Builds:
1. Back up existing workspace databases (`headroom-tasks.db`, `headroom-gateway.db`).
2. Replace application folder or run the v0.1.0 package.
3. Existing task journals and profile settings are automatically migrated on launch.

### Rollback Procedure:
If a critical issue occurs with v0.1.0:
1. Terminate any running `HEADROOM IDE.exe` processes.
2. Restore database files from `.corrupted.<timestamp>.bak` or the previous backup archive.
3. Re-launch previous verified build executable.
