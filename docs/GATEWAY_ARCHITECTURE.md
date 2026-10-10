# HEADROOM AI API Gateway — Architecture & Implementation Specification

## 1. Overview & Vision
The **HEADROOM AI API Gateway** is a production-grade, vendor-neutral model routing, resilience, cost accounting, and usage platform integrated into HEADROOM IDE and the authoritative HEADROOM workforce. Inspired by OpenRouter, it unifies diverse AI model providers (OpenAI, Anthropic, Google Gemini, and custom OpenAI-compatible endpoints) behind one consistent API contract with deterministic capability-based routing, bounded fallback, and strict budget controls.

## 2. Core Architectural Components

### 2.1 Model Registry (`ModelRegistry.js`)
- Centralized, authoritative catalog of verified AI models across all supported providers.
- Captures granular metadata:
  - `provider`: `openai` | `anthropic` | `gemini` | `compatible`
  - `id`: Unique qualified identifier (e.g., `openai/gpt-4o`, `anthropic/claude-3-5-sonnet`, `gemini/gemini-1.5-pro`)
  - `name`: Display name
  - `contextWindow`: Maximum total context window in tokens
  - `maxOutputTokens`: Maximum single-turn output tokens
  - `capabilities`: Modalities (`text`, `image`), `tools` (function calling), `streaming`, `structuredOutput`, `reasoning`
  - `pricing`: `{ inputPerMillion, outputPerMillion, unit: 'USD' }` with explicit provenance
  - `availability`: `active` | `configured` | `missing_credential` | `unreachable`
- Dynamic registry discovery for OpenAI-compatible endpoints via `/v1/models` inspection.

### 2.2 Provider Adapters (`adapters/`)
- Unified interface `BaseProviderAdapter`:
  - `chatCompletion({ request, signal, onChunk })`: Generates or streams chat completions.
  - `testConnection()`: Validates API connectivity with actual non-destructive health requests.
  - `normalizeUsage(providerResponse)`: Extracts input, output, and reasoning tokens.
  - `normalizeError(err)`: Maps vendor HTTP and JSON errors into canonical gateway error codes.
- Implemented Adapters:
  - `OpenAIAdapter`: Native OpenAI Chat API (`/v1/chat/completions`) with tool calling, SSE streaming (`data: [DONE]`), and usage normalization.
  - `AnthropicAdapter`: Messages API (`/v1/messages`) with `x-api-key`, `anthropic-version`, streaming events (`content_block_delta`), and tool format translation.
  - `GeminiAdapter`: Gemini REST API (`generateContent` & `streamGenerateContent`) with API key query/header, system instructions, and token usage mapping.
  - `CompatibleAdapter`: Arbitrary OpenAI-compatible endpoints with strict SSRF protection, loopback policy validation, and custom header support.
  - `MockAdapter`: Deterministic local sandbox adapter for testing workforce workflows without live network credentials.

### 2.3 Intelligent Routing Engine (`ModelRouter.js`)
- Deterministic routing based on task requirements rather than hardcoded models.
- Routing Profiles:
  - `economy`: Prioritizes lowest cost per million tokens satisfying capability needs (e.g. `gpt-4o-mini`, `gemini-1.5-flash`, `claude-3-haiku`).
  - `balanced`: Strikes balance between latency, reliability, and capability.
  - `quality`: Highest benchmark models (`gpt-4o`, `claude-3-5-sonnet`, `gemini-1.5-pro`).
  - `coding`: Filtered for high-fidelity code generation and tool calling.
  - `reasoning`: Filtered for models with extended thinking/reasoning flags (`o1`, `o3-mini`).
  - `long-context`: Prioritizes context windows >= 128k/1M tokens (`gemini-1.5-pro`, `gpt-4o`).
- Explicit routing reason logged for every decision (e.g., "Selected `gemini-1.5-flash` under `economy` policy: satisfies required tools, lowest cost ($0.075/1M input)").

### 2.4 Resilience, Retries & Fallback (`GatewayResilience.js`)
- Retries transient errors (`429 Rate Limit`, `500/502/503/504 Server Error`, `ETIMEDOUT`, `ECONNRESET`) with bounded exponential backoff and jitter.
- Immediately halts on non-retryable errors (`401 Invalid Key`, `400 Bad Request`, `403 Permission Denied`).
- Cascading fallback: If primary provider fails after bounded retries, seamlessly cascades to an eligible fallback provider matching task capabilities, recording the fallback trace in the audit log.

### 2.5 Usage & Budget Accounting (`UsageTracker.js`)
- Tracks input tokens, output tokens, cached tokens, and estimated cost per request.
- Records data directly into SQLite (`ai_usages` table via `AIUsageRepository`).
- Enforces task-level and workspace-level budget limits (`maxTotalTokens`, `costCeilingUsd`). If a request would exceed budget, rejects early with `budget-exceeded`.

### 2.6 Secure Credential Store (`CredentialManager.js`)
- Encrypted/restricted storage for API credentials in workspace settings / OS keystore.
- Masks keys (`sk-...1234`) when transmitting to renderer IPC.
- Strict SSRF protection on compatible endpoints: blocks link-local, cloud metadata (`169.254.169.254`), and private networks unless explicitly marked as trusted local server.

### 2.7 Unified HTTP & IPC Server (`GatewayServer.js`)
- Embedded loopback HTTP server (`127.0.0.1:41400`):
  - `POST /v1/chat/completions`: Full OpenAI-compatible chat API with SSE streaming.
  - `GET /v1/models`: Discovered and available models.
  - `GET /health`: Gateway engine status and verified provider connectivity.
- IPC handlers for Electron renderer:
  - `gateway:getModels`, `gateway:getProviders`, `gateway:setCredential`, `gateway:testConnection`, `gateway:chat`, `gateway:getUsageStats`.

### 2.8 IDE & Workforce Integration
- **HEADROOM Workforce**: `HeadroomEngineAdapter` connects its `aiProvider` port directly to `GatewayService`. Employees route tasks through gateway policies (`coding`, `quality`, `economy`).
- **HEADROOM IDE UI**: Enhanced **AI Providers & Models** section in Settings with live connectivity tests, model selector, active routing policy, usage metrics, and cost charts.
