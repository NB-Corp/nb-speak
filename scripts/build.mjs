#!/usr/bin/env node
/**
 * Zero-dependency build script using Node >=22.19 built-in `stripTypeScriptTypes`.
 * 1. Compiles `packages/core/src/*.ts` -> `packages/core/dist/*.js`
 * 2. Compiles `packages/{dsh-plugin,openclaw-plugin,mcp-server,koishi-plugin}/src/*.ts` -> `dist/*.js`
 * 3. Syncs canonical `bubble_lint.py`, `formatter.py`, and `skills/chat-human` into AstrBot, LangBot, and NoneBot2 integrations
 * 4. Emits browser-safe `docs/assets/nb-speak-browser.js` directly from `packages/core/src/{protocol,lint,parser,format}.ts`
 */
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function compileDir(srcDir, distDir) {
  if (!fs.existsSync(srcDir)) return 0;
  fs.mkdirSync(distDir, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    const srcFile = path.join(srcDir, entry.name);
    const tsCode = fs.readFileSync(srcFile, 'utf8');
    const jsRaw = stripTypeScriptTypes(tsCode, { mode: 'strip' });
    const jsCode = jsRaw.replace(/(from\s+['"]\.\/[^'"]+)\.ts(['"])/g, '$1.js$2');
    const outFile = path.join(distDir, entry.name.replace(/\.ts$/, '.js'));
    fs.writeFileSync(outFile, jsCode, 'utf8');
    count += 1;
  }
  return count;
}

function buildDshClientBundle() {
  const dshSrc = path.join(ROOT, 'packages', 'dsh-plugin', 'src');
  const dshDist = path.join(ROOT, 'packages', 'dsh-plugin', 'dist');
  fs.mkdirSync(dshDist, { recursive: true });
  const cssText = fs.readFileSync(path.join(dshSrc, 'client.css'), 'utf8');
  const stripForIIFE = (fileName) => {
    const raw = fs.readFileSync(path.join(dshSrc, fileName), 'utf8');
    const stripped = stripTypeScriptTypes(raw, { mode: 'strip' });
    return stripped
      .replace(/^\s*import\s+[\s\S]*?from\s+['"]\.\/[^'"]+['"];?\s*$/gm, '')
      .replace(/^\s*export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)/gm, '')
      .trim();
  };
  const modelBody = stripForIIFE('client-model.ts');
  const uiBody = stripForIIFE('client-ui.ts');
  const bundle = [
    '// Auto-generated from @nb-corp/nb-speak-dsh src/{client-model.ts,client-ui.ts,client.css} — DO NOT HAND-EDIT',
    'window.__ModuleLoader__.load({',
    "  id: '@nb-corp/nb-speak-dsh',",
    '  factory(require) {',
    "    const React = require('react');",
    `    const NB_SPEAK_CLIENT_CSS = ${JSON.stringify(cssText)};`,
    '',
    modelBody,
    '',
    uiBody,
    '',
    '    return createNbSpeakClientPlugin(React, NB_SPEAK_CLIENT_CSS);',
    '  },',
    '});',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dshDist, 'client.js'), bundle, 'utf8');
}

function buildCoreSingleFileSource() {
  const coreSrc = path.join(ROOT, 'packages', 'core', 'src');
  const files = ['protocol.ts', 'lint.ts', 'parser.ts', 'format.ts'];
  const chunks = [
    '// Auto-generated from @nb-corp/nb-speak packages/core/src/{protocol,lint,parser,format}.ts — DO NOT HAND-EDIT',
  ];
  for (const name of files) {
    const raw = fs.readFileSync(path.join(coreSrc, name), 'utf8');
    const stripped = stripTypeScriptTypes(raw, { mode: 'strip' });
    // Remove relative `./*.ts` imports since the four modules are concatenated in dependency order
    const withoutLocalImports = stripped.replace(/^\s*import\s+[\s\S]*?from\s+['"]\.\/[^'"]+['"];?\s*$/gm, '');
    chunks.push(`// --- ${name} ---\n${withoutLocalImports.trim()}`);
  }
  return chunks.join('\n\n') + '\n';
}

function buildBrowserEngine() {
  const combined = buildCoreSingleFileSource();
  for (const targetRel of [
    path.join('apps', 'web', 'src', 'assets', 'nb-speak-browser.js'),
    path.join('docs', 'assets', 'nb-speak-browser.js'),
  ]) {
    const outPath = path.join(ROOT, targetRel);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, combined, 'utf8');
  }
}

function buildStandaloneCoreConsumerPackage(pkgDirName, { syncSkill = false } = {}) {
  const pkgRoot = path.join(ROOT, 'packages', pkgDirName);
  const pkgSrc = path.join(pkgRoot, 'src');
  const pkgDist = path.join(pkgRoot, 'dist');
  if (!fs.existsSync(pkgSrc)) return 0;

  fs.mkdirSync(pkgDist, { recursive: true });
  fs.writeFileSync(path.join(pkgDist, 'core.js'), buildCoreSingleFileSource(), 'utf8');

  let count = 0;
  for (const entry of fs.readdirSync(pkgSrc, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    const tsCode = fs.readFileSync(path.join(pkgSrc, entry.name), 'utf8');
    const jsRaw = stripTypeScriptTypes(tsCode, { mode: 'strip' });
    const jsCode = jsRaw
      .replace(/(from\s+['"])\.\.\/\.\.\/core\/src\/(?:protocol|lint|parser|format)\.ts(['"])/g, '$1./core.js$2')
      .replace(/(from\s+['"]\.\/[^'"]+)\.ts(['"])/g, '$1.js$2');
    fs.writeFileSync(path.join(pkgDist, entry.name.replace(/\.ts$/, '.js')), jsCode, 'utf8');
    count += 1;
  }

  if (syncSkill) {
    const skillSrc = path.join(ROOT, 'skills', 'chat-human');
    const skillDest = path.join(pkgRoot, 'skills', 'chat-human');
    if (fs.existsSync(skillSrc)) {
      fs.rmSync(skillDest, { recursive: true, force: true });
      copyDirRecursive(skillSrc, skillDest);
    }
  }
  return count;
}

function syncPythonIntegrations() {
  const lintSrc = path.join(ROOT, 'skills', 'chat-human', 'scripts', 'bubble_lint.py');
  const skillMdSrc = path.join(ROOT, 'skills', 'chat-human', 'SKILL.md');
  const astrRoot = path.join(ROOT, 'integrations', 'astrbot_plugin_nb_speak');
  const formatterSrc = path.join(astrRoot, 'formatter.py');

  // 1. AstrBot plugin
  if (fs.existsSync(astrRoot)) {
    if (fs.existsSync(lintSrc)) {
      fs.copyFileSync(lintSrc, path.join(astrRoot, 'bubble_lint.py'));
    }
    if (fs.existsSync(skillMdSrc)) {
      const astrSkillDir = path.join(astrRoot, 'skills', 'chat-human');
      fs.mkdirSync(astrSkillDir, { recursive: true });
      fs.copyFileSync(skillMdSrc, path.join(astrSkillDir, 'SKILL.md'));
    }
  }

  // 2. LangBot v4+ plugin (shares canonical bubble_lint.py + formatter.py)
  const langbotRoot = path.join(ROOT, 'integrations', 'langbot_plugin_nb_speak');
  if (fs.existsSync(langbotRoot)) {
    if (fs.existsSync(lintSrc)) {
      fs.copyFileSync(lintSrc, path.join(langbotRoot, 'bubble_lint.py'));
    }
    if (fs.existsSync(formatterSrc)) {
      fs.copyFileSync(formatterSrc, path.join(langbotRoot, 'formatter.py'));
    }
    if (fs.existsSync(skillMdSrc)) {
      const lbSkillDir = path.join(langbotRoot, 'skills', 'chat-human');
      fs.mkdirSync(lbSkillDir, { recursive: true });
      fs.copyFileSync(skillMdSrc, path.join(lbSkillDir, 'SKILL.md'));
    }
  }

  // 3. NoneBot2 plugin (shares canonical bubble_lint.py + formatter.py inside package dir)
  const nonebotPkgDir = path.join(ROOT, 'integrations', 'nonebot_plugin_nb_speak', 'nonebot_plugin_nb_speak');
  if (fs.existsSync(nonebotPkgDir)) {
    if (fs.existsSync(lintSrc)) {
      fs.copyFileSync(lintSrc, path.join(nonebotPkgDir, 'bubble_lint.py'));
    }
    if (fs.existsSync(formatterSrc)) {
      fs.copyFileSync(formatterSrc, path.join(nonebotPkgDir, 'formatter.py'));
    }
  }
}

function copyDirRecursive(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, entry.name);
    const d = path.join(destDir, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

const webOnly = process.argv.includes('--web-only');

let coreCount = 0;
let dshCount = 0;
let openClawCount = 0;
let mcpCount = 0;
let koishiCount = 0;
if (!webOnly) {
  coreCount = compileDir(
    path.join(ROOT, 'packages', 'core', 'src'),
    path.join(ROOT, 'packages', 'core', 'dist'),
  );
  dshCount = compileDir(
    path.join(ROOT, 'packages', 'dsh-plugin', 'src'),
    path.join(ROOT, 'packages', 'dsh-plugin', 'dist'),
  );
  buildDshClientBundle();
  openClawCount = buildStandaloneCoreConsumerPackage('openclaw-plugin', { syncSkill: true });
  mcpCount = buildStandaloneCoreConsumerPackage('mcp-server', { syncSkill: true });
  koishiCount = buildStandaloneCoreConsumerPackage('koishi-plugin', { syncSkill: false });
  syncPythonIntegrations();
}
buildBrowserEngine();
copyDirRecursive(path.join(ROOT, 'apps', 'web', 'src'), path.join(ROOT, 'docs'));
for (const geoName of ['llms.txt', 'llms-full.txt']) {
  const rootGeo = path.join(ROOT, geoName);
  if (fs.existsSync(rootGeo)) {
    fs.copyFileSync(rootGeo, path.join(ROOT, 'docs', geoName));
  }
}

console.log(
  webOnly
    ? 'Synced browser engine and apps/web/src -> docs/ (--web-only).'
    : `Built @nb-corp/nb-speak (${coreCount}), dsh (${dshCount}), openclaw (${openClawCount}), mcp (${mcpCount}), koishi (${koishiCount}), and synced Python/docs.`,
);
