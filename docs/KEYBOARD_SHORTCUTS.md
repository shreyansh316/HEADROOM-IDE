# HEADROOM IDE — VERIFIED KEYBOARD SHORTCUTS

**Product:** HEADROOM — AI Development Operating System  
**Version:** 0.1.0  
**Target Platform:** Windows 10/11

All shortcuts listed below have been verified against the actual implementation in `TitleBarManager`, `EditorManager`, and application event listeners.

---

## 1. FILE & WORKSPACE NAVIGATION

| Shortcut | Command Description | Implementation / Handler |
| :--- | :--- | :--- |
| `Ctrl+N` | **New File** | Creates a new unsaved buffer in `EditorManager` |
| `Ctrl+O` | **Open File...** | Prompts native OS file picker via `WorkspaceService` |
| `Ctrl+K Ctrl+O` | **Open Folder...** | Opens workspace folder dialog and reloads project |
| `Ctrl+S` | **Save File** | Flushes active editor buffer to local disk |
| `Ctrl+K S` | **Save All** | Iterates all open dirty buffers and flushes each to disk |
| `Ctrl+W` | **Close Tab** | Closes active editor tab |
| `Alt+F4` | **Exit Application** | Invokes secure Electron native window close lifecycle |
| `Ctrl+P` | **Quick Open File** | Focuses file explorer search / palette |
| `Ctrl+G` | **Go to Line Number** | Prompts line number and moves editor cursor |

---

## 2. EDITING & SELECTION

| Shortcut | Command Description | Implementation / Handler |
| :--- | :--- | :--- |
| `Ctrl+Z` | **Undo** | Reverts last editing transaction in CodeMirror 6 |
| `Ctrl+Y` | **Redo** | Restores next editing transaction in CodeMirror 6 |
| `Ctrl+X` | **Cut** | Native clipboard cut command |
| `Ctrl+C` | **Copy** | Native clipboard copy command |
| `Ctrl+V` | **Paste** | Native clipboard paste command |
| `Ctrl+A` | **Select All** | Selects all text in active editor document |
| `Shift+Alt+F` | **Format Document** | Formats document using language formatter |
| `Ctrl+Shift+F` | **Find in Workspace** | Performs ripgrep file search across workspace root |
| `Alt+Shift+Right` | **Expand Selection** | Syntactic selection expansion |
| `Shift+Alt+Down` | **Copy Line Down** | Duplicates current cursor line downward |

---

## 3. VIEW & LAYOUT TOGGLES

| Shortcut | Command Description | Implementation / Handler |
| :--- | :--- | :--- |
| `Ctrl+B` | **Toggle Sidebar** | Collapses or expands left Explorer/Git panel |
| `Ctrl+Alt+A` | **Toggle Agent Panel** | Opens or closes right-hand Agent Workforce panel |
| `Ctrl+\`` | **Toggle Terminal Panel** | Toggles bottom PTY terminal and diagnostics drawer |
| `Ctrl+\` | **Split Editor** | Toggles split editor pane view |
| `Ctrl+Shift+X` | **Extensions Marketplace** | Switches left sidebar to Open VSX Extension view |
| `Ctrl+Shift+G` | **Source Control / Git** | Switches left sidebar to Git staging and diff view |

---

## 4. RUN, DEBUG & TERMINAL

| Shortcut | Command Description | Implementation / Handler |
| :--- | :--- | :--- |
| `F5` | **Run Active File** | Executes active script via host toolchain |
| `F9` | **Debug Active File** | Initiates V8 Inspector debug session |
| `Shift+F5` | **Stop Debugging** | Halts active debugging session |
| `Ctrl+K` | **Clear Terminal** | Clears active PTY terminal buffer |

---

## 5. TITLE BAR & DROPDOWN NAVIGATION

| Key / Shortcut | Interaction Description | Implementation / Handler |
| :--- | :--- | :--- |
| `Click` on Menu | **Open Dropdown** | Opens menu dropdown and highlights active item |
| `ArrowDown` | **Next Menu Item** | Moves highlight down through dropdown items |
| `ArrowUp` | **Previous Menu Item** | Moves highlight up through dropdown items |
| `ArrowRight` | **Next Menu Cluster** | Switches to adjacent menu category on the right |
| `ArrowLeft` | **Previous Menu Cluster** | Switches to adjacent menu category on the left |
| `Enter` / `Space` | **Execute Item** | Dispatches selected menu action |
| `Escape` | **Dismiss Menu** | Closes open dropdown and restores button focus |
