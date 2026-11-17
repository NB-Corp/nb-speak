# AGENTS.md — nb-speak Engineering Guide

`NB-Corp/nb-speak` is the universal structured IM bubble & artifact protocol, OpenAI/SSE bridge, DeepSeek Harness (`DSH`) plugin, tactile paper-ink playground, and `chat-human` Agent Skill in the `NB-Corp` ecosystem (`nb-search` discovers, `nb-extract` reads, `nb-im` routes, `nb-speak` speaks).

## Architecture & Module Ownership

| Path | Package / Surface | Responsibility |
| --- | --- | --- |
| `packages/core/` | `@nb-corp/nb-speak` | Zero-dependency TypeScript/ESM protocol (`send_message` + `send_artifact` schemas for OpenAI, Anthropic, Gemini), `computeBubbleSchedule` typing-delay cadence math, `normalizeTurnOutput` stream/fallback parser, deterministic `lintTurn` (`bubble_lint` parity), and `startSpeakBridge` HTTP/SSE OpenAI proxy (`bin/nb-speak.mjs`). |
| `packages/dsh-plugin/` | `@nb-corp/nb-speak-dsh` | Full-stack DeepSeek Harness (`DSH`) plugin + WebUI client extension: **Native Mode (`native`, default)** registers first-class `send_bubble` (`exec.concludeTurn()`) & `send_artifact` tools + `dsh-system-prompt` + bespoke WebUI bubbles, playable voice-note waveform pills, and interactive copyable artifact cards (`exports["./client"]`); also retains **Bridge Mode A (`skill`)** (`send_message <-> agent_send_message` remapping), **Mode B (`voice-model`)** 5-axis style weights, and reversible CLI installer (`scripts/install-dsh.mjs`). |
| `skills/chat-human/` | `chat-human` (`v0.2.0`) | Standalone Agent Skill (`npx skills add NB-Corp/nb-speak`) separating Layer 1 Universal Bubble Physics from Layer 2 Pluggable Persona & Mood Physics, plus zero-dep Python 3.10+ `bubble_lint.py` and `proactive_gate.py`. |
| `apps/web/` -> `docs/` | Live Playground & Docs | M12 warm paper-ink static frontend (`docs/index.html` & `docs/zh/index.html`). Uses `docs/assets/nb-speak-browser.js` compiled directly from `packages/core/src/{protocol,lint,parser}.ts` via `scripts/build.mjs`—never duplicate or mock protocol/linter logic in UI scripts. |

## Build & Verification Commands

Requires **Node.js >= 22.19** (Node 24 recommended) and **Python >= 3.10**. Zero external npm or pip packages are required to build or run tests:

```bash
# Compile TypeScript -> dist/*.js + sync apps/web/src -> docs/
npm run build

# Run full verification suite (Core TS + DSH Plugin TS + Python Skill tests)
npm test

# Start local OpenAI-compatible bridge on http://127.0.0.1:18090
node packages/core/bin/nb-speak.mjs serve --port 18090 --upstream-url https://api.deepseek.com/v1
```

## Invariants

1. **Single source of truth for browser & server**: `packages/core/src/{protocol,lint,parser}.ts` must stay free of Node-only imports (`node:fs`, `node:http`) so `scripts/build.mjs` compiles them cleanly into `docs/assets/nb-speak-browser.js`.
2. **Parity between TypeScript `lintTurn` and Python `bubble_lint.py`**: Any new lint error/warning code added to `packages/core/src/lint.ts` must have a matching rule and test case in `skills/chat-human/scripts/bubble_lint.py` and `tests/test_chat_human.py`.
3. **Subagent tool safety**: Native DSH mode registers `send_bubble` + `send_artifact` so DSH's subagent `send_message` stays untouched; OpenAI bridge modes remap internal subagent `send_message <-> agent_send_message` (`packages/dsh-plugin/src/tool-remap.ts`).
4. **Reversible installer safety**: `packages/dsh-plugin/scripts/install-dsh.mjs` must never read, modify, or delete `.credentials.yaml`.
