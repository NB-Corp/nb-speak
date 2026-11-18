# koishi-plugin-nb-speak

Koishi v4 (`^4.18.0`) outbound IM bubble & Markdown pipe-table gate powered by **NB Speak** (`nb-speak/1` + `chat-human`).

Stops chatbots from dumping 250-word Markdown essays, raw `|---|---|` pipe tables, and shattered code blocks across **OneBot / NapCat / Lagrange / LLOneBot (QQ)**, **QQ Official**, **WeChat**, **Telegram**, **Discord**, **Feishu / Lark**, and **Satori** adapters—with zero runtime npm dependencies beyond Koishi itself.

## What It Solves

- **Platform-aware Markdown table gate**: Converts raw `|---|---|` pipe tables into clean `- 条目 — 字段: 值` mobile key-value cards on OneBot/QQ, WeChat, Feishu, DingTalk, and Line, or `<=40`-col aligned monospace code blocks on Telegram and Discord.
- **Satori rich-element safety (`<quote>`, `<at>`, `<img>`, `<audio>`, `<figure>`)**: Keeps `<quote>` and leading `<at>` strictly on the first bubble without repeating quotes on every follow-up beat, preserves `<img>`/`<audio>`/`<file>` attachments in exact sequential order, pairs single-image captions naturally, and leaves merged `<figure>`/`<message>` forwards untouched.
- **Code & C++/SQL tag protection**: Updates Satori text elements directly instead of re-parsing raw strings as XML, so `if (latency < 40 && ok)` inside fenced code blocks never breaks Satori tag parsing.
- **Lossless mid-turn error recovery**: Paces multi-bubble turns sequentially (`0.36s–2.1s`) inside `before-send`; if an adapter throws mid-turn, remaining unsent bubbles stay in `session.elements` so tail text is never dropped.
- **Pure text by default**: `enableVoiceNotes` defaults to `false`.

## Install in Koishi

### Option 1: Koishi Plugin Market (WebUI)

1. Open **Koishi Console -> Plugin Market** (`market.koishi.chat`).
2. Search **`nb-speak`** (`koishi-plugin-nb-speak`), click **Install**, then enable it in **Plugin Configuration**.

### Option 2: CLI (`npm` / `yarn` / `pnpm`)

```bash
# Inside your Koishi boilerplate project
npm install koishi-plugin-nb-speak
```

Or declare in `koishi.yml`:

```yaml
plugins:
  nb-speak:
    tableMode: auto
    maxBubbles: 4
    pacedDelivery: true
    enableVoiceNotes: false
```

## Platform Rendering Matrix (`tableMode: "auto"`)

| Adapter / Platform (`session.platform`) | Pipe Table Output | Multi-Bubble & Rich Element Behavior |
| --- | --- | --- |
| `onebot` (NapCat / Lagrange / Go-CQHTTP), `qq`, `satori` | Mobile KV card (`- 网关 — 延迟: 18ms · 状态: 正常`) | `<quote>` + `<at>` on Bubble 1 only; `<img>` preserved in order |
| `wechat`, `weixin`, `feishu`, `lark`, `dingtalk`, `line` | Mobile KV card | Clean short beats without `###` headings or `**` cages |
| `telegram`, `discord`, `slack` | `<=40`-col aligned ` ```text ` block (wide `>40`-col tables auto-degrade to KV cards) | Single `<img>` + short caption stays paired in one message |

## Configuration Reference

All fields render with Chinese labels in Koishi Console (`ctx.i18n` + `Schema.object`):

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | Enable outbound `before-send` bubble splitting and pipe-table conversion. |
| `persona` | `string` | `"neutral_peer"` | Tone baseline returned by `ctx.nbSpeak.getSystemPrompt()` (`neutral_peer` · `sharp_lead` · `warm_companion` · `calm_sre` · `custom`). |
| `customSoul` | `string` | `""` | Custom tone instructions when `persona` is `"custom"`. |
| `tableMode` | `string` | `"auto"` | `auto` (platform-aware) · `kv` (always compact key-value cards) · `code` (`<= maxMonospaceWidth` monospace block). |
| `maxMonospaceWidth` | `number` | `40` | Maximum display width (`24–120`) before monospace tables degrade to KV cards. |
| `maxBubbles` | `number` | `4` | Maximum conversational bubbles per turn (`1–6`). |
| `pacedDelivery` | `boolean` | `true` | Pace multi-bubble turns sequentially with natural thumb-typing delays. |
| `cadenceSpeed` | `number` | `1` | Typing-delay speed multiplier (`0.25–50`; higher sends faster). |
| `platforms` | `string[]` | `[]` | Optional adapter allowlist (e.g. `["onebot", "telegram"]`; empty matches all adapters). |
| `enableVoiceNotes` | `boolean` | `false` | **Disabled by default.** Includes optional `voice_note` rules in `ctx.nbSpeak.getSystemPrompt()` only when `true`. |

## Programmatic Service API (`ctx.nbSpeak`)

Other Koishi LLM plugins (such as ChatLuna or custom middleware) can read the `chat-human` system prompt or run deterministic formatting directly:

```ts
import { Context } from 'koishi';

export function apply(ctx: Context) {
  ctx.middleware(async (session, next) => {
    if (!ctx.nbSpeak) return next();
    const systemLayer = ctx.nbSpeak.getSystemPrompt();
    const preview = ctx.nbSpeak.formatReply('| A | B |\n|---|---|\n| 1 | 2 |', session.platform);
    return preview.primaryText;
  });
}
```

## License

MIT
