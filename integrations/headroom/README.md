# HEADROOM Authoritative Engine Integration

## Boundary & Architecture

- **Authoritative Engine Source**: `D:\codex room\headroom`
- **Adapter Service**: `src/main/services/HeadroomAdapter.js`
- **Bridge Builder**: `scripts/build-engine-bridge.js`
- **Event Streaming**: `src/main/services/HeadroomEventBridge.js`

## Rules of Engagement

1. **Single Source of Truth**: Task lifecycle, agent hierarchy, execution states, permissions, and database operations are authoritative inside HEADROOM engine. The desktop IDE does not create a shadow workforce.
2. **Deterministic Sequence**: Events use monotonic sequence numbers (`seq_id`) stored in SQLite `headroom_events`.
3. **No TypeScript in IDE Code**: While the upstream repository may contain build targets, all code in `D:\codex room\IDE` is 100% pure JavaScript.
4. **Human in the Loop**: Plan approvals (`headroom:approvePlan`) and file changes are explicitly surfaced to the user before destructive operations occur.
