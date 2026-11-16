import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildSpeakSystemPrompt,
  computeBubbleSchedule,
  getAnthropicSpeakTools,
  getGeminiSpeakTools,
  getOpenAISpeakTools,
  NB_SPEAK_VERSION,
} from '../src/protocol.ts';
import { lintTurn } from '../src/lint.ts';
import {
  extractPlainReplyArtifactsAndBeats,
  normalizeTurnOutput,
  SpeakStreamAccumulator,
  turnToEvents,
} from '../src/parser.ts';
import { startSpeakBridge } from '../src/bridge.ts';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const BIN_PATH = path.resolve(TEST_DIR, '../bin/nb-speak.mjs');

test('protocol exports valid OpenAI, Anthropic, and Gemini schemas plus cadence schedule', () => {
  const oa = getOpenAISpeakTools();
  assert.equal(oa.length, 2);
  assert.equal(oa[0]?.function.name, 'send_message');
  assert.equal(oa[1]?.function.name, 'send_artifact');

  const ant = getAnthropicSpeakTools();
  assert.equal(ant[0]?.name, 'send_message');
  assert.ok(ant[0]?.input_schema);

  const gem = getGeminiSpeakTools();
  assert.equal(gem.functionDeclarations.length, 2);

  const sched = computeBubbleSchedule(['Staging deploy is green', 'Error rate held at 0.02%, p99 down to 38ms']);
  assert.equal(sched.length, 2);
  assert.equal(sched[0]!.delayMs, 240);
  assert.ok(sched[1]!.delayMs >= 360 && sched[1]!.delayMs <= 2100);
  assert.equal(sched[1]!.cumulativeMs, sched[0]!.delayMs + sched[1]!.delayMs);

  const prompt = buildSpeakSystemPrompt({ persona: 'calm_sre' });
  assert.ok(prompt.includes('nb-speak · IM Delivery Contract'));
  assert.ok(prompt.includes('on-call SRE peer'));
});

test('lintTurn achieves deterministic parity across bubbles[], messages[], plain beats, and voice notes', () => {
  const clean = lintTurn({
    bubbles: ['Staging deploy went through, auth latency dropped to 40ms', 'Flip prod tonight or hold till morning'],
    voice_note: {
      text: 'Dashboard stayed quiet for ten minutes straight. Totally fine waiting till morning if you already closed your laptop.',
      emotion: 'calm',
    },
    end_turn: true,
  });
  assert.equal(clean.ok, true);
  assert.equal(clean.issueCount, 0);

  const sloppy = lintTurn({
    bubbles: [
      '*sighs* 向你汇报，我已经顺手替你改好啦 ✨\n1. 第一项\n2. 第二项',
      '北门丰巢07号柜，取件码663920。',
    ],
    voice_note: {
      text: '向你汇报，我已经顺手替你改好啦 19.9 at https://example.com/log',
    },
  });
  assert.equal(sloppy.ok, false);
  const codes = new Set(sloppy.issues.map((i) => i.code));
  assert.ok(codes.has('bubble.markdown_structure'));
  assert.ok(codes.has('style.stage_brackets'));
  assert.ok(codes.has('style.steward_cliche'));
  assert.ok(codes.has('style.unicode_emoji'));
  assert.ok(codes.has('style.trailing_period'));
  assert.ok(codes.has('tts.raw_path_or_url'));
  assert.ok(codes.has('tts.unnormalized_numbers'));
});

test('normalizeTurnOutput parses tool_calls and extracts code/tables from plain-reply Markdown walls', () => {
  const toolTurn = normalizeTurnOutput({
    choices: [
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'tc_art',
              type: 'function',
              function: {
                name: 'send_artifact',
                arguments: JSON.stringify({
                  title: 'idx_orders_created.sql',
                  kind: 'code',
                  language: 'sql',
                  content: 'CREATE INDEX CONCURRENTLY idx_orders_created ON orders (tenant_id, created_at DESC);',
                }),
              },
            },
            {
              id: 'tc_msg',
              type: 'function',
              function: {
                name: 'send_message',
                arguments: JSON.stringify({
                  bubbles: ['Seq scan was missing a composite index on tenant_id + created_at', 'Put the concurrent index SQL in the card'],
                  voice_note: { text: 'Safe to run live on primary without locking writes.', emotion: 'calm' },
                  end_turn: true,
                }),
              },
            },
          ],
        },
      },
    ],
  });

  assert.equal(toolTurn.source, 'tool_calls');
  assert.equal(toolTurn.artifacts.length, 1);
  assert.equal(toolTurn.artifacts[0]?.title, 'idx_orders_created.sql');
  assert.equal(toolTurn.bubbles.length, 2);
  assert.equal(toolTurn.lint.ok, true);

  const rawMarkdownWall = [
    'Bubble 1: Query plan fixed.',
    '',
    '```sql',
    '-- fix_query.sql',
    'SELECT id FROM sessions WHERE active = true;',
    '```',
    '',
    '| Metric | Before | After |',
    '| --- | --- | --- |',
    '| p99 | 420ms | 19ms |',
    '',
    'Ready to roll out.',
  ].join('\n');

  const fallback = extractPlainReplyArtifactsAndBeats(rawMarkdownWall);
  assert.equal(fallback.artifacts.length, 2);
  assert.equal(fallback.artifacts[0]?.kind, 'code');
  assert.equal(fallback.artifacts[0]?.title, 'fix_query.sql');
  assert.equal(fallback.artifacts[1]?.kind, 'table');
  assert.deepEqual(fallback.bubbles, ['Query plan fixed', 'Ready to roll out']);
});

test('SpeakStreamAccumulator reassembles chunked SSE tool_calls cleanly', () => {
  const acc = new SpeakStreamAccumulator();
  const argJson = JSON.stringify({ bubbles: ['Canary p99 held at 38ms', 'Good to push 100%'], end_turn: true });
  acc.pushOpenAIChunk({
    choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'send_message', arguments: argJson.slice(0, 20) } }] } }],
  });
  acc.pushOpenAIChunk({
    choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: argJson.slice(20) } }] } }],
  });
  const turn = acc.finalize();
  assert.equal(turn.source, 'tool_calls');
  assert.deepEqual(turn.bubbles, ['Canary p99 held at 38ms', 'Good to push 100%']);
  assert.equal(turn.lint.ok, true);
  const evts = turnToEvents(turn);
  assert.ok(evts.some((e) => e.type === 'nb.bubble'));
  assert.ok(evts.some((e) => e.type === 'nb.done'));
});

test('HTTP/SSE bridge injects tools + persona, serves /v1/speak/lint & /v1/speak/parse, and streams structured events', async () => {
  const capturedUpstream: Array<Record<string, unknown>> = [];
  const mockFetch: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    capturedUpstream.push(body);
    const sse = [
      'data: ' +
        JSON.stringify({
          id: 'chatcmpl-1',
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_msg',
                    type: 'function',
                    function: {
                      name: 'send_message',
                      arguments: JSON.stringify({
                        bubbles: ['Error rate held at 0.02%, p99 down to 38ms', 'Pool looks steady, good to push 100%'],
                        end_turn: true,
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      '',
      'data: [DONE]',
      '',
    ].join('\n');
    return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };

  const bridge = await startSpeakBridge({
    host: '127.0.0.1',
    port: 0,
    upstreamBaseUrl: 'http://127.0.0.1:19999/v1',
    persona: 'calm_sre',
    fetchImpl: mockFetch,
  });

  try {
    const healthRes = await fetch(`${bridge.baseUrl}/health`);
    const health = (await healthRes.json()) as Record<string, unknown>;
    assert.equal(health.status, 'ok');
    assert.equal(health.version, NB_SPEAK_VERSION);

    const lintRes = await fetch(`${bridge.baseUrl}/v1/speak/lint`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload: { bubbles: ['Ship it'] } }),
    });
    const lintJson = (await lintRes.json()) as Record<string, unknown>;
    assert.equal(lintJson.ok, true);

    const chatRes = await fetch(`${bridge.v1BaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-nb-speak-events': 'structured',
      },
      body: JSON.stringify({
        model: 'nb-speak/calm-sre',
        stream: true,
        messages: [{ role: 'user', content: '25m into 20% canary, error rate 0.02%, push 100%?' }],
      }),
    });
    const sseText = await chatRes.text();
    assert.ok(Array.isArray(capturedUpstream[0]?.tools));
    assert.ok(sseText.includes('event: nb.bubble'));
    assert.ok(sseText.includes('Pool looks steady, good to push 100%'));
    assert.ok(sseText.includes('event: nb.lint'));
  } finally {
    await bridge.close();
  }
});

test('nb-speak CLI runs --version, tools, and lint cleanly', () => {
  const ver = execFileSync(process.execPath, [BIN_PATH, '--version'], { encoding: 'utf8' }).trim();
  assert.equal(ver, NB_SPEAK_VERSION);

  const toolsOut = JSON.parse(execFileSync(process.execPath, [BIN_PATH, 'tools', '--provider', 'openai'], { encoding: 'utf8' }));
  assert.equal(toolsOut.length, 2);

  const lintOut = JSON.parse(
    execFileSync(process.execPath, [BIN_PATH, 'lint', '--json'], {
      input: JSON.stringify({ bubbles: ['Staging deploy is green', 'Ship whenever ready'] }),
      encoding: 'utf8',
    }),
  );
  assert.equal(lintOut.ok, true);
});
