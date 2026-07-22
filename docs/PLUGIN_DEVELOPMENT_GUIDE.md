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
  "requiredHostApis": ["ui.reportProgress", "plan.addAnnotation"]
}
```

| フィールド         | 型                      | 説明                                                            |
| ------------------ | ----------------------- | --------------------------------------------------------------- |
| `id`               | string                  | プラグインの識別子。`plugins/<id>/`のフォルダ名と一致させること |
| `name`             | string                  | 表示名                                                          |
| `version`          | string                  | バージョン文字列                                                |
| `description`      | string                  | 説明文                                                          |
| `runtime`          | `"wasm"` \| `"pyodide"` | 実行ランタイム                                                  |
| `mainFile`         | string                  | 本体ファイル名（`plugin.json`と同じディレクトリ内）             |
| `requiredHostApis` | string配列              | 要求する実行時ホストAPI名（§7参照）。最小権限の対象             |

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

**規約上の注意（機構的には強制されません）**: `describePlugin`は発見専用であり、実行時API（§7の「書き込み系」「読み取り系」）を呼び出してはいけません。同一WASMモジュール内に実行時APIを使う別のエクスポート関数がある場合、WASMの仕様上インスタンス化時に全インポートを満たす必要があるため、ホスト側は発見用の呼び出しでもダミー実装を注入します。そのため「発見パスで実行時APIを誤って呼んでしまった場合に即座にリンクエラーになる」という保証はなく、規約違反はコードレビューで防ぐ必要があります。

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

WASMのホスト関数は同期呼び出しであり、呼び出し中にユーザーのダイアログ操作を待機させることはできません（§6参照）。そのため実行は2段階に分かれます。

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

## 10. 申請〜公開の流れ

1. このリポジトリの`plugins/<your-plugin-id>/`にプラグインを配置し、プルリクエストを作成します。
2. `.github/workflows/validate-plugin-submission.yml`が自動的に`plugin.json`・本体ファイルを検証します（実際に動くCIです。RelationalDocumentsアプリ内の申請フローはこれとは別に、実リポジトリが存在しない開発段階向けのモックとして実装されています）。
3. 検証に合格すればレビュー後にマージされ、プラグインが公開されます。

## 11. 既知の制限

- Pyodide（Python）実行エンジンは未実装です（`samplePlugins/pyEntryPointStub/`は実装イメージのみのサンプルで、実行できません）。
- WASM↔ホスト間で受け渡せるのは文字列・数値・真偽値のみです（配列・オブジェクトはJSON文字列としてやり取りします）。
- 結果表示はプログレスバー・ログ・テキストの3種のみで、テーブル表示は未対応です。
- エントリポイントの引数として、ファイルやアノテーションそのものを直接参照する型はまだありません（現時点ではID文字列を介して`doc.getAnnotationsByFile`等と組み合わせて参照します）。
