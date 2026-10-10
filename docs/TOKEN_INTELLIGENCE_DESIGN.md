# HEADROOM IDE — TOKEN INTELLIGENCE & COST ACCOUNTING DESIGN

Authoritative Design · Context Caching, Attribution, Budget Enforcements & Dashboards

---

## 1. Principles of Token Intelligence

The primary metric of success is **Minimum reasonable cost for a correct, secure, successfully verified engineering result**.

1. **Attribution Provenance**: Every request records:
   - Request ID, Model ID, Provider, Duration (ms).
   - Input tokens, output tokens, total tokens.
   - Purpose (`gateway-chat`, `task-planning`, `code-generation`, `code-review`).
   - Context ID (Task ID or Objective ID).
2. **Deterministic Pricing Engine**:
   - Upstream pricing verified from official model cards (OpenAI, Anthropic, Google).
   - Missing cost metrics labeled as `costKnown: false` or `Estimated`. Never fabricated.
3. **Hard Budget Enforcement**:
   - Per-task token limits and per-session USD ceilings.
   - When budget is reached, gateway halts further automated requests with `budget-exceeded` code and prompts for human approval.
4. **Context Deduplication & Efficiency**:
   - Reusable project map cache.
   - Structured JSON handoffs between agents to eliminate conversational fluff.
