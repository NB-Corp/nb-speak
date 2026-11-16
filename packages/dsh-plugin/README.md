# @nb-corp/nb-speak-dsh

Full-stack DeepSeek Harness (`DSH`) plugin and WebUI client extension for [`NB-Corp/nb-speak`](https://github.com/NB-Corp/nb-speak):

- **Native Mode (`native`, default)**: Registers first-class `send_bubble` (`exec.concludeTurn()`) and `send_artifact` DSH tools, a live `dsh-system-prompt` delivery contract, volatile Schemastery persona/slider settings, and a `dsh.client` WebUI bundle (`dist/client.js`) that renders tactile IM chat bubbles, playable 22-bar voice-note pills, and interactive copyable artifact cards directly in the conversation stream on any DSH provider.
- **Bridge Mode A (`skill`)**: Local OpenAI-compatible bridge injecting `send_message` + `send_artifact` with transparent `send_message <-> agent_send_message` subagent remapping.
- **Bridge Mode B (`voice-model`)**: Specialized Split-Phase or 4B Voice-Translator endpoints with 5-axis continuous style weights (`clarity`, `warmth`, `sharp_wit`, `calm_grounding`, `concise_cadence`).
- **Reversible Installer**: Supports `--dry-run`, `--apply`, and `--uninstall` without touching `.credentials.yaml`.

```bash
node scripts/install-dsh.mjs --dry-run --profile web
node scripts/install-dsh.mjs --apply --profile web --preset neutral_peer
node scripts/install-dsh.mjs --uninstall --profile web
```

## License

[MIT](./LICENSE)
