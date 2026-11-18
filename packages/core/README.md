# @nb-corp/nb-speak

Zero-dependency TypeScript/ESM core for **NB Speak** (`nb-speak/1` + `chat-human`): structured `send_message` + `send_artifact` schemas across OpenAI, Anthropic, and Gemini, channel-aware Markdown pipe-table conversion, plain-reply fallback parsing, deterministic 8-rule `lintTurn` (`bubble_lint`), and a local OpenAI-compatible HTTP/SSE bridge.

- **Zero npm runtime dependencies** (`Node.js >= 22.19`, browser-safe pure modules for `protocol`, `format`, `parser`, and `lint`).
- **Pure text by default**: `enableVoiceNotes` defaults strictly to `false` across all schemas, prompts, CLI subcommands, and bridge endpoints.

## Install

```bash
npm install @nb-corp/nb-speak
```

## Quick Example

```ts
import {
  getOpenAISpeakTools,
  normalizeTurnOutput,
  transformOutboundText,
} from '@nb-corp/nb-speak';

// 1. Format a raw plain-text LLM reply + pipe table for mobile IM (idempotent)
const outbound = transformOutboundText(
  '*sighs* Rollout done.\n\n| Node | Latency |\n|---|---|\n| Gateway | 18ms |\n\nHope this helps!',
  { channel: 'whatsapp', maxBubbles: 4 },
);
// outbound.bubbles -> ['Rollout done']
// outbound.artifactCards -> ['- Gateway: 18ms']
// outbound.schedule -> [{ index: 0, text: 'Rollout done', delayMs: 240, ... }]

// 2. Inject structured send_message + send_artifact tool schemas (voice_note omitted by default)
const tools = getOpenAISpeakTools({ enableVoiceNotes: false });

// 3. Normalize either structured tool_calls or plain assistant.content into paced bubbles + cards
const turn = normalizeTurnOutput(completionResponse, { cleanHygiene: true });
```

## Subpath Exports

| Import Path | Key Exports |
| --- | --- |
| `@nb-corp/nb-speak` / `./protocol` | `getOpenAISpeakTools`, `getAnthropicSpeakTools`, `getGeminiSpeakTools`, `computeBubbleSchedule`, `buildSpeakSystemPrompt`, `PERSONA_PRESETS` |
| `@nb-corp/nb-speak/format` | `transformOutboundText`, `formatTableForChannel`, `formatArtifactForChannel`, `parseMarkdownPipeTable` |
| `@nb-corp/nb-speak/parser` | `normalizeTurnOutput`, `extractPlainReplyArtifactsAndBeats`, `SpeakStreamAccumulator`, `turnToEvents`, `translateDraftViaSidecar` |
| `@nb-corp/nb-speak/lint` | `lintTurn`, `computeVoiceOverlap`, `splitPlainBeats` |
| `@nb-corp/nb-speak/bridge` | `startSpeakBridge` |

## CLI (`nb-speak`)

```bash
# Print tool JSON schemas for openai | anthropic | gemini
npx @nb-corp/nb-speak tools --provider openai

# Run deterministic 8-rule bubble_lint on plain text or JSON
npx @nb-corp/nb-speak lint --json < payload.json

# Normalize raw LLM completion into bubbles, cards, typing schedule, and lint report
npx @nb-corp/nb-speak parse < raw-completion.txt

# Launch MCP stdio server (Claude Desktop, Claude Code, Cursor, Cherry Studio, Cline, Windsurf)
npx @nb-corp/nb-speak mcp

# Install reversible OpenClaw plugin into ~/.openclaw
npx @nb-corp/nb-speak openclaw --dry-run

# Start local OpenAI-compatible HTTP/SSE bridge (enableVoiceNotes = false default)
NB_SPEAK_API_KEY="sk-..." npx @nb-corp/nb-speak serve --port 18090 --upstream-url https://api.deepseek.com/v1
```

## Documentation & Live Playground

- Full specification & benchmarks: [github.com/NB-Corp/nb-speak](https://github.com/NB-Corp/nb-speak#readme)
- Interactive split-stage playground: [nb-corp.github.io/nb-speak](https://nb-corp.github.io/nb-speak/)

## License

[MIT](./LICENSE)
