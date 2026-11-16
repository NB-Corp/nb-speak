<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-dark.svg">
  <img src="docs/assets/banner-light.svg" alt="nb-speak — How AI agents actually speak to humans." width="1200">
</picture>

**Universal `send_message` + `send_artifact` IM bubble protocol, zero-dependency OpenAI/SSE bridge, DeepSeek Harness plugin, tactile paper-ink playground, and `chat-human` Agent Skill.**

[![CI](https://img.shields.io/github/actions/workflow/status/NB-Corp/nb-speak/ci.yml?branch=main&style=flat-square&color=2d4b35)](https://github.com/NB-Corp/nb-speak/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-22.19%2B-2d4b35?style=flat-square)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.10%2B-2d4b35?style=flat-square)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-2d4b35?style=flat-square)](LICENSE)
[![Playground](https://img.shields.io/badge/playground-live-2d4b35?style=flat-square)](https://nb-corp.github.io/nb-speak/)

[Live Playground](https://nb-corp.github.io/nb-speak/) · [Quick start](#quick-start) · [Protocol](#protocol--tools) · [DSH Plugin](#deepseek-harness-plugin) · [llms.txt](llms.txt) · [nb-im (transport)](https://github.com/NB-Corp/nb-im)

**English** · [简体中文](README.zh-CN.md)

</div>

Every AI chat client and agent harness today dumps 250-word Markdown essays as a single `assistant.content` blob—cramming SQL queries and pipe tables inside narrow phone bubbles, repeating the concierge *"Got it! + Here is everything I did! + Go get some rest!"* triad, and reading text bubbles word-for-word in TTS voice notes.

Within the **NB-Corp** ecosystem ([nb-search](https://github.com/NB-Corp/nb-search) discovers, [nb-extract](https://github.com/NB-Corp/nb-extract) reads, [nb-hub](https://github.com/NB-Corp/nb-hub) signals, [nb-im](https://github.com/NB-Corp/nb-im) routes), **`nb-speak`** is **how AI agents actually speak to humans**:

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/workflow-dark.svg">
  <img src="docs/assets/workflow-light.svg" alt="Any LLM or Harness → nb-speak Core & Bridge → bubble_lint Gate → Human IM Delivery" width="1200">
</picture>
</p>

## Before vs. After

| Scenario | Raw `assistant.content` Blob | With `nb-speak` (`send_message` + `send_artifact`) |
| --- | --- | --- |
| **SRE canary check** | **165-word essay**: *"You can proceed to 100%, however 25m only covers one slice: 1. Watch DB lock queues... 2. Step to 50% first... \| Metric \| Canary \|... Let me know if you need anything else!"* | **Bubble 1** (`240ms`): `Error rate held at 0.02%, p99 dropped to 38ms` <br>**Bubble 2** (`1.1s`): `Connection pool looks steady too, good to push 100%` <br>**Artifact card**: `auth-canary-25m.md` <br>**Voice note** (`6s`, final bubble): *"Dashboard stayed quiet for twenty-five minutes straight. Flip it whenever you're ready."* |
| **SQL timeout review** | Inline `###` headers + bullet wall + 12-line SQL fence overflowing mobile width + *"Hope this helps!"* | **Bubble 1**: `Postgres is seq-scanning 4.2M rows because tenant_id + created_at lacks a partial index` <br>**Bubble 2**: `Dropped the concurrent migration SQL in the card so writes stay unblocked` <br>**Artifact card**: `idx_orders_tenant_created.sql` |
| **3rd `"final"` tweak** | `*sighs* Frequent requirement changes reduce velocity! I updated the CTA color for your kind review.` | **Bubble 1**: `Third "final" tweak is live on staging` <br>**Bubble 2**: `Forest green CTA is back, take a look and tell me this one sticks` |

<p align="center">
  <a href="https://nb-corp.github.io/nb-speak/">
    <img src="docs/assets/playground-preview.png" alt="nb-speak Interactive Split-Stage Playground: Raw LLM Blob vs. nb-speak Protocol" width="1100">
  </a>
</p>

## Quick start

> **Release status (`v0.2.0`):** Distributed directly from GitHub with prebuilt ESM artifacts (`dist/`) and **zero runtime npm/pip dependencies**. Requires **Node.js >= 22.19** (Node 24 recommended); `skills/chat-human` utilities use **Python >= 3.10** stdlib. Every command below runs as shown.

### 1. Install the `chat-human` Agent Skill (Codex, Claude Code, Kiki, Cursor)

```bash
npx skills add NB-Corp/nb-speak
```

Or copy [`skills/chat-human`](skills/chat-human) directly into `~/.agents/skills/chat-human` or `~/.claude/skills/chat-human`.

### 2. Lint, Parse, or Serve the OpenAI/SSE Bridge in 30 Seconds

Run directly via `npx github:NB-Corp/nb-speak` or from a local clone:

```bash
git clone https://github.com/NB-Corp/nb-speak.git
cd nb-speak

# 1. Print OpenAI / Anthropic / Gemini tool schemas
node packages/core/bin/nb-speak.mjs tools --provider openai

# 2. Deterministically lint an outbound turn (0 issues -> exit code 0)
echo '{"bubbles":["Error rate held at 0.02%, p99 down to 38ms","Pool looks steady, good to push 100%"]}' \
  | node packages/core/bin/nb-speak.mjs lint --json

# 3. Normalize a raw Markdown + SQL wall into paced bubbles & extracted artifacts
printf 'Bubble 1: Query fixed.\n\n```sql\n-- fix.sql\nSELECT 1;\n```\n\nReady to ship.\n' \
  | node packages/core/bin/nb-speak.mjs parse

# 4. Start the local OpenAI-compatible HTTP/SSE bridge on http://127.0.0.1:18090
NB_SPEAK_API_KEY="sk-..." node packages/core/bin/nb-speak.mjs serve \
  --port 18090 \
  --upstream-url https://api.deepseek.com/v1 \
  --model deepseek-chat \
  --persona calm_sre
```

## Protocol & Tools (`@nb-corp/nb-speak`)

Instead of hoping a system prompt stops Markdown essays, `@nb-corp/nb-speak` (`packages/core`) binds any OpenAI, DeepSeek, Anthropic Claude, Google Gemini, or local Gemma model to two orthogonal tools:

1. **`send_message({ bubbles, voice_note?, reply_to?, end_turn? })`**
   - `bubbles`: `1–4` thumb-typed IM beats (`4–28` CJK chars or `4–22` English words total by default; human mobile IM median is `10` CJK chars).
   - `computeBubbleSchedule(bubbles)` computes realistic inter-bubble typing delays (`240ms` initial reaction + `360ms–2100ms` per-bubble thumb cadence).
   - `voice_note`: Optional `{ text, emotion }` attached strictly to the **final bubble** (`<50%` character-bigram overlap with text bubbles; numbers spelled as spoken words; zero raw URLs).
2. **`send_artifact({ title, kind, language?, content })`**
   - Offloads `code`, `diff`, `table`, and longform `markdown` cleanly out of narrow chat bubbles.
3. **Plain-Reply Fallback & Sidecar Normalization (`normalizeTurnOutput`)**
   - When an unprompted or plain-reply model outputs raw `assistant.content`, `nb-speak` automatically extracts fenced code blocks and Markdown pipe tables into typed `artifacts`, splits remaining prose into `\n\n` micro-beats, cleans `Bubble 1:` meta leaks, and optionally routes through a Split-Phase / 4B voice-translator sidecar (`--voice-sidecar-url`).
4. **Deterministic `bubble_lint` (`lintTurn` in TS + `bubble_lint.py` in Python)**
   - Achieves **`97.2%–100%` zero-slop pass rate** across DeepSeek and GPT evaluations—catching Markdown headers/tables/lists inside bubbles, RPG stage brackets (`*sighs*`, `（叹气）`), concierge clichés (`for your review`, `向你汇报`), trailing periods on short beats or copyable codes, batch-root TTS duplication, and verbatim TTS readouts.

```ts
import {
  getOpenAISpeakTools,
  buildSpeakSystemPrompt,
  normalizeTurnOutput,
  lintTurn,
} from './packages/core/dist/index.js';

const tools = getOpenAISpeakTools();
const system = buildSpeakSystemPrompt({ persona: 'sharp_lead' });
const turn = normalizeTurnOutput(llmCompletion);
// -> { source, bubbles, artifacts, voice_note, schedule, lint }
```

## DeepSeek Harness Plugin (`@nb-corp/nb-speak-dsh`)

[`packages/dsh-plugin`](packages/dsh-plugin) generalizes IM bubble delivery for DeepSeek Harness (`DSH`) across **both** standard cloud LLMs and specialized voice models without colliding with DSH's internal subagent `send_message` tool:

- **Mode A (`skill` — Standard Cloud LLMs)**: Works with any DeepSeek, GPT, Claude, or Gemini model in DSH by injecting `chat-human` + user-facing `send_message` & `send_artifact`, rendering user bubbles cleanly while keeping subagent tools intact.
- **Mode B (`voice-model` — Split-Phase / 4B Voice Translator)**: Routes to a specialized voice-model or sidecar proxy with 5-axis continuous style weights (`clarity`, `warmth`, `sharp_wit`, `calm_grounding`, `concise_cadence` -> `nb-speak-voice-v1|1.000,0.750,0.200,0.150,0.050`).
- **Collision-Free Subagent Remap**: Transparently rewrites DSH's internal subagent `send_message` -> `agent_send_message` before calling upstream and restores `agent_send_message` -> `send_message` on return.
- **Reversible Zero-Dep Installer** (never touches `.credentials.yaml`):

```bash
# Preview profile changes without writing files
node packages/dsh-plugin/scripts/install-dsh.mjs --dry-run --profile web

# Install Mode A (skill) or Mode B (voice-model)
node packages/dsh-plugin/scripts/install-dsh.mjs --apply --profile web --runtime-mode skill --preset calm_sre

# Restore original profile files byte-for-byte
node packages/dsh-plugin/scripts/install-dsh.mjs --uninstall --profile web
```

## Pluggable Personas: One Mechanics Layer, Any Voice

`nb-speak` never locks your agent into a hardcoded roleplay personality. Layer 1 enforces human mobile delivery physics; Layer 2 adapts register in strict priority order:

1. **Explicit current-turn user instruction** (*"draft a formal reply to Director Li with a handshake emoji"*)
2. **Active Persona / `SOUL.md` / System Prompt** (`neutral_peer`, `sharp_lead`, `warm_companion`, `calm_sre`, or custom `SOUL.md`)
3. **Channel context** (1-on-1 DM vs. shared team channel)
4. **Neutral Engineer Peer default** (direct, equal-footing teammate—zero uninvited roleplay, zero Unicode emoji spam, zero corporate servility)

## Bring Your Own Workflow

`nb-speak` claims **only the outbound speech & linting boundary**. Pair it directly with [`@nb-corp/nb-im`](https://github.com/NB-Corp/nb-im) for Telegram, Feishu, Slack, Discord, Matrix, and WeChat delivery, point existing OpenAI clients (`OpenWebUI`, `LobeChat`, custom SDKs) at `nb-speak serve`, or install `skills/chat-human` standalone inside Codex, Claude Code, and Kiki.

## Monorepo Layout & Verification

```text
nb-speak/
├── packages/
│   ├── core/                # @nb-corp/nb-speak: protocol, parser, TS bubble_lint, HTTP/SSE bridge & CLI
│   └── dsh-plugin/          # @nb-corp/nb-speak-dsh: dual-mode DSH plugin, tool-remap & reversible installer
├── skills/
│   └── chat-human/          # Universal chat-human Agent Skill (v0.2.0) + bubble_lint.py + proactive_gate.py
├── apps/
│   └── web/                 # Tactile warm paper-ink IM web app source (exports to docs/)
├── docs/                    # GitHub Pages live playground (EN + zh-CN), SEO metadata & GEO specs
├── llms.txt                 # Concise LLM/GEO index (llmstxt.org)
└── llms-full.txt            # Complete protocol schemas, metrics, comparison matrix & Q&A
```

Run the complete build and test suite locally (Node.js + Python stdlib, zero external packages):

```bash
npm test
```

## License

[MIT](LICENSE) © 2026 NB-Corp
