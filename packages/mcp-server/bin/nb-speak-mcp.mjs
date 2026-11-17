#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const distEntry = path.join(dir, '..', 'dist', 'server.js');
const srcEntry = path.join(dir, '..', 'src', 'server.ts');
const target = fs.existsSync(distEntry) ? distEntry : srcEntry;

const { startMcpStdioServer } = await import(pathToFileURL(target).href);
startMcpStdioServer({ argv: process.argv.slice(2) });
