# RelationalDocuments プラグイン開発ガイド

## 1. プラグインとは／対応ランタイム

RelationalDocumentsのプラグインは、文書へのアノテーション付与・変更・削除や、関係性の作成・削除を自動化するための拡張機能です。現在サポートしているランタイムは次の通りです。

| ランタイム | 状態                   | 対応言語                                                                            |
| ---------- | ---------------------- | ----------------------------------------------------------------------------------- |
| `wasm`     | 実装済み               | WASM（WebAssembly）へコンパイルできる言語であれば特定の言語に限定されない（§3参照） |
| `pyodide`  | 未実装（今後対応予定） | —                                                                                   |

`wasm`ランタイムは特定の言語ランタイムに依存しない**言語非依存の呼び出し規約**（§3参照）を採用しており、Rust・C・Zig等、WASMへコンパイルできる言語であれば利用できます。本ガイドはRustを例に説明しますが、規約さえ満たせば他の言語でも構いません。

## 2. `plugin.json`仕様

`plugin.json`はプラグインの**静的**メタ情報のみを持ちます。**エントリポイントや入力項目は含まれません**（§4参照）。

```json
{
  "id": "00000000-0000-4000-8000-000000000000",
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

> **`id`は開発者が決める値ではありません。** RelationalDocumentsアプリの申請機能が、新規プラグインの初回申請時に`crypto.randomUUID()`で自動採番し、`plugin.json`の`id`とストア上のディレクトリ名（`plugins/<id>/`）を上書きします。ローカルでのサイドロード開発・動作確認のためだけに、上記例のような適当なUUID（v4）形式の仮の値を置いておいてください。バージョン更新時は、初回申請時に割り当てられた`id`（申請結果や公開済みの`plugin.json`から確認できます）をそのまま使う必要があります。

| フィールド         | 型                      | 説明                                                                                                      |
| ------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `id`               | string（UUID v4）       | プラグインの識別子。開発者は選べず、初回申請時にアプリが自動採番する（`plugins/<id>/`のフォルダ名と一致） |
| `name`             | string                  | 表示名                                                                                                    |
| `version`          | string                  | バージョン文字列                                                                                          |
| `description`      | string                  | 説明文                                                                                                    |
| `runtime`          | `"wasm"` \| `"pyodide"` | 実行ランタイム                                                                                            |
| `mainFile`         | string                  | 本体ファイル名（`plugin.json`と同じディレクトリ内）                                                       |
| `iconFile`         | string（任意）          | 一覧表示用アイコン画像のファイル名（`plugin.json`と同じディレクトリ内）。未指定時はデフォルトアイコン表示 |
| `owner`            | string（任意）          | このプラグインを最初に公開したGitHubユーザー名。RelationalDocumentsアプリが申請時に自動設定する           |
| `deprecated`       | boolean（任意）         | `true`の場合、公開を取り下げた（unpublish）プラグインとしてカタログ・検索結果から除外される               |
| `requiredHostApis` | string配列              | 要求する実行時ホストAPI名（§5参照）。最小権限の対象                                                       |

`owner`・`deprecated`は開発者が手で書くものではなく、RelationalDocumentsアプリの申請・取り下げ機能が自動的に設定します（§11参照）。

### アイコン画像の注意点

`iconFile`を指定する場合、以下を満たす必要があります（満たさない場合、CI検証で拒否されます。§12参照）。

- 形式はPNG・JPEG・GIFのいずれか（マジックナンバーで判定されます）
- **ファイルの拡張子が実際の画像形式と一致していること**（例: 実体がJPEGなのに`icon.png`という名前にしない）。これは単なる作法ではなく実害があります。公開後のアイコンは`raw.githubusercontent.com`から配信されますが、このサービスはファイルの中身ではなく**拡張子からContent-Typeを決定**し、かつ`X-Content-Type-Options: nosniff`を付与するため、拡張子と実体が食い違っていると多くのブラウザで画像として表示されず、一覧やインストール済みプラグインの表示が壊れます
- サイズは512KB以下

## 3. WASMプラグインの呼び出し規約（言語非依存ABI）

WASMの数値型（i32/i64/f32/f64）では文字列を直接やり取りできないため、本体アプリと文字列を交換するには次の規約に従う必要があります。これは特定言語のランタイムには依存しない、C言語ABI相当の単純な取り決めです。

- **文字列はすべて「NUL終端のUTF-8バイト列」として、プラグイン自身のリニアメモリ上に置かれる。** 関数の引数・返り値では、その先頭バイトへのポインタ（WASMの`i32`）としてやり取りする
- プラグインは以下の2つを必ずエクスポートすること:
  - **`memory`**（線形メモリ）— ほとんどの言語・ツールチェインで既定でエクスポートされる
  - **`alloc(size: i32) -> i32`** — ホストがプラグインへ文字列を渡す必要がある場合（エントリポイントの文字列引数、ホストAPI呼び出しの文字列の返り値）に、書き込み先の確保のため呼び出される
- 数値（i32/f32/f64）・真偽値（i32として0/1）はそのままWASMのネイティブ型としてやり取りされ、変換は不要

`alloc`が返した領域を解放（free）する仕組みは要求しません。1回のプラグイン実行（`describePlugin`呼び出し、またはエントリポイント1回の実行）ごとに毎回新しいWASMインスタンスが生成されるため、確保した領域は実行終了とともに丸ごと破棄されます。

この規約はRust・C・Zig等、WASMへコンパイルできる大半の言語で実装できます。Rustであれば標準ライブラリの`std::alloc::alloc`と`CString`/`CStr`だけで実装でき、追加のクレートは不要です（§8のサンプル参照）。

## 4. 画面構築API（`describePlugin`規約）の書き方

プラグインは`describePlugin`という規約名のエクスポート関数を持ちます。ホストはこの関数を**発見専用**（実データの読み書きをしない）で呼び出し、以下のAPIを使ってエントリポイント・入力項目を宣言させます（文字列引数はすべて§3の規約に従うNUL終端UTF-8ポインタです）。

| API名                   | シグネチャ                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `ui.registerEntryPoint` | `(entryId: string, label: string, description: string) -> void`                      |
| `ui.addTextField`       | `(fieldId: string, label: string, defaultValue: string, optional: bool) -> void`     |
| `ui.addNumberField`     | `(fieldId: string, label: string, defaultValue: f64, optional: bool) -> void`        |
| `ui.addToggleField`     | `(fieldId: string, label: string, defaultValue: bool) -> void`                       |
| `ui.addSelectField`     | `(fieldId: string, label: string, optionsCsv: string, defaultValue: string) -> void` |
| `ui.addFileField`       | `(fieldId: string, label: string, optional: bool) -> void`                           |

**`entryId`は実際のエクスポート関数名と完全に一致させること。** ホストは`instance.exports[entryId]`をそのまま呼び出すため、一致していない場合は実行時にエラーになります。

### 処理対象文書の指定（`ui.addFileField`）

他の入力項目とは異なり、`file`型のフィールドは**処理対象の文書そのものを選択させる**ための特別な項目です。以前のバージョンでは「現在アクティブなタブの文書」が暗黙的に対象となっていましたが、複数文書を扱うプラグインを見据え、**対象文書は`ui.addFileField`で明示的に宣言し、ユーザーがファイル選択ダイアログで選ぶ**方式に変更されました。

- ユーザーが選択したファイルは、ホストが実行前に解決し、`doc.*`（読み取り系）・`plan.*`（書き込み系）の各ホストAPIが暗黙的にそのファイルを対象として動作します。
- **他の入力項目と異なり、`file`型フィールドの値はエントリポイント本体のWASM引数には一切現れません。** WASMは文字列・数値・真偽値しかやり取りできず、ファイルそのものを渡す手段がないためです（§9参照）。エントリポイントの引数リストを組み立てる際、`file`型フィールドは自動的に除外されます。
- 必須（`optional: false`）にした場合、ユーザーが未選択のまま実行しようとするとホスト側の画面でエラーとなり、エントリポイントは呼び出されません。

**複数の文書を扱うプラグイン（例: 新旧比較・差分検出）は、`add_file_field`を複数回呼べば実現できます。** `describePlugin`での宣言順（0始まり）がそのまま`fileIndex`になり、`doc.*`/`plan.addAnnotation`系ホストAPIの`fileIndex`引数でどのファイルを対象とするかを指定します（詳細は§5「複数文書のアドレッシング」参照）。

```rust
add_file_field("targetDoc", "対象文書", /* optional: */ false);
```

```rust
#[no_mangle]
pub extern "C" fn describePlugin() {
    unsafe {
        // register_entry_point / add_number_field 等は、CStringへの変換を
        // 引き受ける小さなラッパー関数（§8参照）
        register_entry_point("stampPageNumbers", "ページ番号を配置", "各ページにページ番号を配置します");
        add_number_field("startPage", "開始ページ", 1.0, true);
        add_text_field("format", "表示フォーマット", "{n}", true);
        // ...
    }
}
```

**なぜJSONではなくコードで宣言するのか**: `plugin.json`とプラグイン実装が別ファイル・別フォーマットだと、人手で同期を取る限り記述漏れ・型の不一致が起きえます。実装コードの中で宣言すれば、同一ファイル・同一コンパイラの型検査下に置かれ、ズレが起きにくくなります。

**規約上の注意（機構的には強制されません）**: `describePlugin`は発見専用であり、実行時API（§5の「書き込み系」「読み取り系」）を呼び出してはいけません。同一WASMモジュール内に実行時APIを使う別のエクスポート関数がある場合、WASMの仕様上インスタンス化時に全インポートを満たす必要があるため、ホスト側は発見用の呼び出しでもダミー実装を注入します。そのため「発見パスで実行時APIを誤って呼び出した場合に即座にリンクエラーになる」という保証は機構的には持たず、規約違反はコードレビューで防ぐ必要があります。

## 5. 実行時ホストAPIリファレンス

`manifest.requiredHostApis`に列挙したものだけが注入されます（最小権限）。文字列はすべて§3の規約に従うNUL終端UTF-8ポインタです。

### 複数文書のアドレッシング（`fileIndex`）

`file`型フィールドを複数宣言した場合、`fileIndex`は**`describePlugin`での宣言順（0始まり）**に対応します。例えば`add_file_field("oldDoc", ...)`の後に`add_file_field("newDoc", ...)`を宣言した場合、`oldDoc`が`fileIndex=0`、`newDoc`が`fileIndex=1`です。

- **新規作成系（`plan.addAnnotation`）・読み取り系（`doc.*`）は`fileIndex`引数を取ります。** どのファイルに対する操作かが呼び出し側から明示的にわからないため（新規注釈にはまだIDがなく、読み取りは常にどれかのファイルを指定する必要があるため）必須の引数です。
- **変更・削除系（`plan.updateAnnotation`/`plan.removeAnnotation`）は`fileIndex`引数を取りません。** 対象`annotId`が実際にどのファイルに属するかは、ホストが実行前に全対象ファイル分の既存アノテーションを先読みしており、そこから自動的に解決します（`annotId`はシステム全体で一意なため、プラグイン側が所属ファイルを意識する必要がありません）。
- `plan.addRelational`/`plan.removeRelational`はそもそも`AnnotationID`同士の関係のみを扱うため`fileIndex`は不要です。
- エントリポイント呼び出し時の先頭システムコンテキスト引数（`targetFileCount`、§9参照）で、実際に選択された対象文書の件数を受け取れます。

### 書き込み系（作成・更新・削除。すべて「予定」として積まれるだけで、ユーザー承認後に実データへ反映されます。§6参照）

| API名                      | シグネチャ                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui.reportProgress`        | `(percent: i32) -> void`                                                                                                                        |
| `ui.log`                   | `(message: string) -> void`                                                                                                                    |
| `ui.reportError`           | `(message: string) -> void`                                                                                                                     |
| `plan.setConfirmationMode` | `(mode: string /* 'once' \| 'perItem' */) -> void`                                                                                              |
| `plan.addAnnotation`       | `(fileIndex: i32, page: i32, x: f32, y: f32, width: f32, height: f32, text: string, color: string, fontSize: f32, tagsCsv: string) -> string`   |
| `plan.updateAnnotation`    | `(annotId: string, x: f32, y: f32, width: f32, height: f32, text: string, color: string, fontSize: f32, tagsCsv: string) -> string`             |
| `plan.removeAnnotation`    | `(annotId: string) -> string`                                                                                                                   |
| `plan.addRelational`       | `(srcAnnotId: string, targetAnnotId: string, ruleType: string /* 'link' \| 'equal' */) -> string`                                               |
| `plan.removeRelational`    | `(srcAnnotId: string, targetAnnotId: string) -> string`                                                                                         |

作成されるアノテーションの`author`は常にプラグイン名が自動的に設定されます（なりすまし防止のため、プラグイン側から指定するAPIはありません）。`tagsCsv`（カンマ区切り）はプラグインが自由に設定でき、再実行時に自分が作成した注釈を識別する用途に使えます（§7参照）。

### 進捗・ログ・エラーの使い分け

実行結果はプラグインタブに「進捗バー」「ログ」「テキスト」の3種のブロックとして表示されます（§6参照）。用途に応じて使い分けてください。

- **`ui.reportProgress(percent)`** — 単一の進捗バーです。何度呼んでも1つのバーの値が更新されるだけで、履歴は残りません（全ページ処理のような「今どれくらい進んだか」を示す用途）。
- **`ui.log(message)`** — 1回呼ぶごとに1行追加される、蓄積型のログです。「何ページ目を処理した」「何件の差分を検出した」といった、実行中の経過を後から確認できる記録を残したい場合に使います。
- **`ui.reportError(message)`** — プラグイン自身が「このランは失敗した」と判断した場合に呼びます。WASMの呼び出し自体が正常に完了していても、これを呼ぶとホスト側はラン全体を失敗（`status: 'error'`）扱いにし、`message`をエラー表示（赤色の強調）でプラグインタブに表示します。入力値の検証エラーなど、`panic`させずに分かりやすい理由を利用者へ伝えたい場合に使ってください（`panic`はWASMのトラップとなり、`実行エラー: ...`という汎用メッセージしか表示できません）。

**重要な制約**: WASMのホスト関数呼び出しは同期的であり、エントリポイントは1回の呼び出しで完結して実行されます。そのため、これらのブロックは**実行が完了した後にまとめて**プラグインタブへ反映されます（進捗バーが実行中にリアルタイムでアニメーションすることはありません）。開発中に「ホスト側との通信で何が起きているか」を追いたい場合は、ブラウザの開発者コンソールを開いてください。すべてのホストAPI呼び出しが`[plugin-host] <API名> <引数> -> <戻り値>`という形式でログ出力されます。

### 読み取り系（文書内容・既存データの参照）

| API名                       | シグネチャ                                                | 内容                                                                          |
| --------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `doc.getProjectMetadata`    | `(fileIndex: i32) -> string(JSON)`                          | `{containerId, containerName, filePath, description, genre, tags, pageCount}` |
| `doc.getPageSize`           | `(fileIndex: i32, page: i32) -> string(JSON {width, height})` | 指定ファイル・ページのサイズ                                                  |
| `doc.getPageTextBlocks`     | `(fileIndex: i32, page: i32) -> string(JSON配列)`           | `[{text, x, y, width, height}]`。位置情報付きテキスト                         |
| `doc.getPageImage`          | `(fileIndex: i32, page: i32) -> string(base64 PNG)`         | 指定ファイル・ページのレンダリング画像                                        |
| `doc.getAnnotationsByFile`  | `(fileIndex: i32) -> string(JSON配列)`                      | `[{id, page, x, y, width, height, type, text, author, tags}]`                 |
| `doc.getAnnotationIdsByTag` | `(fileIndex: i32, tag: string) -> string(CSV)`              | 指定ファイルのうち、指定タグを持つ既存アノテーションIDのみを返す軽量版        |

**引用元確認・校閲確認系プラグインの実装例**: `doc.getPageTextBlocks`で対象ページのテキストと位置を取得し、期待する記述と照合、`doc.getAnnotationsByFile`で既存の関連アノテーションを探し、`plan.addRelational`で関係性を提案する、あるいは`plan.updateAnnotation`で検証結果を反映する、という流れになります。`doc.getPageImage`はテキストでは捉えきれない見た目の差分検出（例: 「PDF高精度差分検出」プラグイン）に使えます。

**複数文書を横断する実装例**: `PLUGIN_SDK/samples/wasmDocumentDiff/`（§10）は`oldDoc`/`newDoc`の2つの`file`型フィールドを宣言し、`doc.getPageTextBlocks(0, page)`/`doc.getPageTextBlocks(1, page)`で両ファイルの同じページ番号のテキストを取得・比較し、差異があるページの`newDoc`側（`fileIndex=1`）に`plan.addAnnotation`で印を付けます。

## 6. 実行モデル：Plan → Commit の2段階方式

WASMのホスト関数は同期呼び出しであり、呼び出し中にユーザーのダイアログ操作を待機させることはできません（§9参照）。そのため実行は2段階に分かれます。

1. **Plan段階**（プラグイン実行中）: `plan.*`系APIは実データを書き換えず、「この内容で書き込みたい」という予定を積むだけです。
2. **Commit段階**（プラグイン実行後、ホスト側）: 積まれた予定を`plan.setConfirmationMode`で指定した確認モードに従って処理します。
   - `'once'`: そのラン全体で1回だけ、内容の要約を示す確認ダイアログを表示します。
   - `'perItem'`: プラグイン専用タブ内で1件ずつ承認/却下できます。

`plan.setConfirmationMode`は実行中に何度でも呼び直せます。呼び出し時点のモードが、その時点以降に積まれる予定項目に適用されます。「全ページに一律の変更を加える」ような操作は`'once'`、「1件ずつ人間の目で確認してほしい」操作は`'perItem'`を選ぶとよいでしょう。

## 7. 冪等な再実行パターン

同じ文書に対して設定を変えて何度もプラグインを実行したい場合、前回作成した項目を残したまま新規作成すると重複が生じます。これを避けるため、`tagsCsv`と`doc.getAnnotationIdsByTag`/`plan.removeAnnotation`を組み合わせたパターンを推奨します。

```rust
const MY_TAG: &str = "my-plugin-name";
const FILE_INDEX: i32 = 0; // 対象文書が1つだけの場合は常に0

// 1. 前回自分が作成した項目を削除予定に積む
let previous_ids = read_c_string(doc_get_annotation_ids_by_tag(FILE_INDEX, to_c_string(MY_TAG).as_ptr() as *const u8));
for id in previous_ids.split(',') {
    if !id.is_empty() {
        plan_remove_annotation(to_c_string(id).as_ptr() as *const u8);
    }
}

// 2. 新しい内容で作り直す（同じタグを付与する）
plan_add_annotation(FILE_INDEX, /* ... */, to_c_string(MY_TAG).as_ptr() as *const u8);
```

削除予定・作成予定は同一ランの中で混在させられ、同じ確認モードでまとめて1つの確認としてユーザーに提示されます（例: 「前回のN件を削除し、M件を新規作成します」）。

サンプルの`PLUGIN_SDK/samples/wasmPageNumberStamper/`がこのパターンの実装例です。

## 8. Rustでのビルド手順

`wasm32-unknown-unknown`ターゲットは標準ライブラリ（`String`/`Vec`/ヒープアロケータ）が使えるため、外部クレートなしで単一ファイルのまま`rustc`だけでビルドできます（Cargoは不要です）。

```bash
rustup target add wasm32-unknown-unknown   # 初回のみ
rustc --target wasm32-unknown-unknown -O your_plugin.rs -o your_plugin.wasm
```

### 共有SDK（RD-PluginSDKリポジトリの`rust/host_sdk.rs`）を使う

§3の文字列マーシャリング規約（`alloc`エクスポート、NUL終端UTF-8ポインタの読み書き）と、§4・§5のホストAPIの`extern "C"`宣言は、プラグインの業務ロジックに一切依存しない定型処理です。これらを毎回プラグインごとに手書きする必要はありません。**RD-PluginSDKリポジトリ（RelationalDocuments本体アプリからは`PLUGIN_SDK`サブモジュールとして参照されます）の`rust/host_sdk.rs`に切り出し済み**のため、Rust製プラグインは`#[path]`属性でこれを`mod`宣言するだけで、以下がすべて安全な（`unsafe`不要な）関数として使えます。

新規プラグインを開発する場合は、RD-PluginSDKリポジトリをクローンし、直下の`main.rs`（空のプラグイン実装テンプレート）に業務ロジックを実装していくのが最も簡単です。すでに`#[path = "rust/host_sdk.rs"] mod host_sdk; use host_sdk::*;`が入っており、以下の関数がそのまま使えます。

- `alloc`エクスポート本体
- 発見専用APIのラッパー（`register_entry_point`/`add_text_field`/`add_number_field`/`add_toggle_field`/`add_select_field`/`add_file_field`）
- 実行時APIのラッパー（`report_progress`/`set_confirmation_mode`/`add_annotation`/`update_annotation`/`remove_annotation`/`add_relational`/`remove_relational`/`get_project_metadata`/`get_page_size`/`get_page_text_blocks`/`get_page_image`/`get_annotations_by_file`/`get_annotation_ids_by_tag`）
- WASM側で文字列ポインタを受け取った際に使う`read_c_string`（`unsafe`が必要なのはこの関数の呼び出し箇所のみです。ホストAPIの呼び出し自体は内部で`unsafe`をラップ済みのため素通しで使えます）

```rust
#![crate_type = "cdylib"]

// SDKリポジトリ直下（main.rs）からの相対パスで共有SDKを取り込む
// （Cargoワークスペースを組まずに複数ファイルを扱うためのRustの標準的な仕組み）
#[path = "rust/host_sdk.rs"]
mod host_sdk;
use host_sdk::*;

#[no_mangle]
pub extern "C" fn describePlugin() {
    register_entry_point("yourEntryPoint", "表示名", "説明文");
    add_file_field("targetDoc", "対象文書", false);
    // ...
}
```

RD-PluginSDKリポジトリ直下の`main.rs`に実装する場合は上記の`#[path = "rust/host_sdk.rs"]`のままで動作します。`samples/`配下のように2階層目のサブディレクトリ（例: `samples/your_plugin/your_plugin.rs`）へ配置する場合は`#[path = "../../rust/host_sdk.rs"]`に調整してください。ディレクトリの深さが異なる場合は、実際の相対パスに合わせて`#[path]`の値を調整します。

**他の言語を使う場合**: 共有SDKはRust専用です。C・Zig等を使う場合は、`wasm_import_module`相当の仕組み（インポートのモジュール名を`host_system`に指定する方法）と`alloc`エクスポートの2点を自身で満たせば、同じ規約で動作します（§3参照）。

### SDK仕様の自動同期（ホスト側とのズレ検知）

`PLUGIN_SDK/rust/host_sdk.rs`の`extern "C"`ブロック（`GENERATED-EXTERN:BEGIN`〜`GENERATED-EXTERN:END`のマーカー区間）は、手書きではなく本体アプリの`src/services/plugin/hostApiRegistry.ts`（ホストが実際に提供する全ホスト関数のシグネチャを定義する唯一の情報源）から`bun run generate:plugin-sdk`で自動生成されています。本体アプリ側のテスト（`src/services/plugin/__test__/hostApiCodegen.test.ts`）が、このマーカー区間とレジストリの内容が常に一致していることを検証するため、**どちらか片方だけを手で変更すると、そのテストが赤くなって気づけます**。

これは、SDKを今後Rust以外の言語にも拡充していく際に、「ホストが実際に提供する関数」と「SDKが期待する関数シグネチャ」が黙って食い違ってしまう（＝実行時に原因不明の引数ズレ・クラッシュを起こす）ことを防ぐための仕組みです。ホストAPIのシグネチャを変更した場合は、本体アプリ側で`bun run generate:plugin-sdk`を実行してSDKを再生成してください（マーカー区間以外の手書き部分、例えば安全ラッパー関数の引数は、シグネチャ変更に応じて別途手動で追従させる必要があります）。

## 9. なぜWASM呼び出し中にユーザー確認をブロッキング待機できないのか

WebAssemblyのインポート関数（ホスト関数）は同期的に呼び出され、呼び出し元のWASM実行スタックはその関数が値を返すまで進みません。一方、ユーザーへの確認ダイアログ表示は本質的に非同期（ユーザーの操作を待つ）です。同期呼び出しの中で非同期処理の完了を literally 待機する手段はありません（`Atomics.wait`等を使うstack-switching技法はありますが、手書き規模のプラグインが前提とするものではありません）。

このため、本体アプリは「plan段階で予定を積むだけ（同期・副作用フリー）」「WASM実行が完了した後、ホスト側が非同期にユーザー確認を行いコミットする」という2段階方式（§6）を採用しています。

## 10. サンプル解説（`PLUGIN_SDK/samples/wasmPageNumberStamper/`）

各ページにページ番号のテキストボックスを配置するRust製サンプルです（`page_number_stamper.rs`、単一ファイル）。

- 冒頭で`#[path = "../../rust/host_sdk.rs"] mod host_sdk; use host_sdk::*;`により共有SDK（§8）を取り込んでおり、ホストとのやり取り部分（文字列マーシャリング・`extern "C"`宣言・`alloc`エクスポート）は自前実装していません。このファイルには業務ロジックのみが書かれています。
- `describePlugin()`で8つの入力項目（**対象文書**・開始ページ・開始番号・表示フォーマット・配置位置・奇偶ミラー・フォントサイズ・文字色）を宣言します。先頭の`add_file_field("targetDoc", "対象文書", false)`が処理対象文書を明示的に選択させるための必須項目です（§4「処理対象文書の指定」参照）。
- `stampPageNumbers(...)`が実際の処理本体です。引数は「システムコンテキスト（対象文書数・ページ数・代表ページサイズ）」＋「`describePlugin`での宣言順のうち`file`型を除くユーザー入力値」の順で渡されます。**`targetDoc`（`file`型）はこの引数リストに現れません**（ホストが実行前に解決済みで、`doc.*`/`plan.*`ホストAPIが暗黙にその文書を操作対象とします）。このプラグインは`file`型フィールドを1つしか宣言していないため、`plan.addAnnotation`/`doc.getAnnotationIdsByTag`の`fileIndex`引数は常に`0`（`FILE_INDEX`定数）です。文字列引数はすべてNUL終端UTF-8ポインタ（§3）としてホストから渡され、`read_c_string`ヘルパーでRustの`String`に変換します。
- 実行冒頭で`set_confirmation_mode("once")`を呼び、全ページ一括の変更であることから1回の確認で済むようにしています。
- 開始ページが対象文書のページ数を超えている等、不正な入力は`report_error(...)`で分かりやすい理由とともに報告し、以降の処理を行わず終了します（§5「進捗・ログ・エラーの使い分け」参照）。
- `get_annotation_ids_by_tag`+`remove_annotation`で、再実行時に前回分を削除してから作り直します（§7のパターン）。
- 位置・奇偶ミラーの計算・テキストのフォーマット文字列置換（`{n}`/`{total}`）もすべてプラグイン内（Rust）で完結させています（本体アプリ側での文字列組み立ては行いません）。
- ページを1件処理するたびに`log(...)`で「n/total ページ処理」という行を記録します。
- 共有SDKのラッパー関数はすべて安全な`pub fn`のため、このファイル内で`unsafe`を書くのは受け取った文字列ポインタを`read_c_string`に渡す箇所のみです。

### 複数文書を扱うサンプル（`PLUGIN_SDK/samples/wasmDocumentDiff/`）

旧版・新版の2つのPDFを比較し、テキストが異なるページの新版側に印を付けるRust製サンプルです（`document_diff.rs`）。複数の`file`型フィールドと`fileIndex`引数を実際にどう組み合わせるかの参考実装です。

- `describePlugin()`で`add_file_field("oldDoc", ..., false)`→`add_file_field("newDoc", ..., false)`の順に2つの対象文書を宣言します。宣言順がそのまま`fileIndex`（`oldDoc`=0、`newDoc`=1）になります。
- `compareDocuments(...)`本体は、システムコンテキストの`target_file_count`が2未満（＝対象文書が正しく2つ選択されていない）の場合、無言でreturnせず`report_error("旧版・新版の両方の文書を選択してください")`で理由を報告してから終了します。それ以外の場合は`page_count`（`oldDoc`のページ数）ぶん、`get_page_text_blocks(0, page)`と`get_page_text_blocks(1, page)`で両ファイルの同じページのテキストを取得・比較します。
- テキストが異なるページには、`add_annotation(1, page, ...)`（`fileIndex=1`＝`newDoc`側）で差分マークを配置し、`log(...)`で「p.N: 差分あり」という行を記録します。読み取り対象と書き込み対象で異なる`fileIndex`を指定できる点がポイントです。
- `doc.getPageTextBlocks`が返すJSON配列文字列から`"text"`フィールドだけを取り出す簡易的な文字列走査関数（`extract_concatenated_text`）を自前で実装しています。外部クレート（serde等）を使わずビルドする方針（§8）のため、本格的なJSONパーサではなく、比較用途に限定した簡易実装です。
- 冪等な再実行パターン（§7）は`newDoc`側（`fileIndex=1`）のタグを検索・削除する形で適用しています。

## 11. 申請〜公開・更新・取り下げの流れ

RelationalDocumentsアプリの設定画面でGitHub個人アクセストークン（PAT）を登録すると、アプリ内の「新規プラグインを申請」ダイアログから、このリポジトリへのフォーク作成・ブランチ作成・ファイルコミット・プルリクエスト作成までを自動で行えます（アプリはバックエンドを持たないため、ブラウザから直接GitHub REST APIを呼び出します）。手動でこのリポジトリに直接PRを作成することもできます。

1. マニフェスト（`plugin.json`）・本体ファイル・（任意で）アイコン画像をアプリの申請ダイアログからアップロードすると、あなたのフォーク上にブランチが作成され、このリポジトリへプルリクエストが送られます。新規申請時は`owner`があなたのGitHubユーザー名に、`id`がアプリの自動採番したUUIDに、それぞれ上書きされます（ローカルの`plugin.json`に書いていた`id`は破棄されます）。バージョン更新時は既存の`id`・`owner`がそのまま使われます。
2. `.github/workflows/validate-plugin-submission.yml`が自動的に`plugin.json`・本体ファイル・アイコン画像を検証し、あわせて**申請者の権限検証**（`validateOwnership.mjs`）を行います。既存プラグインの更新の場合、申請者・新しいmanifestの`owner`・公開済みmanifestの`owner`の3つがすべて一致していない場合は検証NGとなり、悪意あるユーザーによる他人のプラグインの書き換えを防ぎます。
3. **検証（オーナー確認含む）にすべて合格すると、`.github/workflows/auto-merge-plugin-submission.yml`がPRを自動的にマージします。** 提出者がこのリポジトリへの書き込み権限を持っているかどうかに関わらず、マージ自体はリポジトリ自身の権限で行われるため、オーナー・メンテナが手動でマージ操作をする必要はありません（詳細は§12参照）。ブランチ保護ルールでレビュー必須にしている等、自動マージが働かない設定になっている場合は、その旨がワークフローのログに残り、オーナー・メンテナが手動でマージすることになります。
4. 検証に失敗した場合は、内容を修正して同じ手順で再度申請してください。**同一プラグインの申請は同じブランチ・同じPRを使い回す**ため、新しいPRが増えることはなく、修正版の再検証が同じPR上で行われます。
5. バージョンを更新する場合も、同じ手順で新しいファイルを申請してください（申請者は公開者と同一のGitHubアカウントである必要があります）。
6. マージされる前の申請（検証待ち・検証NG）は、アプリから「申請を取り下げる」を実行するとPRをマージせずにクローズできます。
7. 公開を取りやめたい場合は、アプリから「公開を取り下げる」を実行すると`plugin.json`の`deprecated`を`true`にするプルリクエストが作成されます（実ファイルは履歴に残したまま、カタログ・検索結果への表示のみを止めます）。この操作も申請者本人（`owner`と一致するユーザー）のみが行えます。取り下げ申請も同様に固定ブランチを再利用するため、検証に失敗しても同じPRで再申請できます。
8. **同一プラグインについて、新規申請（バージョン更新）と取り下げ申請を同時に進行させることはできません。** どちらか一方が進行中（未マージ・未クローズ）の間は、もう一方の操作はアプリ側でブロックされます。

## 12. ストアリポジトリのCI検証内容・自動マージの仕組み

`.github/workflows/validate-plugin-submission.yml`は、変更されたプラグインディレクトリごとに以下を実行します。

| スクリプト               | 検証内容                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `validateManifest.mjs`   | `plugin.json`の必須フィールド・型、`id`がUUID(v4)形式かつディレクトリ名と一致するか、`requiredHostApis`が許可リストに含まれるか |
| `validateWasmBinary.mjs` | WASM本体ファイルのマジックナンバー・サイズ上限（`runtime:"wasm"`のプラグインのみ）           |
| `validateIcon.mjs`       | アイコン画像の形式（PNG/JPEG/GIF）・拡張子と実形式の一致・サイズ上限（`iconFile`指定時のみ） |
| `validateOwnership.mjs`  | 申請者（PR作成者）が`owner`と一致するか（新規申請・更新の両方。§11参照）                     |

いずれか1つでも失敗すると、そのプルリクエストの検証は「検証NG」となり、以下の自動マージも実行されません。

**`.github/workflows/auto-merge-plugin-submission.yml`は上記とは別のワークフローで、`workflow_run`イベント（`validate-plugin-submission.yml`の完了）をトリガーに動作します。** 検証ワークフローが成功した場合のみ、対応するPRを`actions/github-script`経由でマージします。この2つのワークフローをあえて分離しているのは、`pull_request`イベント（フォークからのPRで検証を実行するために使う）はGitHubの仕様上、フォーク由来のPRに対して書き込み権限のある`GITHUB_TOKEN`を持てないためです。`workflow_run`イベントは常にこのリポジトリのデフォルトブランチ上の定義で動作し、フォークPRであってもマージに必要な書き込み権限を持てます（未検証のPRコードそのものを権限昇格した文脈で実行するわけではなく、「検証が成功したという結果」だけを見て動作するため安全な設計です）。ブランチ保護ルールなどで自動マージが失敗した場合は、ワークフローのログにその旨が記録されるだけで、オーナー・メンテナによる手動マージのフォールバックとなります。

## 13. 既知の制限

- Pyodide（Python）実行エンジンは未実装です（`PLUGIN_SDK/samples/pyEntryPointStub/`は実装イメージのみのサンプルで、実行できません）。
- WASM↔ホスト間で受け渡せるのは文字列・数値・真偽値のみです（配列・オブジェクトはJSON文字列としてやり取りします）。
- 結果表示はプログレスバー・ログ・テキストの3種のみで、テーブル表示は未対応です。
- アノテーションそのものを直接参照する入力項目型はまだありません（現時点ではID文字列を介して`doc.getAnnotationsByFile`等と組み合わせて参照します）。

## 14. 開発中のWASMを実ホストで検証する方法

プラグインをストアに申請する前に、実際にRelationalDocumentsのホスト実装（マーシャリング・ホストAPI）に対して問題なく動作するかを、アプリ内「WASMを直接インストール」機能で確認できます。

RelationalDocumentsアプリのプラグイン一覧画面（試験管アイコンのボタン）から、ストア（カタログ）を経由せずにローカルの`plugin.json`・`.wasm`ファイル・（任意で）アイコン画像を直接インストールできます。実際のアプリのUI・実文書・実データベースに対して動作確認したい場合はこちらを使ってください。一覧では「ローカル」バッジで、カタログ経由でインストールした通常のプラグインと区別されます。申請前の最終確認や、ストアに公開する予定のないプラグインの個人利用にも使えます。
