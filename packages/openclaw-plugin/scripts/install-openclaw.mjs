#!/usr/bin/env node
/**
 * Zero-clone reversible installer/uninstaller for `@nb-corp/nb-speak-openclaw`.
 * - Persists a self-contained plugin + bundled `chat-human` skill into `<OPENCLAW_HOME>/extensions/nb-speak-openclaw`
 *   and merges safe `plugins.entries["nb-speak-openclaw"]` settings into `<OPENCLAW_HOME>/openclaw.json`.
 * - Byte-for-byte reversible uninstall; never reads, modifies, or deletes auth profiles, secrets, or credentials.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = path.resolve(SCRIPT_DIR, '..');
export const PLUGIN_ID = 'nb-speak-openclaw';
const PACKAGE_NAME = '@nb-corp/nb-speak-openclaw';

const RUNTIME_ENTRIES = [
  'package.json',
  'openclaw.plugin.json',
  'LICENSE',
  'README.md',
  'dist',
  'src',
  'skills',
  'scripts',
];

function readPackageVersion(pluginRoot = PLUGIN_ROOT) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'package.json'), 'utf8'));
    return String(pkg.version || '0.2.0');
  } catch {
    return '0.2.0';
  }
}

export function formatHelpText() {
  return [
    `${PACKAGE_NAME} v${readPackageVersion()} — Reversible OpenClaw IM Bubble & Table Gate Installer`,
    '',
    'Usage:',
    '  npx --yes github:NB-Corp/nb-speak openclaw --dry-run',
    '  npx --yes github:NB-Corp/nb-speak openclaw --apply [--preset neutral_peer]',
    '  npx --yes github:NB-Corp/nb-speak openclaw --uninstall',
    '',
    'Or via OpenClaw native CLI:',
    '  openclaw plugins install --link ./packages/openclaw-plugin --force',
    '  openclaw plugins enable nb-speak-openclaw',
    '',
    'Options:',
    '  --dry-run                Preview planned OpenClaw changes with zero filesystem writes (default)',
    '  --apply                  Persist plugin to <OPENCLAW_HOME>/extensions/nb-speak-openclaw & update openclaw.json',
    '  --uninstall              Restore openclaw.json from backup & remove persisted plugin directory',
    '  --openclaw-home <dir>    Override OPENCLAW_HOME (defaults to $OPENCLAW_HOME or ~/.openclaw)',
    '  --preset <id>            Persona preset: neutral_peer (default), sharp_lead, warm_companion, calm_sre',
    '  --table-mode <mode>      auto (default), kv (compact mobile key-value), or code (<=40-col monospace)',
    '  --voice-notes            Enable optional voice_note support (default: disabled)',
    '  -v, --version            Print package version',
    '  -h, --help               Show this help message',
  ].join('\n');
}

export function parseCliArgs(argv) {
  let mode = 'dry-run';
  let openclawHome = '';
  let preset = 'neutral_peer';
  let tableMode = 'auto';
  let enableVoiceNotes = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') mode = 'help';
    else if (arg === '--version' || arg === '-v') mode = 'version';
    else if (arg === '--dry-run') mode = 'dry-run';
    else if (arg === '--apply') mode = 'apply';
    else if (arg === '--uninstall') mode = 'uninstall';
    else if (arg === '--voice-notes') enableVoiceNotes = true;
    else if (arg === '--openclaw-home' && argv[i + 1]) openclawHome = argv[++i];
    else if (arg === '--preset' && argv[i + 1]) preset = argv[++i];
    else if (arg === '--table-mode' && argv[i + 1]) tableMode = argv[++i];
  }

  const resolvedHome = path.resolve(
    openclawHome ||
      (process.env.OPENCLAW_HOME && process.env.OPENCLAW_HOME.trim()) ||
      path.join(os.homedir(), '.openclaw'),
  );

  return {
    mode,
    openclawHome: resolvedHome,
    preset,
    tableMode: tableMode === 'kv' || tableMode === 'code' ? tableMode : 'auto',
    enableVoiceNotes,
    pluginRoot: PLUGIN_ROOT,
  };
}

function readOptionalUtf8(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

function copyEntryRecursive(srcPath, destPath) {
  const st = fs.statSync(srcPath);
  if (st.isDirectory()) {
    fs.mkdirSync(destPath, { recursive: true });
    for (const entry of fs.readdirSync(srcPath, { withFileTypes: true })) {
      copyEntryRecursive(path.join(srcPath, entry.name), path.join(destPath, entry.name));
    }
  } else {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
  }
}

function persistPluginDirectory(srcRoot, destDir) {
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of RUNTIME_ENTRIES) {
    const src = path.join(srcRoot, name);
    if (fs.existsSync(src)) {
      copyEntryRecursive(src, path.join(destDir, name));
    }
  }
}

export function runInstaller(options) {
  if (options.mode === 'help') {
    return { ok: true, mode: 'help', message: formatHelpText() };
  }
  if (options.mode === 'version') {
    return { ok: true, mode: 'version', message: readPackageVersion(options.pluginRoot) };
  }

  const extDir = path.join(options.openclawHome, 'extensions', PLUGIN_ID);
  const skillDestDir = path.join(options.openclawHome, 'skills', 'chat-human');
  const configPath = path.join(options.openclawHome, 'openclaw.json');
  const backupPath = path.join(options.openclawHome, '.nb-speak-openclaw.backup.json');

  const existingConfigRaw = readOptionalUtf8(configPath);
  const parsedConfig = existingConfigRaw ? JSON.parse(existingConfigRaw) : {};

  if (options.mode === 'uninstall') {
    const backupRaw = readOptionalUtf8(backupPath);
    if (backupRaw !== null) {
      const backupMeta = JSON.parse(backupRaw);
      if (backupMeta.hadConfig === false) {
        fs.rmSync(configPath, { force: true });
      } else if (typeof backupMeta.originalContent === 'string') {
        fs.writeFileSync(configPath, backupMeta.originalContent, 'utf8');
      }
      fs.rmSync(backupPath, { force: true });
    } else if (existingConfigRaw !== null && parsedConfig.plugins?.entries?.[PLUGIN_ID]) {
      delete parsedConfig.plugins.entries[PLUGIN_ID];
      fs.writeFileSync(configPath, JSON.stringify(parsedConfig, null, 2) + '\n', 'utf8');
    }
    fs.rmSync(extDir, { recursive: true, force: true });
    fs.rmSync(skillDestDir, { recursive: true, force: true });
    return {
      ok: true,
      mode: 'uninstall',
      openclawHome: options.openclawHome,
      extDir,
      configPath,
    };
  }

  const nextConfig = structuredClone(parsedConfig);
  if (!nextConfig.plugins || typeof nextConfig.plugins !== 'object') nextConfig.plugins = {};
  if (!nextConfig.plugins.entries || typeof nextConfig.plugins.entries !== 'object') {
    nextConfig.plugins.entries = {};
  }
  nextConfig.plugins.entries[PLUGIN_ID] = {
    enabled: true,
    hooks: {
      allowConversationAccess: true,
    },
    config: {
      enabled: true,
      persona: options.preset,
      tableMode: options.tableMode,
      maxMonospaceWidth: 40,
      maxBubbles: 4,
      enableVoiceNotes: Boolean(options.enableVoiceNotes),
    },
  };

  if (!nextConfig.tools || typeof nextConfig.tools !== 'object') nextConfig.tools = {};
  const existingAllow = Array.isArray(nextConfig.tools.allow) ? [...nextConfig.tools.allow] : [];
  if (!existingAllow.includes(PLUGIN_ID)) {
    existingAllow.push(PLUGIN_ID);
  }
  nextConfig.tools.allow = existingAllow;

  const renderedConfig = JSON.stringify(nextConfig, null, 2) + '\n';

  if (options.mode === 'dry-run') {
    return {
      ok: true,
      mode: 'dry-run',
      openclawHome: options.openclawHome,
      extDir,
      skillDestDir,
      configPath,
      plannedConfig: nextConfig,
    };
  }

  fs.mkdirSync(options.openclawHome, { recursive: true });
  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(
      backupPath,
      JSON.stringify(
        {
          hadConfig: existingConfigRaw !== null,
          originalContent: existingConfigRaw,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
  }

  persistPluginDirectory(options.pluginRoot, extDir);
  const bundledSkill = path.join(options.pluginRoot, 'skills', 'chat-human');
  if (fs.existsSync(bundledSkill)) {
    fs.rmSync(skillDestDir, { recursive: true, force: true });
    copyEntryRecursive(bundledSkill, skillDestDir);
  }
  fs.writeFileSync(configPath, renderedConfig, 'utf8');

  return {
    ok: true,
    mode: 'apply',
    openclawHome: options.openclawHome,
    extDir,
    skillDestDir,
    configPath,
    plannedConfig: nextConfig,
  };
}

export function isExecutedAsCliEntry(metaUrl = import.meta.url, argv1 = process.argv[1]) {
  if (!argv1) return false;
  try {
    return fs.realpathSync(path.resolve(argv1)) === fs.realpathSync(fileURLToPath(metaUrl));
  } catch {
    return pathToFileURL(path.resolve(argv1)).href === metaUrl;
  }
}

if (isExecutedAsCliEntry()) {
  const opts = parseCliArgs(process.argv.slice(2));
  const res = runInstaller(opts);
  if (res.mode === 'help' || res.mode === 'version') {
    console.log(res.message);
  } else {
    console.log(JSON.stringify(res, null, 2));
  }
}
