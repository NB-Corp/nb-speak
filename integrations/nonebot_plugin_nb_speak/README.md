# nonebot-plugin-nb-speak

Adapter-agnostic **NoneBot2** (`>=2.2.0`) plugin powered by **NB Speak** (`nb-speak/1` + `chat-human`).

Works across **OneBot V11 / V12 (QQ / NapCat / Lagrange)**, **Telegram**, **Feishu**, **QQ Official**, **Discord**, and **Satori** (`supported_adapters = None`).

- Converts raw Markdown pipe tables (`|---|---|`) into clean mobile key-value cards on QQ/WeChat/Feishu or `<=40`-col aligned monospace blocks on Telegram/Discord.
- Protects fenced ` ``` ` code blocks from mid-block splitting and paces multi-bubble turns via `Bot.on_calling_api`.
- Voice notes are strictly **off by default** (`nb_speak_enable_voice_notes = False`).

## Install

```bash
nb plugin install nonebot-plugin-nb-speak
# or
pip install nonebot-plugin-nb-speak
```

## License

MIT
