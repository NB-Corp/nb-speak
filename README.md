<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-dark.svg">
  <img src="docs/assets/banner-light.svg" alt="nb-speak — How AI agents actually speak to humans." width="1200">
</picture>

**Universal `send_message` + `send_artifact` IM bubble protocol, native DeepSeek Harness (`DSH`) WebUI plugin, zero-dependency OpenAI/SSE bridge, `chat-human` Agent Skill, and optional provider-agnostic voice notes (off by default).**

[![CI](https://img.shields.io/github/actions/workflow/status/NB-Corp/nb-speak/ci.yml?branch=main&style=flat-square&color=2d4b35)](https://github.com/NB-Corp/nb-speak/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-22.19%2B-2d4b35?style=flat-square)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.10%2B-2d4b35?style=flat-square)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-2d4b35?style=flat-square)](LICENSE)
[![Playground](https://img.shields.io/badge/playground-live%20split--stage-2d4b35?style=flat-square)](https://nb-corp.github.io/nb-speak/)

[**Interactive Stage & Playable Voice Demo**](https://nb-corp.github.io/nb-speak/) · [30s Quick Start](#quick-start) · [4 Live DSH Duels](#same-model-different-delivery-4-live-dsh-duels) · [Protocol & SSE](#wire-protocol--sse-contract) · [DSH Plugin](#deepseek-harness-plugin-nb-corpnb-speak-dsh) · [bubble_lint](#deterministic-bubble_lint-specification) · [llms.txt](llms.txt)

**English** · [简体中文](README.zh-CN.md)

</div>

Most AI chat clients and agent harnesses still dump 250-word Markdown essays into a single `assistant.content` blob—cramming SQL fences and pipe tables inside narrow phone bubbles, lecturing tired humans on casual Friday evenings, and reading text bubbles word-for-word in TTS. Within the **NB-Corp** ecosystem ([nb-search](https://github.com/NB-Corp/nb-search) discovers, [nb-extract](https://github.com/NB-Corp/nb-extract) reads, [nb-im](https://github.com/NB-Corp/nb-im) routes), **`nb-speak`** gives any LLM human mobile delivery physics—paced short bubbles, slide-out code/table cards, and strictly opt-in complementary voice notes:

<p align="center">
  <a href="https://nb-corp.github.io/nb-speak/">
    <img src="docs/assets/dsh-hero-showcase.png" alt="Live DeepSeek Harness comparison (:19081 Vanilla vs :19082 nb-speak): Casual Friday off-work chat and 4.2M-row production SQL triage with native IM bubbles, copyable SQL cards, and optional voice-note pills" width="1160">
  </a>
</p>

<p align="center">
  <strong><a href="https://nb-corp.github.io/nb-speak/">Try the Interactive Split-Stage, Inspect Copyable Cards, Play Optional Voice Demos &amp; View Full-Res DSH Captures → nb-corp.github.io/nb-speak</a></strong>
</p>

## Quick start

> **Zero-dependency release (`v0.2.0`):** Prebuilt ESM artifacts (`dist/`) run directly on **Node.js >= 22.19** (Node 24 recommended) and **Python >= 3.10** stdlib—zero runtime npm or pip packages required.

### 1. Add the `chat-human` Agent Skill (Codex, Claude Code, Kiki, Cursor)

```bash
npx skills add NB-Corp/nb-speak
# Or from the standalone skill mirror:
npx skills add NB-Corp/chat-human
```

### 2. Mount Native IM Bubbles & Voice Notes in DeepSeek Harness (`DSH`)

Published as the standalone zero-clone repository **[`NB-Corp/nb-speak-dsh`](https://github.com/NB-Corp/nb-speak-dsh)** ([Live DSH Showcase →](https://nb-corp.github.io/nb-speak-dsh/)):

```bash
# Preview safely, then persist ~/.dsh/plugins/nb-speak-dsh & mount into your web profile
npx --yes github:NB-Corp/nb-speak-dsh --dry-run --profile web
npx --yes github:NB-Corp/nb-speak-dsh --apply --profile web

# Launch DSH WebUI (default: pure text bubbles + artifact cards, voice notes disabled)
dsh web

# Optional: opt in to voice_note capsules (--voice-notes or NB_SPEAK_VOICE_NOTES=true)
# Works with OpenAI-compatible /v1/audio/speech endpoints, local JSON bridges, or Web Speech
NB_SPEAK_VOICE_NOTES=true NB_SPEAK_TTS_BASE_URL="http://127.0.0.1:8000/v1" dsh web

# Byte-for-byte reversible uninstall (never reads or touches .credentials.yaml)
npx --yes github:NB-Corp/nb-speak-dsh --uninstall --profile web
```

### 3. Run the OpenAI/SSE Bridge, Linter, or Normalizer in 30 Seconds

```bash
# 1. Start the local OpenAI-compatible HTTP/SSE bridge on http://127.0.0.1:18090
NB_SPEAK_API_KEY="sk-..." npx --yes github:NB-Corp/nb-speak serve \
  --port 18090 \
  --upstream-url https://api.deepseek.com/v1 \
  --model deepseek-chat \
  --persona calm_sre

# 2. Deterministically lint an outbound turn (0 issues -> exit code 0)
echo '{"bubbles":["Error rate held at 0.02%, p99 down to 38ms","Pool looks steady, good to push 100%"]}' \
  | node packages/core/bin/nb-speak.mjs lint --json

# 3. Normalize a raw Markdown + SQL wall into paced bubbles & extracted artifacts
printf 'Bubble 1: Query fixed.\n\n```sql\n-- fix.sql\nSELECT 1;\n```\n\nReady to ship.\n' \
  | node packages/core/bin/nb-speak.mjs parse
```

## Same Model, Different Delivery: 4 Live DSH Duels

All four runs below were executed live on identical isolated DeepSeek Harness instances running **`cmd/deepseek-v4.1-flash`** (`:19081` Vanilla vs. `:19082` `@nb-corp/nb-speak-dsh` Native Mode with optional voice notes enabled, zero mocks):

| Live Scenario | Vanilla DSH (`:19081` · Raw `assistant.content`) | With `nb-speak` (`:19082` · `send_bubble` + `send_artifact`) |
| --- | --- | --- |
| **1. Casual Friday Off-Work Chat**<br>*"Brain is fried in front of the convenience store fridge—what do I grab?"* | **4-item bolded nutrition matrix** (`Oden + Onigiri`, `Bento`, `Sandwich`, `Cup Noodles`) + physiology lecture about taste buds + butler sign-off. | **3 relaxed friend beats** (`Skip choosing—pick up oden plus a warm onigiri` / `Savory soup and rice cure Friday brain fog fast` / `Snap a photo of the rack if oden sold out`) + **optional 4.5s warm voice note** (*"Go straight for the hot counter. Weekend officially starts once that first bite lands."*). **Zero code cards.** |
| **2. 4.2M-Row SQL Triage**<br>*"`orders` pagination spiked to 4.2s on daytime primary, zero table locks allowed"* | Multi-section `###` headings + numbered checklists + inline SQL fences overflowing chat width. | **3 crisp SRE beats** (`Hold off scaling hardware...` / `Build the index CONCURRENTLY right now...` / `Swap deep pages to keyset cursors...`) + **optional 8s calm voice aside** + collapsible, one-click copyable **`orders-pagination-fix.sql`** card. |
| **3. Multi-File Kanban Bugfix**<br>*"Fix dual-running timer leak + live `MM:SS` + pine-green dot + filter pills"* | **13/13 tests pass**, followed by a multi-screen file-by-file changelog essay after editing 9 files. | **17/17 tests pass (zero engineering loss)**, delivered in **4 crisp beats** + optional warm voice note confirming active stopwatch continuity + **`board.css`** card. |
| **4. Persona Under Concurrency Load**<br>*Tsundere girlfriend `AGENTS.md`: Turn 1 caught in rain -> Turn 2 deadlocked Python TTL LRU* | Stays in character on Turn 1, then **collapses completely on Turn 2** into a 10-paragraph mutex postmortem lecture. | **100% character & engineering fidelity across all turns**: playful short beats (`Lending out umbrellas while deadlocking Python dicts`) + optional dry voice note + stress-tested **`ttl_lru.py`** card. |

<details>
<summary><strong>View Full Side-by-Side DSH Captures (Kanban 17/17 Challenge &amp; Persona Concurrency Test)</strong></summary>

<br>

<p align="center">
  <img src="docs/assets/dsh-compare-kanban.png" alt="Multi-File Kanban & Live SLA Timer Challenge: Vanilla DSH vs nb-speak DSH + Rendered Browser Output" width="1100">
</p>

<p align="center">
  <img src="docs/assets/dsh-compare-persona.png" alt="Persona Fidelity Under Concurrency Load: Tsundere Girlfriend + Deadlock-Free Python TTL LRU" width="1100">
</p>

</details>

## Architecture & Wire Protocol

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/workflow-dark.svg">
  <img src="docs/assets/workflow-light.svg" alt="Any LLM or Harness → nb-speak Core & Bridge → bubble_lint Gate → Human IM Delivery" width="1200">
</picture>
</p>

### Wire Protocol & SSE Contract

`@nb-corp/nb-speak` (`packages/core`) replaces raw Markdown prose dumps with two orthogonal output tools across OpenAI, DeepSeek, Anthropic Claude, Google Gemini, and local Gemma models.

#### 1. `send_message` & `send_artifact` JSON Wire Payloads

**`send_message` (`1–4` paced thumb-typed bubbles + optional final-bubble complementary voice note + quote anchor)**:

```json
{
  "bubbles": [
    "Error rate held at 0.02%, p99 dropped to 38ms",
    "Connection pool looks steady too, good to push 100%"
  ],
  "voice_note": {
    "text": "Dashboard stayed dead quiet for twenty-five minutes straight. Flip it whenever you are ready.",
    "emotion": "calm"
  },
  "reply_to": "msg_94810",
  "end_turn": true
}
```

**`send_artifact` (offloads multi-line code, SQL, unified diffs, or Markdown pipe tables outside narrow chat bubbles)**:

```json
{
  "title": "idx_orders_tenant_created.sql",
  "kind": "code",
  "language": "sql",
  "content": "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_tenant_created\n  ON orders (tenant_id, created_at DESC)\n  WHERE deleted_at IS NULL;"
}
```

- **Natural Typing Cadence (`computeBubbleSchedule`)**: Computes `{ index, text, delayMs, typingDurationMs, cumulativeMs }` per bubble (`240ms` initial reaction delay + `190ms + 42ms × CJK_chars + 56ms × EN_words + 75ms × clause_pauses`, clamped to `[360ms, 2100ms]`).
- **Plain-Reply Fallback (`normalizeTurnOutput`)**: When an unprompted or plain-reply model emits raw `assistant.content`, `nb-speak` automatically extracts fenced code blocks and Markdown pipe tables into typed `artifacts`, splits remaining text into `\n\n` micro-beats (preserving coupled 2-line copy-paste pairs), strips `Bubble 1:` labels and short-beat trailing periods, and offloads `>4`-bubble essays to a `markdown` artifact.

#### 2. Streaming SSE Event Contract & Standard OpenAI `delta.content` Compatibility

`POST /v1/chat/completions` on `nb-speak serve` supports both **structured IM event streams** and **unmodified OpenAI client streams**:

- **Structured Event Mode** (send header `x-nb-speak-events: structured` or body `"speak_stream": true`): suppresses raw partial JSON chunks and streams typed `nb.*` SSE frames in delivery order:

```text
event: nb.artifact
data: {"type":"nb.artifact","index":0,"artifact":{"title":"auth-canary-25m.sql","kind":"code","language":"sql","content":"SELECT ..."}}

event: nb.bubble
data: {"type":"nb.bubble","index":0,"text":"Error rate held at 0.02%, p99 dropped to 38ms","delayMs":240,"typingDurationMs":748,"cumulativeMs":240}

event: nb.bubble
data: {"type":"nb.bubble","index":1,"text":"Connection pool looks steady too, good to push 100%","delayMs":769,"typingDurationMs":769,"cumulativeMs":1009}

event: nb.voice_note
data: {"type":"nb.voice_note","voice_note":{"text":"Dashboard stayed dead quiet for twenty-five minutes straight. Flip it whenever you are ready.","emotion":"calm"}}

event: nb.lint
data: {"type":"nb.lint","lint":{"ok":true,"issueCount":0,"errorCount":0,"warningCount":0,"stats":{"bubbleCount":2,"totalCjkChars":0,"totalEnWords":19,"hasVoiceNote":true,"ttsOverlap":0.21},"issues":[]}}

event: nb.done
data: {"type":"nb.done","turn":{"source":"tool_calls","bubbles":["..."],"artifacts":[...],"end_turn":true,"schedule":[...],"lint":{...}}}

data: [DONE]
```

- **Standard OpenAI Compatibility Mode** (default when `x-nb-speak-events` is omitted): streams upstream `data: {"choices":[{"delta":{"content":...}}]}` chunks unmodified to existing OpenAI SDKs, `OpenWebUI`, or `LobeChat`, then emits the finalized `nb.*` frames before `data: [DONE]`. Non-streaming requests (`stream: false`) return the standard OpenAI `choices[0].message` response augmented with a top-level `nb_speak` normalized turn object.

## DeepSeek Harness Plugin (`@nb-corp/nb-speak-dsh`)

[`packages/dsh-plugin`](packages/dsh-plugin) (also standalone at **[`NB-Corp/nb-speak-dsh`](https://github.com/NB-Corp/nb-speak-dsh)** · **[`nb-corp.github.io/nb-speak-dsh`](https://nb-corp.github.io/nb-speak-dsh/)**) ships a full-stack Cordis host plugin and WebUI client extension (`exports["./client"]`) for DeepSeek Harness (`DSH`). Read the dedicated [**`@nb-corp/nb-speak-dsh` Guide →**](https://github.com/NB-Corp/nb-speak-dsh).

### 1. Three Runtime Modes: `native` (Default) · `skill` · `voice-model`

| Capability | `native` (Default — Direct DSH Tools + WebUI) | `skill` (OpenAI Bridge Mode A) | `voice-model` (4B Sidecar Mode B) |
| --- | --- | --- | --- |
| **Target Models** | Any configured DSH provider directly (`deepseek`, `cmd/deepseek-v4.1-flash`, OpenAI, Anthropic, Gemini) | External or proxy-routed OpenAI-compatible endpoints | Split-Phase models or `<0.8s` 4B voice-translator sidecars (`http://127.0.0.1:18088/v1`) |
| **Delivery Surface** | First-class `send_bubble` (`exec.concludeTurn()`) + `send_artifact` DSH tools; `dist/client.js` renders tactile IM bubbles, playable 22-bar `<audio>` / Web Speech voice-note pills, and copyable code/SQL/diff/table cards outside the collapsed step summary | Injects `send_message` + `send_artifact` at the HTTP proxy layer and unwraps bubbles into paragraphs | Encodes 5-axis weights into `nb-speak-voice-v1\|w0,w1,w2,w3,w4` and formats spoken newlines via `BubbleStreamFormatter` |
| **Best For** | Zero proxy hops, instant WebUI bubbles & artifact cards (with optional voice playback), 100% native DSH trajectory & token telemetry | Non-WebUI OpenAI-compatible clients sharing a DSH host | Sub-second companion gateways or multi-LoRA continuous voice mixing |

### 2. Optional Provider-Agnostic Voice Notes (Off by Default)

By default, **`enableVoiceNotes` is `false`** across both `@nb-corp/nb-speak` (`nb-speak serve`, pass `--voice-notes` or `NB_SPEAK_VOICE_NOTES=true` to enable) and `@nb-corp/nb-speak-dsh`—users get pure text bubbles and `send_artifact` cards with zero voice prompting or TTS calls. When explicitly opted in, `src/tts.ts` supports any speech backend without polluting LLM context tokens:

| TTS Provider Option | How to Enable | LLM Token Impact |
| --- | --- | --- |
| **OpenAI-compatible `/v1/audio/speech`** *(OpenAI, Qwen TTS, Fish, Kokoro, vLLM)* | `NB_SPEAK_VOICE_NOTES=true` + `NB_SPEAK_TTS_BASE_URL` (plus optional `NB_SPEAK_TTS_API_KEY`, `NB_SPEAK_TTS_MODEL`, `NB_SPEAK_TTS_VOICE`) | **`0` extra tokens** |
| **Local JSON Bridge Script** | `NB_SPEAK_VOICE_NOTES=true` + `NB_SPEAK_TTS_BRIDGE` | **`0` extra tokens** |
| **Cloud TTS / Web Speech Fallback** | `NB_SPEAK_VOICE_NOTES=true` with optional cloud TTS provider (`NB_SPEAK_TTS_PROVIDER=elevenlabs` + `ELEVENLABS_API_KEY`, etc.), or zero-key browser **Web Speech API** fallback when unset | **`0` extra tokens** |

All audio synthesis strips `audioSrc` DataURIs from LLM `render()` output to save context tokens while streaming audio to `VoiceNotePill` `<audio>` via `presentationMeta`.

### 3. Zero-Collision Subagent Orchestration & 5-Axis Style Budget

- **Subagent Safety**: Native mode registers `send_bubble` + `send_artifact` so DSH's `@deepseek-ai/dsh-tool-subagent-control` `send_message({ agent_id, message })` stays 100% untouched; bridge modes bidirectionally remap `send_message <-> agent_send_message`.
- **5-Axis Continuous Style Budget**: Switch built-in presets (`neutral_peer`, `sharp_lead`, `warm_companion`, `calm_sre`), supply `customSoul`, or blend `clarity` (`w0`), `warmth` (`w1`), `sharp_wit` (`w2`), `calm_grounding` (`w3`), and `concise_cadence` (`w4`) with automatic `w1 + w2 + w3 + w4 <= 1.15` L1 filter clamping.

## Deterministic `bubble_lint` Specification

TypeScript `lintTurn()` (`packages/core/src/lint.ts`) and zero-dependency Python `skills/chat-human/scripts/bubble_lint.py` implement an identical 8-rule static analyzer, achieving **`97.2%–100%` zero-slop pass rates** across DeepSeek and GPT evaluations:

| # | Rule Family | Issue Codes | Severity | Exact Thresholds & Conditions |
| --- | --- | --- | --- | --- |
| 1 | **Bubble Count & Empty Guard** | `bubble.empty`<br>`bubble.too_many` | `error` | Fails when no non-empty bubble or voice note exists, or when bubble count exceeds **`4`** on `bubbles[]` (**`3`** default on legacy `messages[]`; configurable via `--max-bubbles`). |
| 2 | **Mobile Length Budget** | `bubble.over_cjk_budget`<br>`bubble.over_en_budget` | `warning` | Warns when cumulative turn text exceeds **`55` CJK chars** (`--max-cjk-chars`) or **`45` English words** (`--max-en-words`). |
| 3 | **Markdown & List Wall Ban** | `bubble.markdown_structure` | `error` | Fails if any bubble contains `#` headings, `\|---\|` pipe tables, ```` ``` ```` code fences, `- **Bold**` bullets, or `1. / 2.` numbered walls. |
| 4 | **Short-Beat & Code Trailing Periods** | `style.trailing_period` | `warning` | Warns when a single-clause short beat (`<= 22` CJK chars with `<= 6` EN words, or `<= 12` EN words) ends with `.` / `。`, a `>=4`-char code/ID is followed by a period (`663920.`), or 100% of `>=2` bubbles end with formal periods. |
| 5 | **Stage Brackets, Clichés & Particles** | `style.stage_brackets`<br>`style.steward_cliche`<br>`style.particle_spam` | `error` / `warning` | Fails on RPG stage brackets (`*sighs*`, `（叹气）`); warns on subordinate concierge clichés (`for your review`, `hope this helps`, `向你汇报`, `顺手替你`) or `>50%` `啦`-ending bubbles. |
| 6 | **Emoji Policy & Leak Hygiene** | `style.unicode_emoji`<br>`plain.meta_leak`<br>`style.placeholder_leak`<br>`style.system_error_leak` | `error` / `warning` | Warns on Unicode emoji when `--persona-emoji deny` (default); fails on leaked `{"bubbles":...}` / `Bubble 1:` labels, unrendered `{{user}}` placeholders, or backend TTS diagnostic leaks. |
| 7 | **Final-Bubble Voice Placement** | `tts.batch_root_duplication`<br>`tts.multiple_clips`<br>`tts.not_on_final_bubble` | `error` / `warning` | Fails on `>1` voice notes per turn or root-level `tts`/`voice_mode` on multi-bubble `messages[]`; warns if a voice note is attached to a non-final bubble. |
| 8 | **Voice Complementarity & Tokens** | `tts.verbatim_overlap`<br>`tts.raw_path_or_url`<br>`tts.unnormalized_numbers` | `error` / `warning` | Fails if directional character-bigram overlap with text bubbles exceeds **`50%`** (`--max-tts-overlap 0.50`) or if voice text contains raw URLs/paths; warns on unnormalized decimals or clock colons (`19.9`, `14:30`). |

## Integration Recipes

### Recipe 1: Paced Multi-Bubble + Voice Dispatch Over `@nb-corp/nb-im`

Wire `normalizeTurnOutput()` directly into an [`@nb-corp/nb-im`](https://github.com/NB-Corp/nb-im) session (`telegram`, `feishu`, `slack`, `discord`, `matrix`, `wechat`) so humans receive naturally paced beats instead of instant walls:

```ts
import { setTimeout as sleep } from 'node:timers/promises';
import { normalizeTurnOutput } from '@nb-corp/nb-speak';

export async function deliverSpeakTurn(session, target, rawCompletion, synthesizeTts, abortSignal) {
  const turn = normalizeTurnOutput(rawCompletion, { cleanHygiene: true });

  for (const art of turn.artifacts) {
    await session.send(
      {
        type: 'file',
        target,
        filename: art.title,
        bytes: new TextEncoder().encode(art.content),
        mime_type: 'text/plain; charset=utf-8',
      },
      abortSignal,
    );
  }

  for (const beat of turn.schedule) {
    await sleep(beat.delayMs, undefined, { signal: abortSignal });
    await session.send({ type: 'text', target, text: beat.text }, abortSignal);
  }

  if (turn.voice_note && synthesizeTts) {
    try {
      const audioBytes = await synthesizeTts(turn.voice_note.text, turn.voice_note.emotion);
      await session.send(
        { type: 'voice', target, bytes: audioBytes, mime_type: 'audio/ogg; codecs=opus' },
        abortSignal,
      );
    } catch {
      // Layer 1 rule: never leak TTS backend/provider errors into user chat text
    }
  }
}
```

### Recipe 2: Cloud Reasoning Brain + Local 4B Voice Translator Sidecar (`--voice-sidecar-url`)

```bash
# Terminal 1: Start local 4B voice-translator sidecar on port 18088
llama-server -m ./models/voice-translator-4b-q4_k_m.gguf --port 18088

# Terminal 2: Start nb-speak bridge chaining upstream reasoning -> local voice sidecar
NB_SPEAK_API_KEY="sk-..." node packages/core/bin/nb-speak.mjs serve \
  --port 18090 \
  --upstream-url https://api.deepseek.com/v1 \
  --model deepseek-reasoner \
  --voice-sidecar-url http://127.0.0.1:18088/v1
```

## Pluggable Personas: One Mechanics Layer, Any Voice

Layer 1 enforces universal mobile delivery physics; Layer 2 resolves tone in strict priority order:

1. **Explicit current-turn user instruction** (*"draft a formal reply to Director Li with a handshake emoji"*)
2. **Active Persona / `SOUL.md` / System Prompt** (`neutral_peer`, `sharp_lead`, `warm_companion`, `calm_sre`, or custom `SOUL.md`)
3. **Channel context** (1-on-1 DM vs. shared team channel)
4. **Neutral Engineer Peer default** (direct, equal-footing teammate—zero uninvited roleplay, zero Unicode emoji spam, zero corporate servility)

## Monorepo Layout & Verification

```text
nb-speak/
├── packages/
│   ├── core/                # @nb-corp/nb-speak: protocol, parser, TS bubble_lint, HTTP/SSE bridge & CLI
│   └── dsh-plugin/          # @nb-corp/nb-speak-dsh: native DSH tools, WebUI bubbles & installer
├── skills/
│   └── chat-human/          # Universal chat-human Agent Skill (v0.2.0) + bubble_lint.py + proactive_gate.py
├── apps/
│   └── web/                 # Tactile warm paper-ink IM stage source (exports to docs/)
├── docs/                    # GitHub Pages live playground (EN + zh-CN), optional audio demos & DSH captures
├── llms.txt                 # Concise LLM/GEO index (llmstxt.org)
└── llms-full.txt            # Complete protocol schemas, metrics, comparison matrix & Q&A
```

Run the complete build and verification suite locally (Node.js + Python stdlib, zero external packages):

```bash
npm test
```

## License

[MIT](LICENSE) © 2026 NB-Corp — applies to all source code, protocol schemas, CLI tools, DSH plugin, `chat-human` Agent Skill, and documentation.

**Demo Audio Assets & AI Disclosure:** Static `.mp3` voice-note clips in [`apps/web/src/assets/audio/`](apps/web/src/assets/audio/NOTICE.txt) (`docs/assets/audio/`) are AI-synthesized speech included solely to demonstrate optional `nb-speak` voice-note playback with zero real-person voice cloning; see [AI Demo Audio Notice](apps/web/src/assets/audio/NOTICE.txt) for upstream speech-model attribution and terms.
