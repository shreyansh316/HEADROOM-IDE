# HEADROOM IDE — VERIFICATION STRATEGY

Authoritative 6-Tier Verification Hierarchy

---

## Verification Levels

- **Level A — Static Verification**:
  - Pure JavaScript compliance (`npm run check:ts`).
  - ESLint verification (`npm run lint`).
  - TypeScript types check on JSDoc (`npm run typecheck`).
- **Level B — Unit Tests**:
  - ModelRegistry, ModelRouter, GatewayResilience, CredentialManager, UsageTracker, AccountService.
- **Level C — Integration Tests**:
  - Authoritative SQLite database schema, workforce execution lifecycle, task diffs, and evidence generation.
- **Level D — End-to-End System Tests**:
  - Electron window smoke launch, UI responsiveness, layout resizing, title bar interactions, and extension marketplace search.
- **Level E — Live Service Tests (Opt-in)**:
  - Real provider testing against OpenAI, Anthropic, or Gemini endpoints with user consent and masked audit logging.
- **Level F — Packaged Binary Tests**:
  - Windows unpacked binary packaging (`npm run package:dir`) and release launch verification.
