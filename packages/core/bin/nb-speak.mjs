#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const binDir = path.dirname(fileURLToPath(import.meta.url));
const distCli = path.resolve(binDir, '../dist/cli.js');
const srcCli = path.resolve(binDir, '../src/cli.ts');
const target = fs.existsSync(distCli) ? distCli : srcCli;

const mod = await import(pathToFileURL(target).href);
const code = await mod.runCli(process.argv.slice(2));
if (code !== 0 || process.argv[2] !== 'serve') {
  process.exitCode = code;
}
