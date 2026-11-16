import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BUDGET_LIMIT,
  BubbleStreamFormatter,
  computeEffectiveWeights,
  formatCompleteBubbleText,
  resolveUpstreamModelSpec,
} from '../src/weights.ts';
import {
  buildToolRemapTable,
  remapMessagesToUpstream,
  restoreOpenAIToolCalls,
  restoreToolNameFromUpstream,
} from '../src/tool-remap.ts';
import { startDshOpenAiBridge } from '../src/http-bridge.ts';
import { apply as applyPlugin } from '../src/plugin.ts';
import { runInstaller } from '../scripts/install-dsh.mjs';

test('5-axis universal weight normalization & skill vs voice-model resolution', () => {
  const projected = computeEffectiveWeights([1.0, 0.8, 0.8, 0.4, 0.3]);
  assert.equal(projected.isClamped, true);
  assert.equal(projected.weights[0], 1.0);
  const filterSum = projected.weights[1] + projected.weights[2] + projected.weights[3] + projected.weights[4];
  assert.ok(filterSum <= BUDGET_LIMIT + 1e-6);
  assert.ok(filterSum > 1.13);

  const cloudSpec = resolveUpstreamModelSpec('nb-speak:sre', {}, 'skill', 'deepseek-chat');
  assert.equal(cloudSpec.upstreamModel, 'deepseek-chat');
  assert.equal(cloudSpec.personaId, 'calm_sre');

  const voiceSpec = resolveUpstreamModelSpec(
    'nb-speak-voice-4b:warm',
    {},
    'voice-model',
    'deepseek-chat',
    'nb-speak-voice-v1',
  );
  assert.equal(voiceSpec.upstreamModel, 'nb-speak-voice-4b|1.000,0.750,0.200,0.150,0.050');
  assert.equal(voiceSpec.personaId, 'warm_companion');
});

test('BubbleStreamFormatter expands spoken newlines and preserves code fences intact', () => {
  const raw = [
    'Canary metrics held steady for 25m',
    'p99 latency dropped to 38ms',
    '```sql',
    'SELECT count(*) FROM active_sessions;',
    '```',
    'Ready to push 100%',
  ].join('\n');

  const fmt = new BubbleStreamFormatter('paragraph');
  let streamed = '';
  for (let i = 0; i < raw.length; i += 5) {
    streamed += fmt.push(raw.slice(i, i + 5));
  }
  assert.ok(streamed.includes('Canary metrics held steady for 25m\n\np99 latency dropped to 38ms'));
  assert.ok(streamed.includes('```sql\nSELECT count(*) FROM active_sessions;\n```'));
  assert.equal(formatCompleteBubbleText(raw, 'paragraph'), streamed.trim());
});

test('DSH subagent send_message <-> agent_send_message disambiguation leaves unrelated tools untouched', () => {
  const table = buildToolRemapTable([
    { type: 'function', function: { name: 'send_message', description: 'DSH Subagent message', parameters: { type: 'object' } } },
    { type: 'function', function: { name: 'nb_search', description: 'NB Search', parameters: { type: 'object' } } },
    { type: 'function', function: { name: 'web_fetch', description: 'Fetch URL', parameters: { type: 'object' } } },
  ]);
  assert.deepEqual(
    table.tools.map((t) => t.function.name),
    ['agent_send_message', 'nb_search', 'web_fetch'],
  );

  const remapped = remapMessagesToUpstream(
    [
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'send_message', arguments: '{"to":"worker_1"}' } }],
      },
    ],
    table,
  );
  assert.equal(remapped[0]?.tool_calls?.[0]?.function?.name, 'agent_send_message');
  assert.equal(restoreToolNameFromUpstream('agent_send_message', table), 'send_message');

  const restored = restoreOpenAIToolCalls(
    [{ index: 0, id: 'tc2', type: 'function', function: { name: 'agent_send_message', arguments: '{"to":"worker_1"}' } }],
    table,
  );
  assert.equal(restored?.[0]?.function?.name, 'send_message');
});

test('DSH bridge supports Mode A (JSON + multi-chunk SSE unwrapping + pure artifact fences) and Mode B (voice-model)', async () => {
  const capturedBodies: Array<Record<string, unknown>> = [];
  let currentMode: 'skill' | 'voice-model' = 'skill';
  let sseModeVariant: 'speak-only' | 'mixed-dsh-tools' = 'speak-only';

  const mockFetch = async (_url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
    capturedBodies.push(body);

    if (currentMode === 'skill' && !body.stream) {
      return new Response(
        JSON.stringify({
          id: 'cmpl-skill',
          choices: [
            {
              index: 0,
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_sub',
                    type: 'function',
                    function: { name: 'agent_send_message', arguments: '{"to":"worker-a","text":"verify logs"}' },
                  },
                  {
                    id: 'call_user_art',
                    type: 'function',
                    function: {
                      name: 'send_artifact',
                      arguments: JSON.stringify({
                        title: 'canary.sql',
                        kind: 'code',
                        language: 'sql',
                        content: 'SELECT status, count(*) FROM canary_events GROUP BY 1;',
                      }),
                    },
                  },
                  {
                    id: 'call_user_msg',
                    type: 'function',
                    function: {
                      name: 'send_message',
                      arguments: JSON.stringify({
                        bubbles: ['Asked worker-a to double-check shard logs.', 'Canary SQL is in the card.'],
                        end_turn: false,
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    if (currentMode === 'skill' && body.stream) {
      const sseChunks =
        sseModeVariant === 'speak-only'
          ? [
              {
                id: 'cmpl-sse-speak',
                model: 'cmd/deepseek-v4.1-flash',
                choices: [{ index: 0, delta: { reasoning_content: 'Checking package.json...' }, finish_reason: null }],
              },
              {
                id: 'cmpl-sse-speak',
                model: 'cmd/deepseek-v4.1-flash',
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        { index: 0, id: 'call_msg_1', type: 'function', function: { name: 'send_', arguments: '' } },
                        { index: 1, id: 'call_art_1', type: 'function', function: { name: 'send_artifact', arguments: '' } },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              },
              {
                id: 'cmpl-sse-speak',
                model: 'cmd/deepseek-v4.1-flash',
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          function: {
                            name: 'message',
                            arguments: JSON.stringify({ bubbles: ['零外部运行时依赖。', '桥接启动命令放下面了'] }),
                          },
                        },
                        {
                          index: 1,
                          function: {
                            arguments: JSON.stringify({
                              title: 'start-bridge.sh',
                              kind: 'code',
                              language: 'bash',
                              content: 'node packages/core/bin/nb-speak.mjs serve --port 18090',
                            }),
                          },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              },
              {
                id: 'cmpl-sse-speak',
                model: 'cmd/deepseek-v4.1-flash',
                choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
                usage: { prompt_tokens: 120, completion_tokens: 48, total_tokens: 168 },
              },
            ]
          : [
              {
                id: 'cmpl-sse-mixed',
                model: 'cmd/deepseek-v4.1-flash',
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          id: 'call_msg_pre',
                          type: 'function',
                          function: {
                            name: 'send_message',
                            arguments: JSON.stringify({ bubbles: ['我先读下 package.json'], end_turn: false }),
                          },
                        },
                        {
                          index: 1,
                          id: 'call_read_real',
                          type: 'function',
                          function: { name: 'read', arguments: '{"path":"package.json"}' },
                        },
                        {
                          index: 2,
                          id: 'call_sub_real',
                          type: 'function',
                          function: { name: 'agent_send_message', arguments: '{"to":"helper"}' },
                        },
                      ],
                    },
                    finish_reason: 'tool_calls',
                  },
                ],
              },
            ];

      const rawSse = sseChunks.map((c) => `data: ${JSON.stringify(c)}\n`).join('\n') + '\ndata: [DONE]\n';
      return new Response(rawSse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }

    const sse = [
      'data: ' +
        JSON.stringify({
          id: 'cmpl-voice',
          choices: [
            {
              index: 0,
              delta: {
                content: 'Error rate held at 0.02%\nPool is steady, good to ship',
                tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'agent_send_message', arguments: '{}' } }],
              },
              finish_reason: null,
            },
          ],
        }),
      '',
      'data: [DONE]',
      '',
    ].join('\n');
    return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };

  const bridge = await startDshOpenAiBridge({
    host: '127.0.0.1',
    port: 0,
    state: {
      getSliderConfig: () => ({ preset: 'calm_sre' }),
      getBubbleJoinMode: () => 'paragraph',
      fetchImpl: mockFetch,
      getUpstreamConnection: async () => ({
        mode: currentMode,
        cloudBaseUrl: 'http://127.0.0.1:19001/v1',
        cloudApiKey: 'sk-test',
        defaultCloudModel: 'deepseek-chat',
        voiceModelBaseUrl: 'http://127.0.0.1:19002/v1',
        voiceModelApiKey: '',
        defaultVoiceModel: 'nb-speak-voice-v1',
      }),
    },
  });

  try {
    // 1. Mode A non-streaming: DSH `send_message` remaps to `agent_send_message`; pure SQL fence without `//` syntax pollution
    const resSkill = await fetch(`${bridge.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stream: false,
        messages: [{ role: 'user', content: 'Check canary status' }],
        tools: [{ type: 'function', function: { name: 'send_message', parameters: { type: 'object' } } }],
      }),
    });
    const skillJson = (await resSkill.json()) as Record<string, any>;
    const sentToolNames = (capturedBodies[0]!.tools as Array<{ function: { name: string } }>).map((t) => t.function.name);
    assert.deepEqual(sentToolNames, ['agent_send_message', 'send_message', 'send_artifact']);
    const msgContent = String(skillJson.choices[0].message.content);
    assert.ok(msgContent.includes('Asked worker-a to double-check shard logs'));
    assert.ok(msgContent.includes('**`canary.sql`**'));
    assert.ok(msgContent.includes('```sql\nSELECT status, count(*) FROM canary_events GROUP BY 1;\n```'));
    assert.ok(!msgContent.includes('// canary.sql'));
    assert.equal(skillJson.choices[0].message.tool_calls.length, 1);
    assert.equal(skillJson.choices[0].message.tool_calls[0].function.name, 'send_message');

    // 2. Mode A SSE streaming (speak-only): partial `send_` + `message` unwrapped cleanly to content, finish_reason === 'stop', usage preserved
    const resSseSpeak = await fetch(`${bridge.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stream: true,
        model: 'cmd/deepseek-v4.1-flash',
        messages: [{ role: 'user', content: 'Inspect package.json' }],
        tools: [{ type: 'function', function: { name: 'read', parameters: { type: 'object' } } }],
      }),
    });
    const sseSpeakText = await resSseSpeak.text();
    const sseSpeakEvents = sseSpeakText
      .split(/\r?\n/)
      .filter((l) => l.startsWith('data:') && !l.includes('[DONE]'))
      .map((l) => JSON.parse(l.slice(5).trim()));
    assert.ok(!sseSpeakEvents.some((e) => e.choices?.[0]?.delta?.tool_calls));
    const fullStreamedContent = sseSpeakEvents.map((e) => e.choices?.[0]?.delta?.content ?? '').join('');
    assert.ok(fullStreamedContent.includes('零外部运行时依赖\n\n桥接启动命令放下面了'));
    assert.ok(fullStreamedContent.includes('```bash\nnode packages/core/bin/nb-speak.mjs serve --port 18090\n```'));
    const lastSpeakEvent = sseSpeakEvents[sseSpeakEvents.length - 1]!;
    assert.equal(lastSpeakEvent.choices[0].finish_reason, 'stop');
    assert.equal(lastSpeakEvent.usage.total_tokens, 168);

    // 3. Mode A SSE streaming (mixed user-speak + real DSH workspace `read` & subagent `send_message`): contiguous index 0, 1 + finish_reason === 'tool_calls'
    sseModeVariant = 'mixed-dsh-tools';
    const resSseMixed = await fetch(`${bridge.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stream: true,
        model: 'cmd/deepseek-v4.1-flash',
        messages: [{ role: 'user', content: 'Read package.json' }],
        tools: [
          { type: 'function', function: { name: 'read', parameters: { type: 'object' } } },
          { type: 'function', function: { name: 'send_message', parameters: { type: 'object' } } },
        ],
      }),
    });
    const sseMixedEvents = (await resSseMixed.text())
      .split(/\r?\n/)
      .filter((l) => l.startsWith('data:') && !l.includes('[DONE]'))
      .map((l) => JSON.parse(l.slice(5).trim()));
    const toolEvent = sseMixedEvents.find((e) => Array.isArray(e.choices?.[0]?.delta?.tool_calls));
    assert.ok(toolEvent);
    assert.deepEqual(
      toolEvent.choices[0].delta.tool_calls.map((t: any) => ({ index: t.index, name: t.function.name })),
      [
        { index: 0, name: 'read' },
        { index: 1, name: 'send_message' },
      ],
    );
    assert.equal(sseMixedEvents[sseMixedEvents.length - 1]!.choices[0].finish_reason, 'tool_calls');

    // 4. Mode B (`voice-model`): Continuous weight tag + SSE paragraph formatting + subagent restore
    currentMode = 'voice-model';
    const resVoice = await fetch(`${bridge.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stream: true,
        messages: [{ role: 'user', content: 'Canary status?' }],
        tools: [{ type: 'function', function: { name: 'send_message', parameters: { type: 'object' } } }],
      }),
    });
    const voiceSse = await resVoice.text();
    assert.equal(capturedBodies[3]!.model, 'nb-speak-voice-v1|1.000,0.050,0.000,0.650,0.450');
    assert.ok(voiceSse.includes('Error rate held at 0.02%\\n\\nPool is steady, good to ship'));
    assert.ok(voiceSse.includes('"name":"send_message"'));
  } finally {
    await bridge.close();
  }
});

test('Cordis plugin apply() resolves DSH credentials service, mounts nbSpeak, and disposes cleanly', async () => {
  let provided: Record<string, unknown> | undefined;
  let cleanupFn: (() => Promise<void> | void) | undefined;
  let capturedAuthHeader = '';

  await applyPlugin(
    {
      credentials: {
        resolve: async (ref: string) => (ref === 'AXON_API_KEY' ? { value: 'sk-from-dsh-credentials-store', source: 'file' } : undefined),
      },
      provide: (_name, val) => {
        provided = val as Record<string, unknown>;
      },
      effect: (factory) => {
        cleanupFn = factory();
      },
    },
    {
      bridgeEnabled: true,
      bridgePort: 0,
      runtimeMode: 'skill',
      preset: 'sharp_lead',
      apiKeyRef: 'AXON_API_KEY',
      cloudBaseUrl: 'http://127.0.0.1:19999/v1',
      defaultCloudModel: 'cmd/deepseek-v4.1-flash',
    },
    {
      env: {},
      fetchImpl: async (_url, init) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        capturedAuthHeader = headers.authorization ?? '';
        return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    },
  );
  assert.ok(provided?.bridgeBaseUrl);
  const statusUrl = String(provided.bridgeBaseUrl).replace(/\/v1$/, '/health');
  const healthRes = await fetch(statusUrl);
  const healthJson = (await healthRes.json()) as Record<string, any>;
  assert.equal(healthJson.status, 'ok');
  assert.equal(healthJson.activeModel, 'cmd/deepseek-v4.1-flash');
  assert.equal(capturedAuthHeader, 'Bearer sk-from-dsh-credentials-store');
  await cleanupFn?.();
});

test('install-dsh.mjs supports reversible --dry-run / --apply / --uninstall without touching credentials', () => {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-speak-dsh-'));
  try {
    const credPath = path.join(fakeHome, '.credentials.yaml');
    fs.writeFileSync(credPath, 'DEEPSEEK_API_KEY: keep_untouched\n', 'utf8');

    const webDir = path.join(fakeHome, 'profiles', 'web');
    fs.mkdirSync(webDir, { recursive: true });
    const origPkg =
      JSON.stringify(
        {
          name: 'dsh-profile-web',
          dependencies: { 'nb-search-dsh': '^0.1.0' },
          dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'nb-search-dsh'] } },
        },
        null,
        2,
      ) + '\n';
    const origPatch = '[]\n';
    fs.writeFileSync(path.join(webDir, 'package.json'), origPkg, 'utf8');
    fs.writeFileSync(path.join(webDir, 'cordis.patch.yml'), origPatch, 'utf8');

    runInstaller({ mode: 'dry-run', dshHome: fakeHome, profile: 'web' });
    assert.equal(fs.readFileSync(path.join(webDir, 'package.json'), 'utf8'), origPkg);

    runInstaller({
      mode: 'apply',
      dshHome: fakeHome,
      profile: 'web',
      runtimeMode: 'skill',
      preset: 'sharp_lead',
      bridgePort: 18095,
      upstreamUrl: 'https://axon.littleamgroup.online/v1',
      cloudModel: 'cmd/deepseek-v4.1-flash',
      apiKeyRef: 'AXON_API_KEY',
      wireProvider: true,
    });
    const installedPkg = JSON.parse(fs.readFileSync(path.join(webDir, 'package.json'), 'utf8'));
    assert.ok(installedPkg.dsh.profile.bundles.includes('@nb-corp/nb-speak-dsh'));
    const patchContent = fs.readFileSync(path.join(webDir, 'cordis.patch.yml'), 'utf8');
    assert.ok(patchContent.includes('cmd/deepseek-v4.1-flash'));
    assert.ok(patchContent.includes('http://127.0.0.1:18095/v1'));
    assert.ok(fs.existsSync(path.join(fakeHome, '.agent-presets', 'nb-speak', 'agent.cordis.yml')));

    runInstaller({ mode: 'uninstall', dshHome: fakeHome, profile: 'web' });
    assert.equal(fs.readFileSync(path.join(webDir, 'package.json'), 'utf8'), origPkg);
    assert.equal(fs.readFileSync(path.join(webDir, 'cordis.patch.yml'), 'utf8'), origPatch);
    assert.equal(fs.readFileSync(credPath, 'utf8'), 'DEEPSEEK_API_KEY: keep_untouched\n');
  } finally {
    fs.rmSync(fakeHome, { recursive: true, force: true });
  }
});
