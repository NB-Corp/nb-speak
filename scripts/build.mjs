#!/usr/bin/env node
/**
 * Zero-dependency build script using Node >=22.19 built-in `stripTypeScriptTypes`.
 * 1. Compiles `packages/core/src/*.ts` -> `packages/core/dist/*.js`
 * 2. Compiles `packages/dsh-plugin/src/*.ts` -> `packages/dsh-plugin/dist/*.js`
 * 3. Emits browser-safe `docs/assets/nb-speak-browser.js` directly from `packages/core/src/{protocol,lint,parser}.ts`
 *    so the Web Playground runs the exact same production engine with zero duplicate mock logic.
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

function buildBrowserEngine() {
  const coreSrc = path.join(ROOT, 'packages', 'core', 'src');
  const files = ['protocol.ts', 'lint.ts', 'parser.ts'];
  const chunks = [
    '// Auto-generated from @nb-corp/nb-speak packages/core/src/{protocol,lint,parser}.ts — DO NOT HAND-EDIT',
  ];
  for (const name of files) {
    const raw = fs.readFileSync(path.join(coreSrc, name), 'utf8');
    const stripped = stripTypeScriptTypes(raw, { mode: 'strip' });
    // Remove relative `./*.ts` imports since the three modules are concatenated in dependency order
    const withoutLocalImports = stripped.replace(/^\s*import\s+[\s\S]*?from\s+['"]\.\/[^'"]+['"];?\s*$/gm, '');
    chunks.push(`// --- ${name} ---\n${withoutLocalImports.trim()}`);
  }
  const combined = chunks.join('\n\n') + '\n';
  for (const targetRel of [
    path.join('apps', 'web', 'src', 'assets', 'nb-speak-browser.js'),
    path.join('docs', 'assets', 'nb-speak-browser.js'),
  ]) {
    const outPath = path.join(ROOT, targetRel);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, combined, 'utf8');
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
    : `Built @nb-corp/nb-speak (${coreCount} files), @nb-corp/nb-speak-dsh (${dshCount} files), and synced docs/.`,
);
