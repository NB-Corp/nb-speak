# @nb-corp/nb-speak-mcp

Zero-dependency Model Context Protocol (`MCP`) `stdio` server for **NB Speak** (`nb-speak/1` + `chat-human`).

Gives **Claude Code**, **Cursor**, **Windsurf**, **Cherry Studio**, **Cline**, **Roo Code**, **Goose**, **LibreChat**, **LobeChat**, **Zed**, and **Raycast** deterministic mobile IM formatting (`format_im_bubbles`, `format_markdown_table`), 8-rule `lint_im_turn` auditing, and the `chat-human` system layer (`enableVoiceNotes: false` by default).

## Zero-Clone Setup

```json
{
  "mcpServers": {
    "nb-speak": {
      "command": "npx",
      "args": ["-y", "github:NB-Corp/nb-speak", "mcp"]
    }
  }
}
```

## Contributed Primitives

- **Tools**: `format_im_bubbles`, `lint_im_turn`, `format_markdown_table`
- **Prompts**: `chat-human` (`persona`, `enable_voice_notes`)
- **Resources**: `nb-speak://skills/chat-human` (`SKILL.md`)

## License

MIT
