import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  attachMcpStreams,
  createMcpRequestHandler,
  MCP_REGISTRY_ID,
  MCP_SERVER_NAME,
} from '../src/server.ts';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(TEST_DIR, '..');
const REPO_ROOT = path.resolve(PKG_ROOT, '..', '..');
const CHAT_HUMAN_ROOT = path.resolve(REPO_ROOT, '..', 'chat-human');

test('Official MCP Registry (server.json, glama.json, smithery.yaml) and Claude Code Marketplace manifests are valid and disable voice notes by default', () => {
  const serverJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'server.json'), 'utf8'));
  const glamaJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'glama.json'), 'utf8'));
  const smitheryRaw = fs.readFileSync(path.join(REPO_ROOT, 'smithery.yaml'), 'utf8');
  const pkgJson = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'));

  assert.equal(serverJson.name, MCP_REGISTRY_ID);
  assert.equal(pkgJson.mcpName, MCP_REGISTRY_ID);
  assert.equal(serverJson.packages[0].identifier, MCP_SERVER_NAME);
  assert.equal(serverJson.packages[0].transport.type, 'stdio');
  assert.deepEqual(glamaJson.maintainers, ['NB-Corp']);
  assert.match(smitheryRaw, /default:\s*false/);

  // Validate Claude Code manifests in nb-speak
  const ccMarket = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const ccPlugin = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  const mcpConfig = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.mcp.json'), 'utf8'));
  assert.equal(ccMarket.owner.name, 'NB-Corp');
  assert.equal(ccMarket.plugins[0].name, 'nb-speak');
  assert.equal(ccPlugin.name, 'nb-speak');
  assert.deepEqual(ccPlugin.skills, ['./skills/chat-human']);
  assert.deepEqual(mcpConfig.mcpServers['nb-speak'].args, ['-y', 'github:NB-Corp/nb-speak', 'mcp']);

  // Validate Claude Code manifests in chat-human when sibling checkout is present
  if (fs.existsSync(path.join(CHAT_HUMAN_ROOT, '.claude-plugin', 'marketplace.json'))) {
    const chMarket = JSON.parse(
      fs.readFileSync(path.join(CHAT_HUMAN_ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'),
    );
    const chPlugin = JSON.parse(fs.readFileSync(path.join(CHAT_HUMAN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
    assert.equal(chMarket.name, 'chat-human');
    assert.equal(chPlugin.name, 'chat-human');
    assert.deepEqual(chPlugin.skills, ['./skills/chat-human']);
  }
});

test('MCP request handler serves initialize, tools/call (format_im_bubbles & lint_im_turn), prompts/get, and resources/read', () => {
  const handle = createMcpRequestHandler();

  // Notifications produce zero output
  assert.equal(handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), undefined);

  const initRes = handle({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-03-26' },
  }) as any;
  assert.equal(initRes.result.protocolVersion, '2025-03-26');
  assert.equal(initRes.result.serverInfo.name, MCP_SERVER_NAME);

  const listRes = handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) as any;
  const toolNames = listRes.result.tools.map((t: any) => t.name);
  assert.deepEqual(toolNames, ['format_im_bubbles', 'lint_im_turn', 'format_markdown_table']);

  // Format a Markdown wall + pipe table for WhatsApp
  const fmtRes = handle({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'format_im_bubbles',
      arguments: {
        text: '*sighs* ### Rollout Summary\n\nAll green.\n\n| Service | Latency |\n|---|---|\n| Gateway | 19ms |\n\nHope this helps!',
        channel: 'whatsapp',
      },
    },
  }) as any;
  assert.equal(fmtRes.result.structuredContent.changed, true);
  assert.ok(!fmtRes.result.structuredContent.primaryText.includes('|---|'));
  assert.ok(!fmtRes.result.structuredContent.primaryText.includes('*sighs*'));
  assert.match(fmtRes.result.structuredContent.primaryText, /- Gateway: 19ms/);

  // Deterministic lint catches raw pipe tables
  const lintRes = handle({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'lint_im_turn',
      arguments: {
        input: '| Col A | Col B |\n|---|---|\n| 1 | 2 |',
        surface: 'plain',
      },
    },
  }) as any;
  assert.equal(lintRes.result.structuredContent.ok, false);
  assert.ok(lintRes.result.structuredContent.issues.some((i: any) => i.code === 'bubble.markdown_structure'));

  // Prompt defaults to enableVoiceNotes=false (no voice_note XML/JSON rule injected unless requested)
  const promptRes = handle({
    jsonrpc: '2.0',
    id: 5,
    method: 'prompts/get',
    params: { name: 'chat-human', arguments: { persona: 'calm_sre' } },
  }) as any;
  const promptText = promptRes.result.messages[0].content.text;
  assert.match(promptText, /on-call SRE peer/);
  assert.ok(!promptText.includes('voice_note'));

  // Resource read returns SKILL.md
  const resRead = handle({
    jsonrpc: '2.0',
    id: 6,
    method: 'resources/read',
    params: { uri: 'nb-speak://skills/chat-human' },
  }) as any;
  assert.match(resRead.result.contents[0].text, /chat-human/);

  // Resource templates list & error code parity with official @modelcontextprotocol/sdk (-32602 InvalidParams)
  const tplList = handle({
    jsonrpc: '2.0',
    id: 7,
    method: 'resources/templates/list',
  }) as any;
  assert.deepEqual(tplList.result.resourceTemplates, []);

  const unknownTool = handle({
    jsonrpc: '2.0',
    id: 8,
    method: 'tools/call',
    params: { name: 'nonexistent_tool', arguments: {} },
  }) as any;
  assert.equal(unknownTool.error.code, -32602);

  const missingTextArg = handle({
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: { name: 'format_im_bubbles', arguments: { channel: 'telegram' } },
  }) as any;
  assert.equal(missingTextArg.result.isError, true);
});

test('attachMcpStreams supports both Content-Length framing and `nb-speak mcp` NDJSON stdio end-to-end', async () => {
  // 1. Content-Length framing check
  const input = new PassThrough();
  const output = new PassThrough();
  const handle = attachMcpStreams(input, output);
  const reqBody = JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'ping' });
  input.write(`Content-Length: ${Buffer.byteLength(reqBody, 'utf8')}\r\n\r\n${reqBody}`);

  const rawOut = await new Promise<string>((resolve) => {
    output.once('data', (chunk) => resolve(String(chunk)));
  });
  handle.close();
  assert.match(rawOut, /^Content-Length: \d+\r\n\r\n\{"jsonrpc":"2\.0","id":99,"result":\{\}\}$/);

  // 2. Real CLI subprocess check: `node packages/core/bin/nb-speak.mjs mcp`
  const cliBin = path.join(REPO_ROOT, 'packages', 'core', 'bin', 'nb-speak.mjs');
  const child = spawn(process.execPath, [cliBin, 'mcp', '--persona', 'sharp_lead'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdoutData = '';
  child.stdout.on('data', (chunk) => {
    stdoutData += String(chunk);
  });

  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) + '\n');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  child.stdin.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'format_markdown_table',
        arguments: {
          table_markdown: '| Metric | Value |\n|---|---|\n| p99 | 24ms |',
          channel: 'wechat',
        },
      },
    }) + '\n',
  );
  child.stdin.end();

  const exitCode = await new Promise<number | null>((resolve) => {
    child.once('close', (code) => resolve(code));
  });
  assert.equal(exitCode, 0);

  const lines = stdoutData
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(lines.length, 2);
  assert.equal(lines[0].id, 1);
  assert.equal(lines[1].id, 2);
  assert.equal(lines[1].result.structuredContent.formatted, '- p99: 24ms');
});
