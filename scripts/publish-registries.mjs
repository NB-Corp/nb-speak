#!/usr/bin/env node
/**
 * Multi-registry preflight & publish orchestrator for NB-Corp/nb-speak.
 *
 * Usage:
 *   node scripts/publish-registries.mjs --all --dry-run
 *   node scripts/publish-registries.mjs --npm --dry-run
 *   node scripts/publish-registries.mjs --npm --pypi --mcp --clawhub --langbot
 *
 * Flags:
 *   --all         Select all registry targets (npm, pypi, mcp, clawhub, langbot)
 *   --npm         5 npm packages (@nb-corp/nb-speak, -mcp, -openclaw, koishi-plugin-nb-speak, -dsh)
 *   --pypi        PyPI package (integrations/nonebot_plugin_nb_speak)
 *   --mcp         Official MCP Registry (server.json -> io.github.NB-Corp/nb-speak)
 *   --clawhub     ClawHub package + skill (packages/openclaw-plugin, skills/chat-human)
 *   --langbot     LangBot Marketplace (integrations/langbot_plugin_nb_speak)
 *   --dry-run     Run tests/preflights/builds without uploading to remote registries
 *   --skip-tests  Skip initial `npm test` suite during publish/dry-run
 *   -h, --help    Show help
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const NPM_PACKAGES = [
  { name: '@nb-corp/nb-speak', dir: 'packages/core', note: 'Core protocol, lint, parser, bridge' },
  { name: '@nb-corp/nb-speak-mcp', dir: 'packages/mcp-server', note: 'MCP stdio server' },
  { name: '@nb-corp/nb-speak-openclaw', dir: 'packages/openclaw-plugin', note: 'OpenClaw plugin + chat-human skill' },
  { name: 'koishi-plugin-nb-speak', dir: 'packages/koishi-plugin', note: 'Koishi v4 plugin (auto-indexed by market.koishi.chat)' },
  { name: '@nb-corp/nb-speak-dsh', dir: 'packages/dsh-plugin', note: 'DSH plugin + WebUI extension' },
];

const USAGE = `Usage: node scripts/publish-registries.mjs [--all | --npm --pypi --mcp --clawhub --langbot] [--dry-run] [--skip-tests]

Targets:
  --all         Run all 5 registry targets in dependency order
  --npm         Publish 5 npm packages (triggers Koishi market crawl for koishi-plugin-nb-speak)
  --pypi        Build & upload integrations/nonebot_plugin_nb_speak (prerequisite for nonebot.dev/store/plugins)
  --mcp         Validate & publish server.json via mcp-publisher (NB-Corp GitHub token)
  --clawhub     Validate & publish OpenClaw plugin + chat-human skill via clawhub CLI
  --langbot     Build & publish integrations/langbot_plugin_nb_speak via lbp CLI

Options:
  --dry-run     Validate manifests, run npm pack --dry-run, build isolated artifacts, check auth (no remote upload)
  --skip-tests  Skip initial \`npm test\` gate
  -h, --help    Show this help
`;

function parseArgs(argv) {
  const flags = new Set(argv);
  if (flags.has('-h') || flags.has('--help')) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  const all = flags.has('--all');
  const targets = {
    npm: all || flags.has('--npm'),
    pypi: all || flags.has('--pypi'),
    mcp: all || flags.has('--mcp'),
    clawhub: all || flags.has('--clawhub'),
    langbot: all || flags.has('--langbot'),
  };
  if (!Object.values(targets).some(Boolean)) {
    process.stderr.write('No target specified. Pass --all or one of --npm, --pypi, --mcp, --clawhub, --langbot.\n\n' + USAGE);
    process.exit(2);
  }
  return {
    targets,
    dryRun: flags.has('--dry-run'),
    skipTests: flags.has('--skip-tests'),
  };
}

function runCmd(command, args, { cwd = ROOT, env = process.env, capture = false } = {}) {
  const isWin = process.platform === 'win32';
  const bin = isWin ? 'cmd.exe' : command;
  const binArgs = isWin ? ['/d', '/c', command, ...args] : args;
  const res = spawnSync(bin, binArgs, {
    cwd,
    env,
    shell: false,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
  });
  return {
    ok: res.status === 0,
    status: res.status ?? 1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    error: res.error,
  };
}

function commandExists(bin) {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  const r = runCmd(probe, [bin], { capture: true });
  return r.ok;
}

function resolveMcpPublisher() {
  if (process.env.MCP_PUBLISHER_BIN && fs.existsSync(process.env.MCP_PUBLISHER_BIN)) {
    return process.env.MCP_PUBLISHER_BIN;
  }
  if (commandExists('mcp-publisher')) return 'mcp-publisher';
  for (const candidate of [
    path.join(os.tmpdir(), 'mcp-pub', 'mcp-publisher.exe'),
    path.join(os.tmpdir(), 'mcp-pub', 'mcp-publisher'),
    '/tmp/mcp-pub/mcp-publisher',
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function getNbCorpGithubToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN.trim();
  const r = runCmd('gh', ['auth', 'token', '--user', 'NB-Corp'], { capture: true });
  if (!r.ok || !r.stdout.trim()) return null;
  return r.stdout.trim();
}

async function checkHttpStatus(url) {
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(8000) });
    return res.status;
  } catch {
    return 0;
  }
}

function section(title) {
  process.stdout.write(`\n=== ${title} ===\n`);
}

function runNpm({ dryRun }) {
  section(`npm (${NPM_PACKAGES.length} packages)${dryRun ? ' [DRY-RUN]' : ''}`);
  const issues = [];

  const whoami = runCmd('npm', ['whoami'], { capture: true });
  if (whoami.ok) {
    process.stdout.write(`[npm] authenticated user: ${whoami.stdout.trim()}\n`);
  } else {
    const msg = 'npm CLI not authenticated (ENEEDAUTH). Run `npm login` first for live publish.';
    process.stdout.write(`[npm] WARN: ${msg}\n`);
    if (!dryRun) issues.push(msg);
  }

  for (const pkg of NPM_PACKAGES) {
    const pkgDir = path.join(ROOT, pkg.dir);
    const pkgJson = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
    process.stdout.write(`\n[npm] ${pkgJson.name}@${pkgJson.version} (${pkg.dir}) — ${pkg.note}\n`);
    if (dryRun) {
      const pack = runCmd('npm', ['pack', '--dry-run', '--json'], { cwd: pkgDir, capture: true });
      if (!pack.ok) {
        issues.push(`npm pack --dry-run failed for ${pkg.name}: ${pack.stderr.trim()}`);
        continue;
      }
      try {
        const parsed = JSON.parse(pack.stdout);
        const info = Array.isArray(parsed) ? parsed[0] : parsed;
        process.stdout.write(
          `[npm] pack ok: files=${info.files?.length ?? '?'}, unpackedSize=${info.unpackedSize ?? '?'} bytes\n`
        );
      } catch {
        process.stdout.write('[npm] pack --dry-run succeeded\n');
      }
    } else if (issues.length === 0) {
      const pub = runCmd('npm', ['publish', '--access', 'public'], { cwd: pkgDir });
      if (!pub.ok) {
        issues.push(`npm publish failed for ${pkg.name} (exit ${pub.status})`);
      }
    }
  }

  if (!dryRun && issues.length === 0) {
    process.stdout.write(
      '[npm] Note: koishi-plugin-nb-speak is auto-crawled by market.koishi.chat / registry.koishi.chat after npm publish.\n'
    );
  }
  return issues;
}

function runPypi({ dryRun }) {
  section(`PyPI (integrations/nonebot_plugin_nb_speak)${dryRun ? ' [DRY-RUN]' : ''}`);
  const issues = [];
  const nbDir = path.join(ROOT, 'integrations', 'nonebot_plugin_nb_speak');
  const pyproject = fs.readFileSync(path.join(nbDir, 'pyproject.toml'), 'utf8');
  const nameMatch = pyproject.match(/^name\s*=\s*"([^"]+)"/m);
  const verMatch = pyproject.match(/^version\s*=\s*"([^"]+)"/m);
  process.stdout.write(`[pypi] package: ${nameMatch?.[1] ?? 'unknown'}@${verMatch?.[1] ?? 'unknown'}\n`);

  const hasUv = commandExists('uv');
  if (!hasUv) {
    issues.push('`uv` CLI not found; install uv or python build+twine to package integrations/nonebot_plugin_nb_speak.');
    return issues;
  }

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-speak-pypi-'));
  try {
    const buildRes = runCmd('uv', ['build', '--out-dir', outDir], { cwd: nbDir });
    if (!buildRes.ok) {
      issues.push(`uv build failed (exit ${buildRes.status})`);
      return issues;
    }
    const builtFiles = fs.readdirSync(outDir);
    process.stdout.write(`[pypi] built artifacts (${outDir}): ${builtFiles.join(', ')}\n`);

    if (dryRun) {
      const hasToken = Boolean(process.env.UV_PUBLISH_TOKEN || process.env.TWINE_PASSWORD);
      if (!hasToken) {
        process.stdout.write(
          '[pypi] WARN: UV_PUBLISH_TOKEN / TWINE_PASSWORD not set. Export PyPI API token before live publish.\n'
        );
      }
      process.stdout.write(
        '[pypi] Follow-up after live PyPI upload: submit https://nonebot.dev/store/plugins (requires live PyPI package).\n'
      );
    } else {
      const token = process.env.UV_PUBLISH_TOKEN || process.env.TWINE_PASSWORD;
      if (!token) {
        issues.push('UV_PUBLISH_TOKEN (or TWINE_PASSWORD) is required for live PyPI upload.');
      } else {
        const artifacts = builtFiles.map((f) => path.join(outDir, f));
        const pub = runCmd('uv', ['publish', ...artifacts], {
          cwd: nbDir,
          env: { ...process.env, UV_PUBLISH_TOKEN: token },
        });
        if (!pub.ok) issues.push(`uv publish failed (exit ${pub.status})`);
      }
    }
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.rmSync(path.join(nbDir, 'nonebot_plugin_nb_speak.egg-info'), { recursive: true, force: true });
    fs.rmSync(path.join(nbDir, 'build'), { recursive: true, force: true });
  }
  return issues;
}

async function runMcp({ dryRun }) {
  section(`Official MCP Registry (server.json)${dryRun ? ' [DRY-RUN]' : ''}`);
  const issues = [];
  const serverJsonPath = path.join(ROOT, 'server.json');
  const serverJson = JSON.parse(fs.readFileSync(serverJsonPath, 'utf8'));
  const descLen = (serverJson.description ?? '').length;
  process.stdout.write(`[mcp] name=${serverJson.name}, version=${serverJson.version}, description.length=${descLen}\n`);

  const descIssue =
    descLen > 100
      ? `server.json description is ${descLen} chars (Official MCP Registry enforces <= 100 chars; HTTP 422 otherwise).`
      : null;
  if (descIssue) {
    process.stdout.write(`[mcp] ${dryRun ? 'PREFLIGHT WARN' : 'BLOCKER'}: ${descIssue}\n`);
    if (!dryRun) issues.push(descIssue);
  }

  const npmStatus = await checkHttpStatus('https://registry.npmjs.org/@nb-corp/nb-speak-mcp');
  process.stdout.write(`[mcp] npm @nb-corp/nb-speak-mcp HTTP status: ${npmStatus}\n`);
  if (npmStatus !== 200) {
    const msg = '@nb-corp/nb-speak-mcp is not yet published on npm (HTTP 404). Publish --npm before --mcp.';
    process.stdout.write(`[mcp] ${dryRun ? 'PREFLIGHT WARN' : 'BLOCKER'}: ${msg}\n`);
    if (!dryRun) issues.push(msg);
  }

  const publisherBin = resolveMcpPublisher();
  if (!publisherBin) {
    const msg = 'mcp-publisher binary not found on PATH or /tmp/mcp-pub/mcp-publisher (set MCP_PUBLISHER_BIN).';
    process.stdout.write(`[mcp] ${dryRun ? 'PREFLIGHT WARN' : 'BLOCKER'}: ${msg}\n`);
    if (!dryRun) issues.push(msg);
    return issues;
  }
  process.stdout.write(`[mcp] mcp-publisher binary: ${publisherBin}\n`);

  if (dryRun) {
    if (!descIssue) {
      const val = runCmd(publisherBin, ['validate'], { cwd: ROOT });
      if (!val.ok) issues.push(`mcp-publisher validate failed (exit ${val.status})`);
    }
    return issues;
  }

  if (issues.length > 0) return issues;

  const ghToken = getNbCorpGithubToken();
  if (!ghToken) {
    issues.push('Failed to obtain NB-Corp GitHub token via `gh auth token --user NB-Corp`.');
    return issues;
  }

  const login = runCmd(publisherBin, ['login', 'github', '-token', ghToken], { cwd: ROOT });
  if (!login.ok) {
    issues.push(`mcp-publisher login failed (exit ${login.status})`);
    return issues;
  }
  const pub = runCmd(publisherBin, ['publish'], { cwd: ROOT });
  if (!pub.ok) {
    issues.push(`mcp-publisher publish failed (exit ${pub.status})`);
  }
  return issues;
}

function runClawhub({ dryRun }) {
  section(`ClawHub (packages/openclaw-plugin + skills/chat-human)${dryRun ? ' [DRY-RUN]' : ''}`);
  const issues = [];
  const openclawDir = path.join(ROOT, 'packages', 'openclaw-plugin');
  const skillDir = path.join(ROOT, 'skills', 'chat-human');
  const reportTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-speak-clawhub-'));

  try {
    const val = runCmd('npx', ['--yes', 'clawhub@0.26.0', 'package', 'validate', '--out', reportTmp, openclawDir], {
      cwd: ROOT,
    });
    if (!val.ok) {
      issues.push(`clawhub package validate failed (exit ${val.status})`);
      return issues;
    }

    const whoami = runCmd('npx', ['--yes', 'clawhub@0.26.0', 'whoami'], { cwd: ROOT, capture: true });
    if (whoami.ok) {
      process.stdout.write(`[clawhub] authenticated: ${whoami.stdout.trim()}\n`);
    } else {
      const msg = 'clawhub CLI not logged in (or clawhub.ai unreachable). Run `npx clawhub login` before live publish.';
      process.stdout.write(`[clawhub] WARN: ${msg}\n`);
      if (!dryRun) issues.push(msg);
    }

    if (!dryRun && issues.length === 0) {
      const pubPkg = runCmd('npx', ['--yes', 'clawhub@0.26.0', 'package', 'publish', openclawDir], { cwd: ROOT });
      if (!pubPkg.ok) issues.push(`clawhub package publish failed (exit ${pubPkg.status})`);

      const pubSkill = runCmd(
        'npx',
        ['--yes', 'clawhub@0.26.0', 'publish', skillDir, '--slug', 'chat-human', '--name', 'chat-human', '--version', '0.2.0'],
        { cwd: ROOT }
      );
      if (!pubSkill.ok) issues.push(`clawhub skill publish failed (exit ${pubSkill.status})`);
    }
  } finally {
    fs.rmSync(reportTmp, { recursive: true, force: true });
  }
  return issues;
}

function runLangbot({ dryRun }) {
  section(`LangBot Marketplace (integrations/langbot_plugin_nb_speak)${dryRun ? ' [DRY-RUN]' : ''}`);
  const issues = [];
  const lbDir = path.join(ROOT, 'integrations', 'langbot_plugin_nb_speak');
  if (!commandExists('uvx')) {
    issues.push('`uvx` CLI not found; install uv to run `uvx --from langbot-plugin lbp`.');
    return issues;
  }

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-speak-lbp-'));
  try {
    if (dryRun) {
      const buildRes = runCmd('uvx', ['--from', 'langbot-plugin', 'lbp', 'build', '-o', outDir], { cwd: lbDir });
      if (!buildRes.ok) {
        issues.push(`lbp build failed (exit ${buildRes.status})`);
      } else {
        process.stdout.write(`[langbot] lbp build ok (${fs.readdirSync(outDir).join(', ')})\n`);
      }
      const cfgPath = path.join(os.homedir(), '.langbot', 'cli', 'config.json');
      process.stdout.write(`[langbot] CLI config present (${cfgPath}): ${fs.existsSync(cfgPath)}\n`);
    } else {
      const pub = runCmd('uvx', ['--from', 'langbot-plugin', 'lbp', 'publish'], { cwd: lbDir });
      if (!pub.ok) {
        issues.push(`lbp publish failed (exit ${pub.status}). Ensure \`lbp login\` and @NB-Corp creator profile exist.`);
      }
      fs.rmSync(path.join(lbDir, 'dist'), { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  return issues;
}

async function main() {
  const { targets, dryRun, skipTests } = parseArgs(process.argv.slice(2));
  process.stdout.write(`nb-speak multi-registry publisher (${dryRun ? 'DRY-RUN' : 'LIVE'})\n`);

  if (!skipTests) {
    section('Preflight: npm test');
    const testRes = runCmd('npm', ['test'], { cwd: ROOT });
    if (!testRes.ok) {
      process.stderr.write(`Preflight \`npm test\` failed with exit ${testRes.status}. Aborting.\n`);
      process.exit(testRes.status);
    }
  }

  const failures = [];
  if (targets.npm) failures.push(...runNpm({ dryRun }));
  if (targets.pypi) failures.push(...runPypi({ dryRun }));
  if (targets.mcp) failures.push(...(await runMcp({ dryRun })));
  if (targets.clawhub) failures.push(...runClawhub({ dryRun }));
  if (targets.langbot) failures.push(...runLangbot({ dryRun }));

  section('Summary');
  if (failures.length === 0) {
    process.stdout.write(dryRun ? 'All selected dry-run checks passed.\n' : 'All selected publish targets succeeded.\n');
    process.exit(0);
  }
  for (const item of failures) {
    process.stderr.write(`- ${item}\n`);
  }
  process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});
