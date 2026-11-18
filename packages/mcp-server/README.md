# @nb-corp/nb-speak-mcp

Zero-dependency Model Context Protocol (`MCP`) `stdio` server for **NB Speak** (`nb-speak/1` + `chat-human`).

Gives **Claude Desktop**, **Claude Code**, **Cursor**, **Cherry Studio**, **Cline / Roo Code**, **Windsurf**, **Goose**, **LibreChat**, **LobeChat**, **Zed**, and **Raycast** deterministic mobile IM formatting (`format_im_bubbles`, `format_markdown_table`), 8-rule `lint_im_turn` auditing, and the `chat-human` system layer (`enableVoiceNotes: false` by default).

- **Zero npm runtime dependencies**: Runs directly on **Node.js >= 22.19** (`npx -y @nb-corp/nb-speak-mcp` or `npx -y github:NB-Corp/nb-speak mcp`).
- **Dual-framing `stdio` transport**: Speaks standard newline-delimited JSON-RPC 2.0 (`2024-11-05` through `2025-11-25`) with automatic `Content-Length` fallback for legacy hosts.
- **Pure text by default**: `enableVoiceNotes` is strictly `false` unless `--voice-notes` or `enable_voice_notes="true"` is explicitly requested.

## Copy-Paste Client Setup

### Claude Desktop

Add to `claude_desktop_config.json` (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS or `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

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

### Claude Code

Register via the Claude Code CLI or native plugin marketplace:

```bash
# Option A: Add MCP stdio server directly
claude mcp add nb-speak -- npx -y github:NB-Corp/nb-speak mcp

# Option B: Install full plugin (chat-human Skill + MCP server)
/plugin marketplace add NB-Corp/nb-speak
/plugin install nb-speak@nb-corp
```

### Cursor

Save to `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "nb-speak": {
      "command": "npx",
      "args": ["-y", "github:NB-Corp/nb-speak", "mcp", "--persona", "neutral_peer"]
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

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

### Cline / Roo Code

Open **MCP Servers -> Configure MCP Servers** (`cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "nb-speak": {
      "command": "npx",
      "args": ["-y", "github:NB-Corp/nb-speak", "mcp"],
      "disabled": false,
      "alwaysAllow": [
        "format_im_bubbles",
        "lint_im_turn",
        "format_markdown_table"
      ]
    }
  }
}
```

### Cherry Studio

Open **Settings -> MCP Servers -> Add Server**:
- **Name**: `nb-speak`
- **Type**: `STDIO`
- **Command**: `npx`
- **Arguments**:
  ```text
  -y
  github:NB-Corp/nb-speak
  mcp
  ```

## CLI Flags

| Flag | Default | Description |
| --- | --- | --- |
| `--persona <id>` | `neutral_peer` | Default tone preset for `chat-human` (`neutral_peer` · `sharp_lead` · `warm_companion` · `calm_sre` · `custom`). |
| `--voice-notes` | *off (`false`)* | Opt in to optional `voice_note` prompt rules (`enableVoiceNotes: false` when omitted). |

## Contributed MCP Primitives

### Tools (`tools/list` & `tools/call`)

| Tool | Required Input | Optional Parameters | Output (`content` + `structuredContent`) |
| --- | --- | --- | --- |
| `format_im_bubbles` | `text: string` | `channel` (`telegram`, `whatsapp`, `wechat`, `qq`, `discord`, `feishu`, `slack`), `table_mode` (`auto` \| `kv` \| `code`), `max_bubbles` (`1..6`), `max_monospace_width` (`24..120`) | Splits dense walls into `1–4` bubbles, shields code blocks, converts pipe tables, computes `schedule` typing delays, and attaches a `lint` report. |
| `lint_im_turn` | `input: string` | `surface` (`auto` \| `plain` \| `json`), `max_bubbles` (`1..6`), `persona_emoji` (`deny` \| `allow`) | Deterministic 8-rule `bubble_lint` report (`ok`, `errorCount`, `warningCount`, `stats`, `issues`). |
| `format_markdown_table` | `table_markdown: string` | `channel`, `table_mode` (`auto` \| `kv` \| `code`), `title`, `max_monospace_width` (`24..120`) | Converts raw `\|---\|` pipe tables into mobile KV bullet cards or aligned `<=40`-col monospace blocks. |

### Prompts (`prompts/list` & `prompts/get`)

- **`chat-human`**: Returns the Layer 1 IM bubble delivery contract + Layer 2 persona instructions (`persona`, `enable_voice_notes` defaulting to `"false"`).

### Resources (`resources/list` & `resources/read`)

- **`nb-speak://skills/chat-human`** (`text/markdown`): Full `SKILL.md` specification bundled inside the package.

## License

MIT
