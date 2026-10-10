# Open VSX Extension Marketplace Integration

## Origin & Standards
- **Registry**: `https://open-vsx.org/`
- **Specification**: Open VSX REST API v1
- **Target Application**: HEADROOM IDE (Electron / JavaScript desktop environment)

## Extension Compatibility Surface
Open VSX hosts thousands of extensions built for VS Code. In HEADROOM IDE:
- **Directly Supported**: TextMate grammar packages, JSON syntax themes, CodeMirror language highlighters, declarative code snippets.
- **Limited / Host-Emulated**: Extensions requiring the full VS Code Node extension host runtime (Language Server Protocol processes, `vscode` API calls) require our dedicated extension compatibility adapter.
- **Security Policy**: Every downloaded extension archive (.vsix) is unpacked into the sandboxed `userData/extensions/` directory with strict path-traversal validation (`..` and absolute paths rejected) and no silent execution of untrusted scripts.
