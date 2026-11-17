# `@nb-corp/nb-speak-openclaw` — Native OpenClaw IM Bubble & Table Gate Plugin

Stops OpenClaw from dumping raw Markdown pipe tables (`openclaw#36323`), glued multi-line code blocks, and 250-word corporate essay walls into Telegram, WhatsApp, Discord, Signal, Slack, and Feishu/Lark.

- **Zero external runtime dependencies** (built directly on `@nb-corp/nb-speak` core, Node.js `>= 22.19`).
- **Voice notes disabled by default (`enableVoiceNotes: false`)**: pure text short bubbles + clean code/table cards out of the box; optional generic OpenAI-compatible `/v1/audio/speech` support only when explicitly enabled.

## What It Fixes (`openclaw#36323` & Mobile IM Regressions)

| Failure Mode in Vanilla OpenClaw | What `@nb-corp/nb-speak-openclaw` Does |
| --- | --- |
| **Raw `\|---\|` pipe tables wrapping horribly on mobile** (even after 15+ workspace SOP edits & session compactions) | Deterministic `reply_payload_sending` + `message_sending` gate converts narrow-screen (`WhatsApp` / `Signal` / `WeChat`) or `>40`-col tables into **compact `- Row — Key: val` cards**, and keeps compact `<=40`-col tables on `Telegram` / `Discord` inside aligned monospace code blocks. |
| **250-word single-message Markdown essays** (`###` headers, `1. 2. 3.` walls, `Hope this helps!`) | Injects `chat-human` Layer 1 (`before_prompt_build` + bundled `skills/chat-human/SKILL.md`), strips `*sighs*` stage brackets & concierge tails, and splits replies into `1–4` thumb-typed beats. |
| **Paced multi-bubble channel delivery** | Registers optional `send_bubble` + `send_artifact` OpenClaw tools that dispatch paced beats directly via `toolContext.delivery?.send()` using `computeBubbleSchedule()`. |

## Quick Install

### Option A: Zero-Clone Reversible Installer (`~/.openclaw`)

```bash
# 1. Preview planned openclaw.json + extension directory changes (0 writes)
npx --yes github:NB-Corp/nb-speak openclaw --dry-run

# 2. Persist plugin + bundled chat-human skill into ~/.openclaw
npx --yes github:NB-Corp/nb-speak openclaw --apply --preset neutral_peer

# 3. Byte-for-byte reversible uninstall (never reads or touches credentials)
npx --yes github:NB-Corp/nb-speak openclaw --uninstall
```

### Option B: OpenClaw Native Plugin CLI (From Local Checkout)

```bash
openclaw plugins install --link ./packages/openclaw-plugin --force
openclaw plugins enable nb-speak-openclaw
```

## Configuration (`openclaw.json`)

```json
{
  "plugins": {
    "entries": {
      "nb-speak-openclaw": {
        "enabled": true,
        "hooks": {
          "allowConversationAccess": true
        },
        "config": {
          "persona": "neutral_peer",
          "tableMode": "auto",
          "maxMonospaceWidth": 40,
          "maxBubbles": 4,
          "enableVoiceNotes": false
        }
      }
    }
  },
  "tools": {
    "allow": ["nb-speak-openclaw"]
  }
}
```
