# RelationalDocuments プラグイン開発ガイド

## 1. プラグインとは／対応ランタイム

RelationalDocumentsのプラグインは、文書へのアノテーション付与・変更・削除や、関係性の作成・削除を自動化するための拡張機能です。現在サポートしているランタイムは次の通りです。

| ランタイム | 状態                   | 推奨ツールチェイン                                                                                  |
| ---------- | ---------------------- | --------------------------------------------------------------------------------------------------- |
| `wasm`     | 実装済み               | [AssemblyScript](https://www.assemblyscript.org/)（推奨。本ガイドはAssemblyScriptを前提に説明する） |
| `pyodide`  | 未実装（今後対応予定） | —                                                                                                   |

WASMプラグインは技術的にはAssemblyScript以外（Rust/wasm-bindgen等）でもビルド可能ですが、本体アプリのホストAPI呼び出し規約（§7参照）は現状AssemblyScriptのランタイム規約に依拠しているため、**現時点ではAssemblyScriptでのビルドを強く推奨します**。

## 2. `plugin.json`仕様

`plugin.json`はプラグインの**静的**メタ情報のみを持ちます。**エントリポイントや入力項目は含まれません**（§3参照）。

```json
{
  "id": "your-plugin-id",
  "name": "プラグイン名",
  "version": "1.0.0",
  "description": "プラグインの説明",
  "runtime": "wasm",
  "mainFile": "your_plugin.wasm",
  "iconFile": "icon.png",
  "owner": "your-github-login",
  "requiredHostApis": ["ui.reportProgress", "plan.addAnnotation"]
}
```

| フィールド         | 型                      | 説明                                                                                                      |
| ------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `id`               | string                  | プラグインの識別子。`plugins/<id>/`のフォルダ名と一致させること                                           |
| `name`             | string                  | 表示名                                                                                                    |
| `version`          | string                  | バージョン文字列                                                                                          |
| `description`      | string                  | 説明文                                                                                                    |
| `runtime`          | `"wasm"` \| `"pyodide"` | 実行ランタイム                                                                                            |
| `mainFile`         | string                  | 本体ファイル名（`plugin.json`と同じディレクトリ内）                                                       |
| `iconFile`         | string（任意）          | 一覧表示用アイコン画像のファイル名（`plugin.json`と同じディレクトリ内）。未指定時はデフォルトアイコン表示 |
| `owner`            | string（任意）          | このプラグインを最初に公開したGitHubユーザー名。RelationalDocumentsアプリが申請時に自動設定する           |
| `deprecated`       | boolean（任意）         | `true`の場合、公開を取り下げた（unpublish）プラグインとしてカタログ・検索結果から除外される               |
| `requiredHostApis` | string配列              | 要求する実行時ホストAPI名（§7参照）。最小権限の対象                                                       |

`owner`・`deprecated`は開発者が手で書くものではなく、RelationalDocumentsアプリの申請・取り下げ機能が自動的に設定します（§10参照）。

### アイコン画像の注意点

`iconFile`を指定する場合、以下を満たす必要があります（満たさない場合、CI検証で拒否されます。§11参照）。

- 形式はPNG・JPEG・GIFのいずれか（マジックナンバーで判定されます）
- **ファイルの拡張子が実際の画像形式と一致していること**（例: 実体がJPEGなのに`icon.png`という名前にしない）。これは単なる作法ではなく実害があります。公開後のアイコンは`raw.githubusercontent.com`から配信されますが、このサービスはファイルの中身ではなく**拡張子からContent-Typeを決定**し、かつ`X-Content-Type-Options: nosniff`を付与するため、拡張子と実体が食い違っていると多くのブラウザで画像として表示されず、一覧やインストール済みプラグインの表示が壊れます
- サイズは512KB以下

## 3. 画面構築API（`describePlugin`規約）の書き方

プラグインは`describePlugin`という規約名のエクスポート関数を持ちます。ホストはこの関数を**発見専用**（実データの読み書きをしない）で呼び出し、以下のAPIを使ってエントリポイント・入力項目を宣言させます。

| API名                   | シグネチャ                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `ui.registerEntryPoint` | `(entryId: string, label: string, description: string) -> void`                      |
| `ui.addTextField`       | `(fieldId: string, label: string, defaultValue: string, optional: bool) -> void`     |
| `ui.addNumberField`     | `(fieldId: string, label: string, defaultValue: f64, optional: bool) -> void`        |
| `ui.addToggleField`     | `(fieldId: string, label: string, defaultValue: bool) -> void`                       |
| `ui.addSelectField`     | `(fieldId: string, label: string, optionsCsv: string, defaultValue: string) -> void` |

**`entryId`は実際のエクスポート関数名と完全に一致させること。** ホストは`instance.exports[entryId]`をそのまま呼び出すため、一致していない場合は実行時にエラーになります。

```ts
export function describePlugin(): void {
  registerEntryPoint('stampPageNumbers', 'ページ番号を配置', '各ページにページ番号を配置します');
  addNumberField('startPage', '開始ページ', 1, true);
  addTextField('format', '表示フォーマット', '{n}', true);
  // ...
}
```

**なぜJSONではなくコードで宣言するのか**: `plugin.json`とプラグイン実装が別ファイル・別フォーマットだと、人手で同期を取る限り記述漏れ・型の不一致が起きえます。実装コードの中で宣言すれば、同一ファイル・同一コンパイラの型検査下に置かれ、ズレが起きにくくなります。

**規約上の注意（機構的には強制されません）**: `describePlugin`は発見専用であり、実行時API（§4の「書き込み系」「読み取り系」）を呼び出してはいけません。同一WASMモジュール内に実行時APIを使う別のエクスポート関数がある場合、WASMの仕様上インスタンス化時に全インポートを満たす必要があるため、ホスト側は発見用の呼び出しでもダミー実装を注入します。そのため「発見パスで実行時APIを誤って呼んでしまった場合に即座にリンクエラーになる」という保証はなく、規約違反はコードレビューで防ぐ必要があります。

## 4. 実行時ホストAPIリファレンス

`manifest.requiredHostApis`に列挙したものだけが注入されます（最小権限）。

### 書き込み系（作成・更新・削除。すべて「予定」として積まれるだけで、ユーザー承認後に実データへ反映されます。§5参照）

| API名                      | シグネチャ                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `ui.reportProgress`        | `(percent: i32) -> void`                                                                                                            |
| `plan.setConfirmationMode` | `(mode: string /* 'once' \| 'perItem' */) -> void`                                                                                  |
| `plan.addAnnotation`       | `(page: i32, x: f32, y: f32, width: f32, height: f32, text: string, color: string, fontSize: f32, tagsCsv: string) -> string`       |
| `plan.updateAnnotation`    | `(annotId: string, x: f32, y: f32, width: f32, height: f32, text: string, color: string, fontSize: f32, tagsCsv: string) -> string` |
| `plan.removeAnnotation`    | `(annotId: string) -> string`                                                                                                       |
| `plan.addRelational`       | `(srcAnnotId: string, targetAnnotId: string, ruleType: string /* 'link' \| 'equal' */) -> string`                                   |
| `plan.removeRelational`    | `(srcAnnotId: string, targetAnnotId: string) -> string`                                                                             |

作成されるアノテーションの`author`は常にプラグイン名が自動的に設定されます（なりすまし防止のため、プラグイン側から指定するAPIはありません）。`tagsCsv`（カンマ区切り）はプラグインが自由に設定でき、再実行時に自分が作成した注釈を識別する用途に使えます（§6参照）。

### 読み取り系（文書内容・既存データの参照）

| API名                       | シグネチャ                                    | 内容                                                                          |
| --------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------- |
| `doc.getProjectMetadata`    | `() -> string(JSON)`                          | `{containerId, containerName, filePath, description, genre, tags, pageCount}` |
| `doc.getPageSize`           | `(page: i32) -> string(JSON {width, height})` | 指定ページのサイズ                                                            |
| `doc.getPageTextBlocks`     | `(page: i32) -> string(JSON配列)`             | `[{text, x, y, width, height}]`。位置情報付きテキスト                         |
| `doc.getPageImage`          | `(page: i32) -> string(base64 PNG)`           | 指定ページのレンダリング画像                                                  |
| `doc.getAnnotationsByFile`  | `() -> string(JSON配列)`                      | `[{id, page, x, y, width, height, type, text, author, tags}]`                 |
| `doc.getAnnotationIdsByTag` | `(tag: string) -> string(CSV)`                | 指定タグを持つ既存アノテーションIDのみを返す軽量版                            |

**引用元確認・校閲確認系プラグインの実装例**: `doc.getPageTextBlocks`で対象ページのテキストと位置を取得し、期待する記述と照合、`doc.getAnnotationsByFile`で既存の関連アノテーションを探し、`plan.addRelational`で関係性を提案する、あるいは`plan.updateAnnotation`で検証結果を反映する、という流れになります。`doc.getPageImage`はテキストでは捉えきれない見た目の差分検出（例: 「PDF高精度差分検出」プラグイン）に使えます。

## 5. 実行モデル：Plan → Commit の2段階方式

WASMのホスト関数は同期呼び出しであり、呼び出し中にユーザーのダイアログ操作を待機させることはできません（§7参照）。そのため実行は2段階に分かれます。

1. **Plan段階**（プラグイン実行中）: `plan.*`系APIは実データを書き換えず、「この内容で書き込みたい」という予定を積むだけです。
2. **Commit段階**（プラグイン実行後、ホスト側）: 積まれた予定を`plan.setConfirmationMode`で指定した確認モードに従って処理します。
   - `'once'`: そのラン全体で1回だけ、内容の要約を示す確認ダイアログを表示します。
   - `'perItem'`: プラグイン専用タブ内で1件ずつ承認/却下できます。

`plan.setConfirmationMode`は実行中に何度でも呼び直せます。呼び出し時点のモードが、その時点以降に積まれる予定項目に適用されます。「全ページに一律の変更を加える」ような操作は`'once'`、「1件ずつ人間の目で確認してほしい」操作は`'perItem'`を選ぶとよいでしょう。

## 6. 冪等な再実行パターン

同じ文書に対して設定を変えて何度もプラグインを実行したい場合、前回作成した項目を残したまま新規作成すると重複が生じます。これを避けるため、`tagsCsv`と`doc.getAnnotationIdsByTag`/`plan.removeAnnotation`を組み合わせたパターンを推奨します。

```ts
const MY_TAG = "my-plugin-name";

export function myEntryPoint(/* ... */): i32 {
  // 1. 前回自分が作成した項目を削除予定に積む
  const previousIds = getAnnotationIdsByTag(MY_TAG).split(",");
  for (let i = 0; i < previousIds.length; i++) {
    if (previousIds[i].length > 0) removeAnnotation(previousIds[i]);
  }

  // 2. 新しい内容で作り直す（同じタグを付与する）
  addAnnotation(/* ... */, MY_TAG);
  // ...
}
```

削除予定・作成予定は同一ランの中で混在させられ、同じ確認モードでまとめて1つの確認としてユーザーに提示されます（例: 「前回のN件を削除し、M件を新規作成します」）。

サンプルの`samplePlugins/wasmPageNumberStamper/`がこのパターンの実装例です。

## 7. なぜWASM呼び出し中にユーザー確認をブロッキング待機できないのか

WebAssemblyのインポート関数（ホスト関数）は同期的に呼び出され、呼び出し元のWASM実行スタックはその関数が値を返すまで進みません。一方、ユーザーへの確認ダイアログ表示は本質的に非同期（ユーザーの操作を待つ）です。同期呼び出しの中で非同期処理の完了を literally 待機する手段はありません（`Atomics.wait`等を使うstack-switching技法はありますが、手書き規模のプラグインが前提とするものではありません）。

このため、本体アプリは「plan段階で予定を積むだけ（同期・副作用フリー）」「WASM実行が完了した後、ホスト側が非同期にユーザー確認を行いコミットする」という2段階方式（§5）を採用しています。

## 8. AssemblyScriptでのビルド手順、文字列マーシャリングの制約

```bash
npm install -D assemblyscript
npx asc assembly/index.ts --outFile your_plugin.wasm --exportRuntime --optimize
```

`--exportRuntime`は必須です（本体アプリが`@assemblyscript/loader`経由で文字列の相互変換に使うメモリ管理エクスポート、`__new`/`__pin`/`__unpin`等を出力するため）。

**既知の制約**: 本体アプリの文字列マーシャリング（AssemblyScriptの文字列ポインタとJSの文字列を相互変換する仕組み）は、AssemblyScriptのランタイム規約（`--exportRuntime`が出力するメモリレイアウト）に依拠しています。Rust/wasm-bindgen等、別のABI・別のメモリレイアウトを使うプラグインでは同じ方式では文字列を渡せません。将来的に他のツールチェインに対応する場合は、そのABI専用のアダプタを本体アプリ側に追加する必要があります。

## 9. サンプル解説（`samplePlugins/wasmPageNumberStamper/`）

各ページにページ番号のテキストボックスを配置するサンプルです。

- `describePlugin()`で7つの入力項目（開始ページ・開始番号・表示フォーマット・配置位置・奇偶ミラー・フォントサイズ・文字色）を宣言します。
- `stampPageNumbers(...)`が実際の処理本体です。引数は「システムコンテキスト（ページ数・代表ページサイズ）」＋「`describePlugin`での宣言順のユーザー入力値」の順で渡されます。
- 実行冒頭で`plan.setConfirmationMode("once")`を呼び、全ページ一括の変更であることから1回の確認で済むようにしています。
- `doc.getAnnotationIdsByTag`+`plan.removeAnnotation`で、再実行時に前回分を削除してから作り直します（§6のパターン）。
- 位置・奇偶ミラーの計算はすべてプラグイン内（AssemblyScript）で行い、テキストのフォーマット文字列置換（`{n}`/`{total}`）もプラグイン内で完結させています（本体アプリ側での文字列組み立ては行いません）。

## 10. 申請〜公開・更新・取り下げの流れ

RelationalDocumentsアプリの設定画面でGitHub個人アクセストークン（PAT）を登録すると、アプリ内の「新規プラグインを申請」ダイアログから、このリポジトリへのフォーク作成・ブランチ作成・ファイルコミット・プルリクエスト作成までを自動で行えます（アプリはバックエンドを持たないため、ブラウザから直接GitHub REST APIを呼び出します）。手動でこのリポジトリに直接PRを作成することもできます。

1. マニフェスト（`plugin.json`）・本体ファイル・（任意で）アイコン画像をアプリの申請ダイアログからアップロードすると、あなたのフォーク上にブランチが作成され、このリポジトリへプルリクエストが送られます。新規申請時は`owner`があなたのGitHubユーザー名に自動設定されます。
2. `.github/workflows/validate-plugin-submission.yml`が自動的に`plugin.json`・本体ファイル・アイコン画像を検証し、あわせて**申請者の権限検証**（`validateOwnership.mjs`）を行います。既存プラグインの更新の場合、申請者・新しいmanifestの`owner`・公開済みmanifestの`owner`の3つがすべて一致していない場合は検証NGとなり、悪意あるユーザーによる他人のプラグインの書き換えを防ぎます。
3. 検証に合格したら、アプリの「マージして公開」ボタンでマージを試みられます。**ただし、このリポジトリへの書き込み権限（write/triage以上）を持たない一般の提出者は、GitHubの仕組み上そもそもPRをマージできません**（フォーク元の自分のブランチに書き込む権限があっても、ベースリポジトリのマージ権限とは別物です）。その場合は失敗のメッセージが表示されます。
4. 書き込み権限がない場合は、代わりに「**公開をリクエスト**」ボタンを使ってください。これはマーカー付きのコメントをPRに投稿するだけの操作で、権限がなくても行えます。このリポジトリの`.github/workflows/request-publish-label.yml`がそのコメントを検知し、（リポジトリ自身の権限で）PRに`request-publish`ラベルを自動的に付与します。オーナー・メンテナはこのラベルが付いたPRを見て、マージすべきものをひと目で判別できます。アプリの「マイ申請」一覧でも、ラベルが付くと状態が「マージ待ち」に変わります。
5. バージョンを更新する場合も、同じ手順で新しいファイルを申請してください（申請者は公開者と同一のGitHubアカウントである必要があります）。
6. マージされる前の申請（検証待ち・検証NG・検証OK・マージ待ち）は、アプリから「申請を取り下げる」を実行するとPRをマージせずにクローズできます。
7. 公開を取りやめたい場合は、アプリから「公開を取り下げる」を実行すると`plugin.json`の`deprecated`を`true`にするプルリクエストが作成されます（実ファイルは履歴に残したまま、カタログ・検索結果への表示のみを止めます）。この操作も申請者本人（`owner`と一致するユーザー）のみが行えます。

## 11. ストアリポジトリのCI検証内容

`.github/workflows/validate-plugin-submission.yml`は、変更されたプラグインディレクトリごとに以下を実行します。

| スクリプト               | 検証内容                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `validateManifest.mjs`   | `plugin.json`の必須フィールド・型、`requiredHostApis`が許可リストに含まれるか                |
| `validateWasmBinary.mjs` | WASM本体ファイルのマジックナンバー・サイズ上限（`runtime:"wasm"`のプラグインのみ）           |
| `validateIcon.mjs`       | アイコン画像の形式（PNG/JPEG/GIF）・拡張子と実形式の一致・サイズ上限（`iconFile`指定時のみ） |
| `validateOwnership.mjs`  | 申請者（PR作成者）が`owner`と一致するか（新規申請・更新の両方。§10参照）                     |

いずれか1つでも失敗すると、そのプルリクエストの検証は「検証NG」となりマージできません。

`.github/workflows/request-publish-label.yml`は上記とは別のワークフローで、`issue_comment`（PRへのコメント）をトリガーに動作します。コメントに専用マーカー（`<!-- relational-documents:request-publish -->`）が含まれ、かつ投稿者がそのPRの作成者本人である場合にのみ`request-publish`ラベルを付与します（なりすまし防止のため、マーカーが含まれていても他人のコメントは無視します）。

## 12. 既知の制限

- Pyodide（Python）実行エンジンは未実装です（`samplePlugins/pyEntryPointStub/`は実装イメージのみのサンプルで、実行できません）。
- WASM↔ホスト間で受け渡せるのは文字列・数値・真偽値のみです（配列・オブジェクトはJSON文字列としてやり取りします）。
- 結果表示はプログレスバー・ログ・テキストの3種のみで、テーブル表示は未対応です。
- エントリポイントの引数として、ファイルやアノテーションそのものを直接参照する型はまだありません（現時点ではID文字列を介して`doc.getAnnotationsByFile`等と組み合わせて参照します）。
