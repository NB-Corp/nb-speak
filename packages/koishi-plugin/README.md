# koishi-plugin-nb-speak

Koishi v4 (`^4.18.0`) outbound IM bubble & Markdown pipe-table gate powered by **NB Speak** (`nb-speak/1` + `chat-human`).

- Converts raw Markdown pipe tables (`|---|---|`) into clean mobile key-value cards on OneBot/QQ, WeChat, Feishu, and Line, or `<=40`-col aligned monospace blocks on Telegram and Discord.
- Splits 250-word LLM essay walls into paced short bubbles while keeping fenced code blocks intact.
- Voice notes are strictly **off by default** (`enableVoiceNotes: false`).

## Install in Koishi

Search **`nb-speak`** in Koishi Plugin Market (`market.koishi.chat`), or install via CLI:

```bash
npm install koishi-plugin-nb-speak
```

## License

MIT
