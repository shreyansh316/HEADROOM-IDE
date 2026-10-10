# Zed Architecture Reference & Inspiration

## Upstream Project
- **Origin**: `https://github.com/zed-industries/zed`
- **Licenses**: GPL-3.0 (Editor), AGPL-3.0 (Server/Collab), Apache-2.0 (Selected crates).
- **Attribution**: Copyright (c) Zed Industries, Inc.

## Architecture Evaluation & Legal Boundary
Zed is a high-performance editor written entirely in Rust (GPUI framework).

### Decisions & Rationale
1. **No Direct Code Copy**: We do not copy Zed's Rust source or crates into HEADROOM IDE. Compiling Zed into Electron would violate the application's lightweight JavaScript runtime requirement and introduce incompatible toolchains.
2. **License Isolation**: By avoiding source copying and instead developing independent JavaScript implementations, we prevent licensing contamination while respecting Zed's intellectual property.
3. **Adopted Concepts**:
   - **Unified Custom Title Bar**: Clean, compact dark title bar with application menus, centered document indicator, and subtle toolbar layout controls.
   - **Split Pane Keyboard Ergonomics**: Direct Ctrl+\ or toolbar split actions that seamlessly partition the editor workspace.
   - **Non-blocking Buffer Management**: Ensuring large file renders and language server diagnostic passes never block UI responsiveness.
