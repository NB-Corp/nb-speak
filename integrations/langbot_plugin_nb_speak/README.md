# langbot_plugin_nb_speak

Native **LangBot v4+** (`space.langbot.app`) plugin powered by **NB Speak** (`nb-speak/1` + `chat-human`).

Stops WeChat (`Gewechat` / Official Account / WeCom), QQ (`NapCat` / `Lagrange` / Official), Feishu, DingTalk, Telegram, and Discord bots from dumping 250-word Markdown essays, shattered code blocks, and broken raw `|---|---|` pipe tables.

## Key Capabilities

- **Token-shielded code & URL protection**: Extracts fenced ```` ``` ```` code blocks before sentence splitting and protects decimals (`0.02%`), version tags (`v4.29.1`), and query URLs (`?page=1.2`) so code and links never shatter across bubbles.
- **Platform-aware Markdown table gate**: Converts raw `|---|---|` pipe tables into thumb-readable key-value cards (`- 订单库：18ms`) on WeChat, QQ, Feishu, and DingTalk, or `<=40`-col aligned monospace blocks on Telegram and Discord.
- **Rich `MessageChain` preservation & lossless fallback**: Preserves `Quote` / `At` headers strictly on Bubble 1, keeps `Image` / `File` attachments intact in order, and recovers unsent tail segments automatically via `reply_message_chain` if a mid-turn `EventContext.reply()` call hits rate limits.
- **Pure text by default (`enable_voice_notes: false`)**: Zero cloud TTS dependency out of the box. When optional OpenAI-compatible `/v1/audio/speech` synthesis is enabled, a hard `<= 8s` timeout cap guarantees instant pure-text fallback on network errors or timeouts.

## Install in LangBot

### Option 1: LangBot WebUI / Marketplace (Recommended)

1. Open **LangBot WebUI -> Plugins -> Install Plugin**.
2. Search **`langbot_plugin_nb_speak`** in LangBot Space, or install from GitHub repository URL:
   ```text
   https://github.com/NB-Corp/langbot_plugin_nb_speak
   ```

### Option 2: Build & Import `.lbpkg` Locally

```bash
uvx --from langbot-plugin lbp build
# Upload the generated NB-Corp-langbot_plugin_nb_speak-0.2.0.lbpkg in LangBot WebUI
```

## Configuration (`manifest.yaml`)

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `inject_system_prompt` | `bool` | `true` | Appends static `chat-human` mobile IM rules during `PromptPreProcessing` (multimodal & prefix-cache safe). |
| `persona_preset` | `select` | `keep_host` | `keep_host` (preserves your LangBot persona) · `neutral_peer` · `sharp_lead` · `warm_companion` · `calm_sre`. |
| `platform_mode` | `select` | `auto` | `auto` (WeChat/QQ/Feishu -> KV cards; TG/Discord narrow tables -> monospace) · `im_compact` · `markdown_code`. |
| `max_bubbles` | `int` | `4` | Maximum conversational text bubbles per turn (overflow merges cleanly without dropping text). |
| `target_bubble_cjk_chars` | `int` | `36` | Preferred CJK character budget per short bubble before splitting at sentence boundaries. |
| `paced_delivery` | `bool` | `true` | Deliver multi-bubble turns sequentially with natural thumb-typing delays (`0.36s–2.1s`). |
| `enable_voice_notes` | `bool` | `false` | **Disabled by default.** Enables optional `<voice_note>` synthesis via `/v1/audio/speech` only when set to `true`. |
| `tts_api_base` | `string` | `""` | Optional OpenAI-compatible `/v1/audio/speech` base URL when `enable_voice_notes=true`. |
| `tts_api_key` | `string` | `""` | Optional Bearer API key for the TTS endpoint. |
| `tts_model` | `string` | `"tts-1"` | Optional TTS model identifier. |
| `tts_voice` | `string` | `"alloy"` | Optional TTS voice identifier. |
| `tts_timeout_sec` | `int` | `4` | Hard timeout capped at `<= 8` seconds; any timeout, `4xx/5xx`, or offline error falls back silently to pure text. |

## Before and After (WeChat / QQ Group Chat)

- **Raw LLM response:**
  `（叹气）排查完数据库索引了。\n\n| 服务 | 延迟 |\n|---|---|\n| 订单库 | 18ms |\n\n```sql\nSELECT id FROM orders WHERE status = 'paid';\n```\n\n希望这对你有帮助！`
- **Delivered by `langbot_plugin_nb_speak`:**
  - **Bubble 1** (with `Quote` / `@At` if present): `排查完数据库索引了`
  - **Bubble 2** (mobile KV card): `- 订单库：18ms`
  - **Bubble 3** (intact fenced SQL block):
    ````text
    ```sql
    SELECT id FROM orders WHERE status = 'paid';
    ```
    ````

## Run Verification Suite

```bash
python -B -m unittest discover -s integrations/langbot_plugin_nb_speak/tests -v
```

## License

MIT · Upstream monorepo: [https://github.com/NB-Corp/nb-speak](https://github.com/NB-Corp/nb-speak)
