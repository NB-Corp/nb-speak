# Contributing to nb-speak

Issues and pull requests are welcome at [github.com/NB-Corp/nb-speak](https://github.com/NB-Corp/nb-speak).

## Local Development

Requires **Node.js >= 22.19** (Node 24 recommended) and **Python >= 3.10**. Zero external npm or pip dependencies are needed:

```bash
npm run build
npm test
node packages/core/bin/nb-speak.mjs lint --json < payload.json
```

Before opening a pull request:
1. Keep `packages/core/src/{protocol,lint,parser}.ts` free of Node-only imports so the browser engine builds cleanly via `npm run build`.
2. Keep lint rule codes in sync between `packages/core/src/lint.ts` and `skills/chat-human/scripts/bubble_lint.py`.
3. Run `npm test` and confirm all TypeScript and Python unit tests pass.
