import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  formatTableForChannel,
  parseMarkdownPipeTable,
  transformOutboundText,
} from '../src/format-gate.ts';
import openClawDefaultEntry, {
  createOpenClawSpeakPlugin,
  OPENCLAW_PLUGIN_ID,
  resolveOpenClawSpeakConfig,
} from '../src/plugin.ts';
import { parseCliArgs, runInstaller } from '../scripts/install-openclaw.mjs';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(TEST_DIR, '..');

test('openclaw.plugin.json manifest obeys OpenClaw native validation rules and disables voice notes by default', () => {
  const manifestRaw = fs.readFileSync(path.join(PLUGIN_ROOT, 'openclaw.plugin.json'), 'utf8');
  const manifest = JSON.parse(manifestRaw);
  const pkg = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'package.json'), 'utf8'));

  assert.equal(manifest.id, OPENCLAW_PLUGIN_ID);
  assert.equal(openClawDefaultEntry.id, OPENCLAW_PLUGIN_ID);
  assert.deepEqual(manifest.categories, ['channels']);
  assert.deepEqual(manifest.contracts.tools, ['send_bubble', 'send_artifact']);
  assert.equal(manifest.configSchema.additionalProperties, false);
  assert.equal(manifest.configSchema.properties.enableVoiceNotes.default, false);
  assert.equal(resolveOpenClawSpeakConfig(undefined).enableVoiceNotes, false);

  for (const prompt of manifest.recommendedPrompts) {
    assert.ok(typeof prompt === 'string' && prompt.length > 0 && prompt.length <= 128);
  }
  assert.deepEqual(pkg.openclaw.extensions, ['./dist/plugin.js']);
});

test('openclaw#36323 table gate formats compact tables as <=40-col monospace on Telegram and KV cards on WhatsApp or wide tables', () => {
  const compactTable = [
    '| Task | Status | Prio |',
    '|------|--------|------|',
    '| Fix route | Done | High |',
    '| Docs | WIP | Med |',
  ].join('\n');

  const parsed = parseMarkdownPipeTable(compactTable);
  assert.ok(parsed);
  assert.deepEqual(parsed.headers, ['Task', 'Status', 'Prio']);
  assert.equal(parsed.rows.length, 2);

  // Telegram compact table -> aligned <=40-col monospace fence
  const tgCard = formatTableForChannel(compactTable, { channel: 'telegram', maxMonospaceWidth: 40 });
  assert.match(tgCard, /^```text\nTask\s+Status\s+Prio\n/);
  for (const line of tgCard.replace(/^```text\n|\n```$/g, '').split('\n')) {
    assert.ok(line.length <= 40, `Expected line <= 40 chars on mobile Telegram, got ${line.length}: ${line}`);
  }

  // WhatsApp -> compact mobile key-value list (zero raw pipes, zero code-block wrapping issues)
  const waCard = formatTableForChannel(compactTable, { channel: 'whatsapp', maxMonospaceWidth: 40 });
  assert.ok(!waCard.includes('|---|'));
  assert.ok(!waCard.startsWith('```'));
  assert.match(waCard, /- Fix route — Status: Done · Prio: High/);

  // Wide multi-column table on Telegram (>40 cols) -> automatically degrades to mobile KV list instead of wrapping staircase
  const wideTable = [
    '| Component | Primary Endpoint | P99 Latency | Rollback Policy |',
    '|---|---|---|---|',
    '| Auth Gateway | https://auth.internal.example.com | 38ms | Instant flag flip |',
  ].join('\n');
  const tgWideCard = formatTableForChannel(wideTable, { channel: 'telegram', maxMonospaceWidth: 40 });
  assert.ok(!tgWideCard.startsWith('```'));
  assert.match(tgWideCard, /- Auth Gateway — Primary Endpoint: https:\/\/auth\.internal\.example\.com/);
});

test('transformOutboundText cleans 250-word Markdown + SQL + pipe-table walls into paced bubbles and isolated cards', () => {
  const rawRegressionWall = [
    '*sighs* Bubble 1: ### Production SQL Triage',
    '',
    'Error rate held at 0.02%.',
    '',
    '| Metric | Before | After |',
    '|---|---|---|',
    '| p99 | 4200ms | 38ms |',
    '',
    '```sql',
    '-- idx_orders.sql',
    'CREATE INDEX CONCURRENTLY idx_orders ON orders (created_at DESC);',
    '```',
    '',
    'Connection pool looks steady too, good to push 100%. Let me know if you need anything else!',
  ].join('\n');

  const res = transformOutboundText(rawRegressionWall, {
    channel: 'whatsapp',
    maxBubbles: 4,
  });

  assert.equal(res.changed, true);
  assert.ok(!res.primaryText.includes('*sighs*'));
  assert.ok(!res.primaryText.includes('Bubble 1:'));
  assert.ok(!res.primaryText.includes('Let me know if you need anything'));
  assert.ok(!res.primaryText.includes('|---|'));
  assert.equal(res.artifactCards.length, 2);
  assert.match(res.artifactCards[0]!, /- p99 — Before: 4200ms · After: 38ms/);
  assert.match(res.artifactCards[1]!, /```sql\n-- idx_orders\.sql/);
  assert.equal(res.lint.errorCount, 0);
});

test('OpenClaw register(api) wires prompt context, paced send_bubble/send_artifact delivery, duplicate suppression, and notice bypass', async () => {
  const hooks = new Map<string, (event: any, ctx?: any) => any>();
  const tools = new Map<string, { factory: any; options: any }>();
  const sleepDelays: number[] = [];

  const plugin = createOpenClawSpeakPlugin({
    sleepImpl: async (ms) => {
      sleepDelays.push(ms);
    },
  });

  plugin.register({
    pluginConfig: {
      persona: 'calm_sre',
      tableMode: 'auto',
      maxMonospaceWidth: 40,
      enableVoiceNotes: false,
    },
    on(name, handler) {
      hooks.set(name, handler);
    },
    registerTool(factory, options) {
      tools.set(String(options?.name), { factory, options });
    },
  });

  assert.ok(hooks.has('before_prompt_build'));
  assert.ok(hooks.has('reply_payload_sending'));
  assert.ok(hooks.has('message_sending'));
  assert.ok(tools.has('send_bubble'));
  assert.ok(tools.has('send_artifact'));

  // 1. Prompt hook returns static appendSystemContext
  const promptContribution = hooks.get('before_prompt_build')!({});
  assert.match(promptContribution.appendSystemContext, /Mobile IM & Channel Delivery Physics/);
  assert.match(promptContribution.appendSystemContext, /on-call SRE peer/);

  // 2. Voice note schema property is omitted when enableVoiceNotes is false
  const sentMessages: Array<{ text?: string; mediaUrl?: string }> = [];
  const bubbleTool = tools.get('send_bubble')!.factory({
    runId: 'run_42',
    deliveryContext: { channel: 'telegram' },
    delivery: {
      async send(payload: { text?: string; mediaUrl?: string }) {
        sentMessages.push(payload);
      },
    },
  });
  assert.equal('voice_note' in (bubbleTool.parameters.properties as Record<string, unknown>), false);

  const execRes = await bubbleTool.execute('call_1', {
    bubbles: ['Error rate held at 0.02%.', 'Pool looks steady, push 100%'],
    end_turn: true,
  });
  assert.equal(execRes.details.deliveredViaChannel, true);
  assert.equal(sentMessages.length, 2);
  // Short single-clause trailing period stripped automatically
  assert.equal(sentMessages[0]!.text, 'Error rate held at 0.02%');
  assert.equal(sentMessages[1]!.text, 'Pool looks steady, push 100%');
  assert.equal(sleepDelays.length, 2);

  // 3. reply_payload_sending suppresses duplicate "[Delivered 2 bubbles]" echo for the same runId
  const dupDecision = hooks.get('reply_payload_sending')!(
    {
      runId: 'run_42',
      channel: 'telegram',
      payload: { text: '[Delivered 2 bubbles]' },
    },
    { channel: 'telegram' },
  );
  assert.deepEqual(dupDecision, { cancel: true, reason: 'already_delivered_by_send_bubble' });

  // 4. reply_payload_sending leaves reasoning / status / error notices untouched
  const reasoningDecision = hooks.get('reply_payload_sending')!({
    channel: 'telegram',
    payload: { text: '| raw | table |\n|---|---|\n| 1 | 2 |', isReasoning: true },
  });
  assert.equal(reasoningDecision, undefined);

  // 5. reply_payload_sending rewrites raw pipe tables on ordinary plain-reply turns
  const rewritten = hooks.get('reply_payload_sending')!({
    channel: 'whatsapp',
    payload: {
      text: 'Status update.\n\n| Service | State |\n|---|---|\n| Worker | Green |',
      replyToId: 'msg_9',
    },
  });
  assert.ok(rewritten?.payload);
  assert.equal(rewritten.payload.replyToId, 'msg_9');
  assert.ok(!rewritten.payload.text.includes('|---|'));
  assert.match(rewritten.payload.text, /- Worker: Green/);
});

test('Opt-in enableVoiceNotes synthesizes OpenAI-compatible /v1/audio/speech and degrades silently on failure', async () => {
  const sent: Array<{ text?: string; mediaUrl?: string }> = [];
  let ttsCalled = 0;

  const plugin = createOpenClawSpeakPlugin({
    sleepImpl: async () => {},
    fetchImpl: (async (url: string | URL) => {
      ttsCalled += 1;
      assert.match(String(url), /\/v1\/audio\/speech$/);
      return new Response(new Uint8Array([0x4f, 0x67, 0x67, 0x53]), { status: 200 });
    }) as typeof fetch,
  });

  let bubbleFactory: any;
  plugin.register({
    pluginConfig: {
      enableVoiceNotes: true,
      ttsBaseUrl: 'http://127.0.0.1:8000/v1',
      ttsModel: 'tts-1',
      ttsVoice: 'alloy',
    },
    on() {},
    registerTool(factory, options) {
      if (options?.name === 'send_bubble') bubbleFactory = factory;
    },
  });

  const tool = bubbleFactory({
    delivery: {
      async send(payload: { text?: string; mediaUrl?: string }) {
        sent.push(payload);
      },
    },
  });
  assert.equal('voice_note' in (tool.parameters.properties as Record<string, unknown>), true);

  await tool.execute('call_vn', {
    bubbles: ['Canary stayed green'],
    voice_note: { text: 'Zero alerts for twenty minutes straight.', emotion: 'calm' },
  });

  assert.equal(ttsCalled, 1);
  assert.equal(sent.length, 2);
  assert.equal(sent[0]!.text, 'Canary stayed green');
  assert.ok(sent[1]!.mediaUrl && fs.existsSync(sent[1]!.mediaUrl));
  fs.rmSync(sent[1]!.mediaUrl!, { force: true });
});

test('install-openclaw.mjs persists standalone bundle, survives source removal, and uninstalls byte-for-byte without touching credentials', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-speak-oc-test-'));
  try {
    const openclawHome = path.join(tmpRoot, '.openclaw');
    fs.mkdirSync(openclawHome, { recursive: true });
    const origConfig = JSON.stringify({ gateway: { port: 18789 } }, null, 2) + '\n';
    const credSecret = 'secret-oauth-token-do-not-touch';
    fs.writeFileSync(path.join(openclawHome, 'openclaw.json'), origConfig, 'utf8');
    fs.writeFileSync(path.join(openclawHome, 'credentials.json'), credSecret, 'utf8');

    // Dry run writes nothing
    const dry = runInstaller(parseCliArgs(['--dry-run', '--openclaw-home', openclawHome]));
    assert.equal(dry.mode, 'dry-run');
    assert.equal(fs.readFileSync(path.join(openclawHome, 'openclaw.json'), 'utf8'), origConfig);

    // Apply persists standalone dist/ + skills/chat-human
    const applied = runInstaller(parseCliArgs(['--apply', '--openclaw-home', openclawHome, '--preset', 'sharp_lead']));
    assert.equal(applied.ok, true);
    assert.ok(fs.existsSync(path.join(applied.extDir, 'openclaw.plugin.json')));
    assert.ok(fs.existsSync(path.join(applied.extDir, 'dist', 'plugin.js')));
    assert.ok(fs.existsSync(path.join(applied.extDir, 'dist', 'core.js')));
    assert.ok(fs.existsSync(path.join(applied.skillDestDir, 'SKILL.md')));

    // Verify persisted dist/plugin.js loads & executes standalone from isolated tmp dir!
    const importedPersisted = await import(pathToFileURL(path.join(applied.extDir, 'dist', 'plugin.js')).href);
    assert.equal(importedPersisted.default.id, OPENCLAW_PLUGIN_ID);

    // Uninstall restores openclaw.json byte-for-byte and leaves credentials untouched
    const uninstalled = runInstaller(parseCliArgs(['--uninstall', '--openclaw-home', openclawHome]));
    assert.equal(uninstalled.ok, true);
    assert.equal(fs.readFileSync(path.join(openclawHome, 'openclaw.json'), 'utf8'), origConfig);
    assert.equal(fs.readFileSync(path.join(openclawHome, 'credentials.json'), 'utf8'), credSecret);
    assert.equal(fs.existsSync(applied.extDir), false);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
