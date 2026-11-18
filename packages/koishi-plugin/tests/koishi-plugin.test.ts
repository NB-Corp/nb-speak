import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import koishiPlugin, {
  apply,
  Config,
  resolveKoishiSpeakConfig,
  type KoishiContextLike,
  type KoishiElementLike,
  type KoishiSessionLike,
} from '../src/index.ts';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(TEST_DIR, '..');

function renderMockElements(elements: readonly KoishiElementLike[]): string {
  return elements
    .map((el) => {
      if (el.type === 'text') return String(el.attrs?.content ?? '');
      const attrPairs = Object.entries(el.attrs ?? {})
        .map(([k, v]) => ` ${k}="${String(v)}"`)
        .join('');
      return `<${el.type}${attrPairs}/>`;
    })
    .join('');
}

test('koishi-plugin-nb-speak package.json obeys market.koishi.chat schema, exports callable Config, and disables voice notes by default', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'koishi-plugin-nb-speak');
  assert.ok(!pkg.private);
  assert.ok(pkg.keywords.includes('koishi'));
  assert.ok(pkg.keywords.includes('plugin'));
  assert.ok(pkg.peerDependencies.koishi.startsWith('^4.'));
  assert.equal(typeof pkg.koishi?.description?.en, 'string');
  assert.equal(typeof pkg.koishi?.description?.zh, 'string');
  assert.equal(koishiPlugin.name, 'nb-speak');
  assert.equal(typeof Config, 'function');
  assert.equal(Config({}).enableVoiceNotes, false);
  assert.equal(resolveKoishiSpeakConfig().enableVoiceNotes, false);
});

test('Koishi before-send delivers multi-bubble turns in chronological order, preserves <quote>/<at>/<img>, and protects code < & >', async () => {
  const listeners = new Map<string, (...args: any[]) => unknown>();
  const delays: number[] = [];
  const i18nLocales: string[] = [];

  const ctx: KoishiContextLike = {
    on(event, fn) {
      listeners.set(event, fn);
      return () => listeners.delete(event);
    },
    i18n: {
      define(locale) {
        i18nLocales.push(locale);
      },
    },
  };

  apply(ctx, { tableMode: 'auto', maxBubbles: 4, pacedDelivery: true }, {
    sleepImpl: async (ms) => {
      delays.push(ms);
    },
  });

  assert.ok(i18nLocales.includes('zh-CN'));
  assert.ok(ctx.nbSpeak);
  assert.ok(!ctx.nbSpeak!.getSystemPrompt().includes('voice_note'));
  const beforeSend = listeners.get('before-send')!;
  assert.equal(typeof beforeSend, 'function');

  // 1. Satori <quote> + <at> + raw pipe table + trailing <img> + code block with < and &
  const deliveredWire: string[] = [];
  const richSession: KoishiSessionLike = {
    platform: 'onebot',
    elements: [
      { type: 'quote', attrs: { id: 'msg_900' } },
      { type: 'at', attrs: { id: 'u_42' } },
      { type: 'text', attrs: { content: ' ' } },
      {
        type: 'text',
        attrs: {
          content:
            '（叹气）排查完了。\n\n| 节点 | 状态 |\n|---|---|\n| 网关 | 正常 |\n\n```cpp\nif (latency < 40 && ok) return 0;\n```\n\n',
        },
      },
      { type: 'img', attrs: { src: 'https://example.com/flamegraph.png' } },
      { type: 'text', attrs: { content: '看上面这张图就行。如有任何问题请随时告诉我！' } },
    ],
    async send(fragment, options) {
      const childEls: KoishiElementLike[] = Array.isArray(fragment)
        ? fragment
        : [{ type: 'text', attrs: { content: String(fragment) } }];
      const childSession: KoishiSessionLike = {
        platform: 'onebot',
        elements: childEls,
      };
      await beforeSend(childSession, options);
      deliveredWire.push(renderMockElements(childSession.elements!));
      return [`m_${deliveredWire.length}`];
    },
  };

  await beforeSend(richSession, {});
  // Simulate Satori MessageEncoder flushing session.elements right after before-send resolves
  deliveredWire.push(renderMockElements(richSession.elements!));

  assert.equal(deliveredWire.length, 5);
  // Quote & @at strictly on Bubble 1 only!
  assert.equal(deliveredWire[0], '<quote id="msg_900"/><at id="u_42"/> 排查完了');
  assert.equal(deliveredWire[1], '- 网关: 正常');
  assert.match(deliveredWire[2]!, /if \(latency < 40 && ok\) return 0;/);
  assert.equal(deliveredWire[3], '<img src="https://example.com/flamegraph.png"/>');
  assert.equal(deliveredWire[4], '看上面这张图就行');
  assert.ok(!deliveredWire.slice(1).some((item) => item.includes('<quote') || item.includes('<at')));
  assert.equal(delays.length, 5);

  // 2. Single <img> + short caption stays paired in one message
  const imgCaptionSession: KoishiSessionLike = {
    platform: 'telegram',
    elements: [
      { type: 'img', attrs: { src: 'https://example.com/a.png' } },
      { type: 'text', attrs: { content: 'Caption.' } },
    ],
  };
  await beforeSend(imgCaptionSession, {});
  assert.equal(imgCaptionSession.elements!.length, 2);
  assert.equal(imgCaptionSession.elements![0]!.type, 'img');
  assert.equal(imgCaptionSession.elements![1]!.attrs.content, 'Caption');

  // 3. Forward / composite <figure> tree is never touched
  const forwardSession: KoishiSessionLike = {
    platform: 'onebot',
    elements: [{ type: 'figure', attrs: {}, children: [{ type: 'message', attrs: { userId: '1' } }] }],
  };
  await beforeSend(forwardSession, {});
  assert.equal(forwardSession.elements![0]!.type, 'figure');
});

test('Koishi before-send recovers unsent tail bubbles without data loss when mid-turn network send throws', async () => {
  const listeners = new Map<string, (...args: any[]) => unknown>();
  const warnings: unknown[] = [];

  const ctx: KoishiContextLike = {
    on(event, fn) {
      listeners.set(event, fn);
      return () => listeners.delete(event);
    },
    logger() {
      return {
        warn(err) {
          warnings.push(err);
        },
      };
    },
  };

  apply(ctx, { pacedDelivery: true }, { sleepImpl: async () => {} });
  const beforeSend = listeners.get('before-send')!;

  const sentBeforeCrash: string[] = [];
  let sendCalls = 0;
  const session: KoishiSessionLike = {
    platform: 'onebot',
    elements: [
      {
        type: 'text',
        attrs: { content: '第一句已送达。\n\n第二句遇网络抖动。\n\n第三句收尾保底。' },
      },
    ],
    async send(fragment) {
      sendCalls += 1;
      if (sendCalls === 2) {
        throw new Error('OneBot WebSocket ECONNRESET');
      }
      sentBeforeCrash.push(String(fragment));
      return ['ok_1'];
    },
  };

  await beforeSend(session, {});
  const finalFallbackText = renderMockElements(session.elements!);

  assert.deepEqual(sentBeforeCrash, ['第一句已送达']);
  assert.equal(warnings.length, 1);
  assert.equal(finalFallbackText, '第二句遇网络抖动\n\n第三句收尾保底');
});
