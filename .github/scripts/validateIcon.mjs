#!/usr/bin/env node
// アイコン画像（plugin.jsonのiconFileが指す任意ファイル）を簡易検証する（形式・サイズ上限）
//
// iconFileが未指定のプラグインにはこのチェックは適用しない（デフォルトアイコン表示で足りるため）

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const MAX_SIZE_BYTES = 512 * 1024; // 512KB

const [, , pluginDir] = process.argv;
if (!pluginDir) {
  console.error('Usage: node validateIcon.mjs <plugin-directory>');
  process.exit(1);
}

const manifestPath = path.join(pluginDir, 'plugin.json');
if (!existsSync(manifestPath)) {
  console.error(`NG: plugin.jsonが見つかりません: ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (!manifest.iconFile) {
  console.log('SKIP: iconFileが指定されていないためアイコン検証は対象外です');
  process.exit(0);
}

const iconPath = path.join(pluginDir, manifest.iconFile);
if (!existsSync(iconPath)) {
  console.error(`NG: iconFileで指定された画像が見つかりません: ${iconPath}`);
  process.exit(1);
}

const bytes = readFileSync(iconPath);

if (bytes.length > MAX_SIZE_BYTES) {
  console.error(
    `NG: アイコン画像のサイズが上限（${MAX_SIZE_BYTES}バイト）を超えています: ${bytes.length}バイト`,
  );
  process.exit(1);
}

const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
const isGif = bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;

if (!isPng && !isJpeg && !isGif) {
  console.error(`NG: アイコン画像はPNG/JPEG/GIF形式である必要があります: ${iconPath}`);
  process.exit(1);
}

// raw.githubusercontent.comはContent-Typeを実バイトではなく拡張子から決定し、かつ
// `X-Content-Type-Options: nosniff`を付与するため、拡張子が実形式と食い違っていると
// ブラウザが画像として表示できない（アプリ側でも同様の事前検証を行っているが、CIでも
// 最終防衛線として検証する）
const lowerPath = iconPath.toLowerCase();
const extensionMatches =
  (isPng && lowerPath.endsWith('.png')) ||
  (isJpeg && (lowerPath.endsWith('.jpg') || lowerPath.endsWith('.jpeg'))) ||
  (isGif && lowerPath.endsWith('.gif'));

if (!extensionMatches) {
  console.error(
    `NG: iconFileの拡張子が実際の画像形式と一致していません（表示に失敗するため必須）: ${iconPath}`,
  );
  process.exit(1);
}

console.log(`OK: ${iconPath}`);
