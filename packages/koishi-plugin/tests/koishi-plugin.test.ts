import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import koishiPlugin, {
  apply,
  resolveKoishiSpeakConfig,
  type KoishiContextLike,
  type KoishiSessionLike,
} from '../src/index.ts';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(TEST_DIR, '..');

test('koishi-plugin-nb-speak package.json obeys market.koishi.chat indexing schema and disables voice notes by default', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'koishi-plugin-nb-speak');
  assert.ok(!pkg.private);
  assert.ok(pkg.keywords.includes('koishi'));
  assert.ok(pkg.keywords.includes('plugin'));
  assert.ok(pkg.peerDependencies.koishi.startsWith('^4.'));
  assert.equal(typeof pkg.koishi?.description?.en, 'string');
  assert.equal(typeof pkg.koishi?.description?.zh, 'string');
  assert.equal(koishiPlugin.name, 'nb-speak');
  assert.equal(resolveKoishiSpeakConfig().enableVoiceNotes, false);
});

test('Koishi before-send converts OneBot/QQ raw pipe tables and paces multi-bubble replies without recursion', async () => {
  const listeners = new Map<string, (...args: any[]) => unknown>();
  const delays: number[] = [];

  const ctx: KoishiContextLike = {
    on(event, fn) {
      listeners.set(event, fn);
      return () => listeners.delete(event);
    },
  };

  apply(ctx, { tableMode: 'auto', maxBubbles: 4, pacedDelivery: true }, {
    sleepImpl: async (ms) => {
      delays.push(ms);
    },
  });

  assert.ok(ctx.nbSpeak);
  assert.ok(!ctx.nbSpeak!.getSystemPrompt().includes('voice_note'));
  const beforeSend = listeners.get('before-send')!;
  assert.equal(typeof beforeSend, 'function');

  // 1. Multi-segment wall on OneBot: segment[0] mutates current session.elements, follow-up segments pace via session.send
  const sentFollowUps: string[] = [];
  const session: KoishiSessionLike = {
    platform: 'onebot',
    elements: [
      {
        type: 'text',
        attrs: {
          content:
            '（叹气）排查完了。\n\n| 节点 | 状态 |\n|---|---|\n| 网关 | 正常 |\n\n如有任何问题请随时告诉我！',
        },
      },
    ],
    async send(fragment, options) {
      // Simulate real Koishi emitting before-send on nested session.send calls
      const childSession: KoishiSessionLike = {
        platform: 'onebot',
        elements: [{ type: 'text', attrs: { content: String(fragment) } }],
      };
      beforeSend(childSession, options);
      sentFollowUps.push(String(childSession.elements![0]!.attrs.content));
      return ['msg_2'];
    },
  };

  beforeSend(session, {});
  // Wait for async follow-up bubble dispatch
  await new Promise((r) => setTimeout(r, 25));

  assert.equal(session.elements![0]!.attrs.content, '排查完了');
  assert.equal(sentFollowUps.length, 1);
  assert.equal(sentFollowUps[0], '- 网关: 正常');
  assert.equal(delays.length, 1);

  // 2. Rich media elements (e.g. image + text) are left untouched so native adapters never lose attachments
  const imgSession: KoishiSessionLike = {
    platform: 'telegram',
    elements: [
      { type: 'img', attrs: { src: 'https://example.com/a.png' } },
      { type: 'text', attrs: { content: 'Caption.' } },
    ],
  };
  beforeSend(imgSession, {});
  assert.equal(imgSession.elements!.length, 2);
  assert.equal(imgSession.elements![0]!.type, 'img');
});
