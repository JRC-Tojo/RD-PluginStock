#!/usr/bin/env node
// plugin.json の内容を検証する（外部依存ライブラリなし。Node標準機能のみで動作する）
//
// 本体アプリ（RelationalDocuments）側の src/models/plugin/manifest.ts が定義する
// PluginHostApiName と、下記 ALLOWED_HOST_APIS は手動で同期している。
// 本体アプリ側でホストAPIを追加・変更した場合は、このリストも合わせて更新すること
// （別リポジトリのため型を共有できない）

import { readFileSync } from 'node:fs';

const ALLOWED_HOST_APIS = [
  'ui.reportProgress',
  'plan.setConfirmationMode',
  'plan.addAnnotation',
  'plan.updateAnnotation',
  'plan.removeAnnotation',
  'plan.addRelational',
  'plan.removeRelational',
  'doc.getProjectMetadata',
  'doc.getPageSize',
  'doc.getPageTextBlocks',
  'doc.getPageImage',
  'doc.getAnnotationsByFile',
  'doc.getAnnotationIdsByTag',
];

// entryPointsは含まれない点に注意（エントリポイントはWASM自身がdescribePluginで
// 実行時に自己申告するため、plugin.jsonには静的記述しない）
const REQUIRED_STRING_FIELDS = ['id', 'name', 'version', 'runtime', 'mainFile'];

let hasError = false;
function fail(message) {
  console.error(`NG: ${message}`);
  hasError = true;
}

const [, , manifestPath] = process.argv;
if (!manifestPath) {
  console.error('Usage: node validateManifest.mjs <path-to-plugin.json>');
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (e) {
  fail(`plugin.jsonの読み込み・パースに失敗しました: ${e.message}`);
  process.exit(1);
}

for (const field of REQUIRED_STRING_FIELDS) {
  if (typeof manifest[field] !== 'string' || manifest[field].length === 0) {
    fail(`必須フィールド "${field}" が不正です（非空の文字列が必要）`);
  }
}

if (manifest.runtime !== 'wasm' && manifest.runtime !== 'pyodide') {
  fail(`runtimeは"wasm"または"pyodide"である必要があります（実際: ${manifest.runtime}）`);
}

if (manifest.requiredHostApis !== undefined) {
  if (!Array.isArray(manifest.requiredHostApis)) {
    fail('requiredHostApisは配列である必要があります');
  } else {
    for (const api of manifest.requiredHostApis) {
      if (!ALLOWED_HOST_APIS.includes(api)) {
        fail(`requiredHostApisに未知のAPI "${api}" が含まれています`);
      }
    }
  }
}

if (manifest.iconFile !== undefined && typeof manifest.iconFile !== 'string') {
  fail('iconFileは文字列（ファイル名）である必要があります');
}

if (manifest.owner !== undefined && typeof manifest.owner !== 'string') {
  fail('ownerは文字列（GitHubユーザー名）である必要があります');
}

if (manifest.deprecated !== undefined && typeof manifest.deprecated !== 'boolean') {
  fail('deprecatedはbooleanである必要があります');
}

if (hasError) {
  process.exit(1);
}
console.log(`OK: ${manifestPath}`);
