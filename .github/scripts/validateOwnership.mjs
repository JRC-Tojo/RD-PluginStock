#!/usr/bin/env node
// プラグインの申請者（PR作成者）が、そのプラグインを公開できる権限を持つかを検証する
//
// これがなりすまし防止の実効的な検証（kumihimoアプリ側のチェックはUXのための
// 早期フィードバックに過ぎず、ここが最終防衛線）。ルール:
//   - 新規プラグイン（base側にplugin.jsonが存在しない）: manifest.ownerがPR作成者と一致すること
//   - 既存プラグインの更新: base側のplugin.jsonのownerと、新しいmanifest.ownerと、
//     PR作成者の3つがすべて一致すること（=公開者本人のみが更新できる）

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const [, , pluginDir, baseSha, prAuthor] = process.argv;
if (!pluginDir || !baseSha || !prAuthor) {
  console.error('Usage: node validateOwnership.mjs <plugin-directory> <base-sha> <pr-author>');
  process.exit(1);
}

const manifestPath = path.join(pluginDir, 'plugin.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

/**
 * baseブランチ（マージ先）時点でのplugin.jsonの内容を取得する。存在しない場合はundefined
 * （=新規プラグインの申請）を返す
 */
function readPublishedManifest() {
  const gitPath = path
    .join(pluginDir, 'plugin.json')
    .split(path.sep)
    .join('/');
  try {
    const content = execFileSync('git', ['show', `${baseSha}:${gitPath}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

const published = readPublishedManifest();

if (published === undefined) {
  // 新規プラグイン
  if (manifest.owner !== prAuthor) {
    console.error(
      `NG: 新規プラグインのownerはPR作成者（${prAuthor}）と一致している必要があります（実際: ${manifest.owner ?? '未設定'}）`,
    );
    process.exit(1);
  }
  console.log(`OK: 新規申請（owner: ${manifest.owner}）`);
  process.exit(0);
}

// 既存プラグインの更新
if (published.owner !== prAuthor) {
  console.error(
    `NG: このプラグインは既に別のユーザー（${published.owner ?? '不明'}）が公開しています。更新できるのはそのユーザーのみです（申請者: ${prAuthor}）`,
  );
  process.exit(1);
}

if (manifest.owner !== published.owner) {
  console.error(
    `NG: 既存プラグインのownerを変更することはできません（既存: ${published.owner}、申請内容: ${manifest.owner}）`,
  );
  process.exit(1);
}

console.log(`OK: バージョン更新（owner: ${manifest.owner}）`);
