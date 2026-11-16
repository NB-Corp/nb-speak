# @nb-corp/nb-speak

Universal `send_message` + `send_artifact` IM bubble protocol, plain-reply fallback parser, deterministic `lintTurn` (`bubble_lint`), and zero-dependency OpenAI/SSE bridge server for AI agents.

See the [monorepo documentation](https://github.com/NB-Corp/nb-speak#readme) and [live playground](https://nb-corp.github.io/nb-speak/) for full architecture and examples.

## Exports

- `@nb-corp/nb-speak` / `./protocol` — `getOpenAISpeakTools`, `getAnthropicSpeakTools`, `getGeminiSpeakTools`, `computeBubbleSchedule`, `buildSpeakSystemPrompt`, `PERSONA_PRESETS`.
- `@nb-corp/nb-speak/parser` — `normalizeTurnOutput`, `extractPlainReplyArtifactsAndBeats`, `SpeakStreamAccumulator`, `turnToEvents`, `translateDraftViaSidecar`.
- `@nb-corp/nb-speak/lint` — `lintTurn`, `computeVoiceOverlap`, `splitPlainBeats`.
- `@nb-corp/nb-speak/bridge` — `startSpeakBridge`.

## CLI

```bash
nb-speak tools --provider openai
nb-speak lint --json < payload.json
nb-speak parse < raw-completion.txt
nb-speak serve --port 18090 --upstream-url https://api.deepseek.com/v1
```

## License

[MIT](./LICENSE)
