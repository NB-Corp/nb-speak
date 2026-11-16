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

test('DSH bridge supports BOTH Mode A (skill + tool injection + subagent remap) and Mode B (voice-model)', async () => {
  const capturedBodies: Array<Record<string, unknown>> = [];
  let currentMode: 'skill' | 'voice-model' = 'skill';

  const mockFetch = async (_url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
    capturedBodies.push(body);

    if (currentMode === 'skill') {
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
                        bubbles: ['Asked worker-a to double-check shard logs', 'Canary SQL is in the card'],
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
    // Test Mode A (`skill`): DSH `send_message` remaps to `agent_send_message` while user `send_message` & `send_artifact` are injected
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
    // User bubbles + artifact rendered to content, while subagent `agent_send_message` restored to `send_message` for DSH!
    assert.ok(String(skillJson.choices[0].message.content).includes('Asked worker-a to double-check shard logs'));
    assert.ok(String(skillJson.choices[0].message.content).includes('// canary.sql'));
    assert.equal(skillJson.choices[0].message.tool_calls.length, 1);
    assert.equal(skillJson.choices[0].message.tool_calls[0].function.name, 'send_message');
    assert.deepEqual(skillJson.nb_speak.bubbles, [
      'Asked worker-a to double-check shard logs',
      'Canary SQL is in the card',
    ]);

    // Test Mode B (`voice-model`): Continuous weight tag + SSE paragraph formatting + subagent restore
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
    assert.equal(capturedBodies[1]!.model, 'nb-speak-voice-v1|1.000,0.050,0.000,0.650,0.450');
    assert.ok(voiceSse.includes('Error rate held at 0.02%\\n\\nPool is steady, good to ship'));
    assert.ok(voiceSse.includes('"name":"send_message"'));
  } finally {
    await bridge.close();
  }
});

test('Cordis plugin apply() mounts nbSpeak service and disposes cleanly', async () => {
  let provided: Record<string, unknown> | undefined;
  let cleanupFn: (() => Promise<void> | void) | undefined;
  await applyPlugin(
    {
      provide: (_name, val) => {
        provided = val as Record<string, unknown>;
      },
      effect: (factory) => {
        cleanupFn = factory();
      },
    },
    { bridgeEnabled: true, bridgePort: 0, runtimeMode: 'skill', preset: 'sharp_lead' },
  );
  assert.ok(provided?.bridgeBaseUrl);
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
      runtimeMode: 'voice-model',
      preset: 'calm_sre',
      bridgePort: 18095,
    });
    const installedPkg = JSON.parse(fs.readFileSync(path.join(webDir, 'package.json'), 'utf8'));
    assert.ok(installedPkg.dsh.profile.bundles.includes('@nb-corp/nb-speak-dsh'));
    assert.ok(fs.existsSync(path.join(fakeHome, '.agent-presets', 'nb-speak', 'agent.cordis.yml')));

    runInstaller({ mode: 'uninstall', dshHome: fakeHome, profile: 'web' });
    assert.equal(fs.readFileSync(path.join(webDir, 'package.json'), 'utf8'), origPkg);
    assert.equal(fs.readFileSync(path.join(webDir, 'cordis.patch.yml'), 'utf8'), origPatch);
    assert.equal(fs.readFileSync(credPath, 'utf8'), 'DEEPSEEK_API_KEY: keep_untouched\n');
  } finally {
    fs.rmSync(fakeHome, { recursive: true, force: true });
  }
});
