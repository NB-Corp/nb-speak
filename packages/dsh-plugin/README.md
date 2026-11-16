# @nb-corp/nb-speak-dsh

Universal DeepSeek Harness (`DSH`) plugin for [`NB-Corp/nb-speak`](https://github.com/NB-Corp/nb-speak):

- **Mode A (`skill`)**: Standard cloud/local LLMs (DeepSeek, OpenAI, Claude, Gemini) with automatic `chat-human` system layer + `send_message` & `send_artifact` tool injection.
- **Mode B (`voice-model`)**: Specialized Split-Phase or 4B Voice-Translator endpoints with 5-axis continuous style weights (`clarity`, `warmth`, `sharp_wit`, `calm_grounding`, `concise_cadence`).
- **Collision-Free Subagent Orchestration**: Transparently remaps DSH's internal subagent `send_message <-> agent_send_message` on every request and response.
- **Reversible Installer**: Supports `--dry-run`, `--apply`, and `--uninstall` without touching `.credentials.yaml`.

```bash
node scripts/install-dsh.mjs --dry-run --profile web
node scripts/install-dsh.mjs --apply --profile web --runtime-mode skill --preset calm_sre
node scripts/install-dsh.mjs --uninstall --profile web
```

## License

[MIT](./LICENSE)
