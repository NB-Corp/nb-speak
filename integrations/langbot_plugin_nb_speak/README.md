# langbot_plugin_nb_speak

Native **LangBot v4+** (`space.langbot.app`) plugin powered by **NB Speak** (`nb-speak/1` + `chat-human`).

Stops WeChat (`Gewechat` / Official Account / WeCom), QQ (`NapCat` / `Lagrange` / Official), Feishu, DingTalk, Telegram, and Discord bots from dumping 250-word Markdown essays and broken raw pipe tables (`|---|---|`).

## Highlights

- **Token-Shielded Code Blocks**: Fenced ` ``` ` code blocks are extracted before sentence splitting so code is never sliced mid-block.
- **Mobile Pipe-Table Gate**: Automatically converts raw Markdown pipe tables into thumb-readable key-value cards (`- 节点：正常`) on WeChat/QQ/Feishu/DingTalk, or `<=40`-col aligned monospace blocks on Telegram/Discord.
- **Natural Thumb-Typed Pacing**: Injects `chat-human` mobile IM physics during `PromptPreProcessing` and paces multi-bubble turns via `EventContext.reply()`.
- **Pure Text by Default**: `enable_voice_notes` defaults strictly to `false` (zero cloud TTS requirement out of the box).

## Install in LangBot

1. **LangBot Plugin Marketplace / WebUI**: Install from GitHub URL `https://github.com/NB-Corp/langbot_plugin_nb_speak`
2. **CLI / Git**:
   ```bash
   git clone --depth 1 https://github.com/NB-Corp/langbot_plugin_nb_speak
   ```

## License

MIT · Upstream monorepo: [https://github.com/NB-Corp/nb-speak](https://github.com/NB-Corp/nb-speak)
