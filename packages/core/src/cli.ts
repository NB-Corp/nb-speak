import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildSpeakSystemPrompt,
  getAnthropicSpeakTools,
  getGeminiSpeakTools,
  getOpenAISpeakTools,
  NB_SPEAK_PROTOCOL,
  NB_SPEAK_VERSION,
  type PersonaPresetId,
} from './protocol.ts';
import { lintTurn, type LintSurface } from './lint.ts';
import { normalizeTurnOutput, turnToEvents } from './parser.ts';
import { startSpeakBridge } from './bridge.ts';

function readStdinUtf8(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

function printHelp(): void {
  console.log(`nb-speak v${NB_SPEAK_VERSION} (${NB_SPEAK_PROTOCOL}) — How AI agents speak to humans

Usage:
  nb-speak openclaw [options]    Install, preview, or uninstall the native OpenClaw plugin (~/.openclaw)
  nb-speak mcp [options]         Start the zero-dependency MCP (Model Context Protocol) stdio server
  nb-speak serve [options]       Start the OpenAI-compatible HTTP/SSE bridge server
  nb-speak lint [options]        Deterministically lint IM bubbles, plain beats & voice notes
  nb-speak parse [options]       Normalize a raw LLM completion or Markdown wall into bubbles & artifacts
  nb-speak tools [options]       Print send_message + send_artifact schemas & system layer
  nb-speak --version             Print version

Options (serve):
  --host <host>                  Bind host (default: 127.0.0.1)
  --port <port>                  Bind port (default: 18090)
  --upstream-url <url>           Upstream OpenAI-compatible API URL (or NB_SPEAK_UPSTREAM_URL)
  --api-key <key>                Upstream API key (or NB_SPEAK_API_KEY / OPENAI_API_KEY)
  --model <id>                   Default upstream model (default: deepseek-chat)
  --persona <id>                 neutral_peer | sharp_lead | warm_companion | calm_sre
  --voice-notes                  Enable optional voice_note in injected tool schemas & prompt (or NB_SPEAK_VOICE_NOTES=true)
  --voice-sidecar-url <url>      Optional Split-Phase / 4B voice translator endpoint

Options (lint / parse):
  --input, -i <file>             Input JSON or plain-text file (reads stdin when omitted)
  --surface <auto|json|plain>    Delivery surface mode for lint (default: auto)
  --persona-emoji <deny|allow>   Unicode emoji policy (default: deny)
  --json                         Print structured JSON report

Options (tools):
  --provider <openai|anthropic|gemini>  Schema provider format (default: openai)
  --voice-notes                         Include optional voice_note field in printed schema & prompt
  --system                              Print the chat-human + nb-speak system layer instead of JSON tools
`);
}

function parseBoolEnv(raw: string | undefined): boolean {
  if (!raw) return false;
  const cleaned = raw.trim().toLowerCase();
  return cleaned === '1' || cleaned === 'true' || cleaned === 'yes' || cleaned === 'on';
}

export async function runCli(argv: readonly string[]): Promise<number> {
  if (argv[0] === 'mcp') {
    const cliDir = path.dirname(fileURLToPath(import.meta.url));
    const mcpDist = path.resolve(cliDir, '../../mcp-server/dist/server.js');
    const mcpSrc = path.resolve(cliDir, '../../mcp-server/src/server.ts');
    const mcpEntry = fs.existsSync(mcpDist) ? mcpDist : mcpSrc;
    if (!fs.existsSync(mcpEntry)) {
      console.error(`MCP server entry not found at ${mcpEntry}`);
      return 2;
    }
    const mcpMod = (await import(pathToFileURL(mcpEntry).href)) as {
      startMcpStdioServer: (opts: { argv?: readonly string[] }) => { close: () => void };
    };
    const handle = mcpMod.startMcpStdioServer({ argv: argv.slice(1) });
    return await new Promise<number>((resolve) => {
      const done = () => {
        handle.close();
        resolve(0);
      };
      process.stdin.once('end', done);
      process.stdin.once('close', done);
    });
  }

  if (argv[0] === 'openclaw') {
    const cliDir = path.dirname(fileURLToPath(import.meta.url));
    const installerPath = path.resolve(cliDir, '../../openclaw-plugin/scripts/install-openclaw.mjs');
    if (!fs.existsSync(installerPath)) {
      console.error(`OpenClaw installer not found at ${installerPath}`);
      return 2;
    }
    const installerMod = (await import(pathToFileURL(installerPath).href)) as {
      parseCliArgs: (args: readonly string[]) => Record<string, unknown>;
      runInstaller: (opts: Record<string, unknown>) => { mode?: string; message?: string; ok?: boolean };
    };
    const parsed = installerMod.parseCliArgs(argv.slice(1));
    const res = installerMod.runInstaller(parsed);
    if (res.mode === 'help' || res.mode === 'version') {
      console.log(res.message ?? '');
    } else {
      console.log(JSON.stringify(res, null, 2));
    }
    return res.ok === false ? 1 : 0;
  }

  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return 0;
  }
  if (argv.includes('--version') || argv.includes('-v')) {
    console.log(NB_SPEAK_VERSION);
    return 0;
  }

  const sub = argv[0];
  const rest = argv.slice(1);

  if (sub === 'tools') {
    let provider = 'openai';
    let persona: PersonaPresetId = 'neutral_peer';
    let printSystem = false;
    let enableVoiceNotes = parseBoolEnv(process.env.NB_SPEAK_VOICE_NOTES);
    for (let i = 0; i < rest.length; i += 1) {
      if (rest[i] === '--provider' && rest[i + 1]) provider = rest[++i]!;
      else if (rest[i] === '--persona' && rest[i + 1]) persona = rest[++i] as PersonaPresetId;
      else if (rest[i] === '--system') printSystem = true;
      else if (rest[i] === '--voice-notes') enableVoiceNotes = true;
    }
    if (printSystem) {
      console.log(buildSpeakSystemPrompt({ persona, enableVoiceNotes }));
      return 0;
    }
    const payload =
      provider === 'anthropic'
        ? getAnthropicSpeakTools({ enableVoiceNotes })
        : provider === 'gemini'
          ? getGeminiSpeakTools({ enableVoiceNotes })
          : getOpenAISpeakTools({ enableVoiceNotes });
    console.log(JSON.stringify(payload, null, 2));
    return 0;
  }

  if (sub === 'lint') {
    let inputPath = '';
    let surface: LintSurface = 'auto';
    let personaEmoji: 'deny' | 'allow' = 'deny';
    let maxBubbles: number | undefined;
    let asJson = false;
    let ttsText: string | undefined;

    for (let i = 0; i < rest.length; i += 1) {
      const arg = rest[i];
      if ((arg === '--input' || arg === '-i') && rest[i + 1]) inputPath = rest[++i]!;
      else if (arg === '--surface' && rest[i + 1]) surface = rest[++i] as LintSurface;
      else if (arg === '--persona-emoji' && rest[i + 1]) personaEmoji = rest[++i] as 'deny' | 'allow';
      else if (arg === '--max-bubbles' && rest[i + 1]) maxBubbles = Number(rest[++i]);
      else if (arg === '--tts-text' && rest[i + 1]) ttsText = rest[++i];
      else if (arg === '--json') asJson = true;
    }

    const raw = inputPath ? fs.readFileSync(inputPath, 'utf8') : await readStdinUtf8();
    if (!raw.trim()) {
      console.error('Provide --input <file> or pipe a JSON/plain payload via stdin.');
      return 2;
    }

    const report = lintTurn(raw, {
      surface,
      personaEmoji,
      ...(maxBubbles !== undefined ? { maxBubbles } : {}),
      ...(ttsText ? { explicitTtsText: ttsText } : {}),
    });

    if (asJson) {
      console.log(JSON.stringify(report, null, 2));
    } else if (report.ok) {
      console.log(`OK: nb-speak lint passed (0 issues · ${report.stats.bubbleCount} bubbles).`);
    } else {
      for (const issue of report.issues) {
        console.log(`[${issue.level}] ${issue.code}: ${issue.message}`);
      }
    }
    return report.ok ? 0 : 1;
  }

  if (sub === 'parse') {
    let inputPath = '';
    let includeEvents = false;
    for (let i = 0; i < rest.length; i += 1) {
      const arg = rest[i];
      if ((arg === '--input' || arg === '-i') && rest[i + 1]) inputPath = rest[++i]!;
      else if (arg === '--events') includeEvents = true;
    }
    const raw = inputPath ? fs.readFileSync(inputPath, 'utf8') : await readStdinUtf8();
    if (!raw.trim()) {
      console.error('Provide --input <file> or pipe a raw completion/text via stdin.');
      return 2;
    }
    const turn = normalizeTurnOutput(raw, { cleanHygiene: true });
    console.log(JSON.stringify(includeEvents ? { turn, events: turnToEvents(turn) } : turn, null, 2));
    return 0;
  }

  if (sub === 'serve') {
    let host = process.env.NB_SPEAK_HOST || '127.0.0.1';
    let port = Number(process.env.NB_SPEAK_PORT || 18090);
    let upstreamBaseUrl = process.env.NB_SPEAK_UPSTREAM_URL || '';
    let upstreamApiKey = process.env.NB_SPEAK_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || '';
    let defaultModel = process.env.NB_SPEAK_MODEL || 'deepseek-chat';
    let persona: PersonaPresetId = (process.env.NB_SPEAK_PERSONA as PersonaPresetId) || 'neutral_peer';
    let voiceSidecarUrl = process.env.NB_SPEAK_SIDECAR_URL || '';
    let enableVoiceNotes = parseBoolEnv(process.env.NB_SPEAK_VOICE_NOTES);

    for (let i = 0; i < rest.length; i += 1) {
      const arg = rest[i];
      if (arg === '--host' && rest[i + 1]) host = rest[++i]!;
      else if (arg === '--port' && rest[i + 1]) port = Number(rest[++i]);
      else if (arg === '--upstream-url' && rest[i + 1]) upstreamBaseUrl = rest[++i]!;
      else if (arg === '--api-key' && rest[i + 1]) upstreamApiKey = rest[++i]!;
      else if (arg === '--model' && rest[i + 1]) defaultModel = rest[++i]!;
      else if (arg === '--persona' && rest[i + 1]) persona = rest[++i] as PersonaPresetId;
      else if (arg === '--voice-sidecar-url' && rest[i + 1]) voiceSidecarUrl = rest[++i]!;
      else if (arg === '--voice-notes') enableVoiceNotes = true;
    }

    const bridge = await startSpeakBridge({
      host,
      port,
      upstreamBaseUrl,
      upstreamApiKey,
      defaultModel,
      persona,
      enableVoiceNotes,
      voiceSidecarUrl,
    });
    console.log(
      JSON.stringify({
        event: 'nb-speak.bridge.ready',
        version: NB_SPEAK_VERSION,
        baseUrl: bridge.baseUrl,
        v1BaseUrl: bridge.v1BaseUrl,
        persona,
        voiceNotesEnabled: enableVoiceNotes,
        upstreamConfigured: Boolean(upstreamBaseUrl),
      }),
    );

    const shutdown = async () => {
      await bridge.close();
      process.exit(0);
    };
    process.once('SIGINT', () => void shutdown());
    process.once('SIGTERM', () => void shutdown());
    return 0;
  }

  console.error(`Unknown subcommand: ${sub}`);
  printHelp();
  return 2;
}
