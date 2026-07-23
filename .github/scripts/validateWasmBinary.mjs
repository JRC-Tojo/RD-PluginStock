#!/usr/bin/env node
// WASMバイナリの妥当性を簡易検証する（マジックナンバー・サイズ上限）
//
// このチェックはWASMバイナリ形式そのものだけを見るため、生成に使った言語
// （Rust/C/AssemblyScript等）を問わない。runtimeが"pyodide"のプラグイン
// （.wasmを持たない）にはこのチェックは適用しない

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const WASM_MAGIC_NUMBER = [0x00, 0x61, 0x73, 0x6d];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

const [, , pluginDir] = process.argv;
if (!pluginDir) {
  console.error('Usage: node validateWasmBinary.mjs <plugin-directory>');
  process.exit(1);
}

const manifestPath = path.join(pluginDir, 'plugin.json');
if (!existsSync(manifestPath)) {
  console.error(`NG: plugin.jsonが見つかりません: ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.runtime !== 'wasm') {
  console.log(`SKIP: runtime="${manifest.runtime}"のためWASM検証は対象外です`);
  process.exit(0);
}

const wasmPath = path.join(pluginDir, manifest.mainFile ?? '');
if (!existsSync(wasmPath)) {
  console.error(`NG: 本体ファイルが見つかりません: ${wasmPath}`);
  process.exit(1);
}

const bytes = readFileSync(wasmPath);

if (bytes.length > MAX_SIZE_BYTES) {
  console.error(
    `NG: ファイルサイズが上限（${MAX_SIZE_BYTES}バイト）を超えています: ${bytes.length}バイト`,
  );
  process.exit(1);
}

const hasMagicNumber = WASM_MAGIC_NUMBER.every((b, i) => bytes[i] === b);
if (!hasMagicNumber) {
  console.error(`NG: WASMマジックナンバーが不正です: ${wasmPath}`);
  process.exit(1);
}

console.log(`OK: ${wasmPath}`);
