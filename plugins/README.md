# plugins/

公開されているプラグインは、このディレクトリ配下に `plugins/<pluginId>/` という単位で配置されます。

```
plugins/
└── <pluginId>/
    ├── plugin.json      # 必須。プラグインのメタ情報（仕様は開発者向けドキュメント参照）
    ├── <mainFile>        # 必須。plugin.jsonのmainFileで指定した本体ファイル（.wasm等）
    └── <iconFile>         # 任意。plugin.jsonのiconFileで指定したアイコン画像（PNG/JPEG/GIF）
```

- `<pluginId>` はプラグインの一意な識別子で、`plugin.json` の `id` フィールドと一致している必要があります。
- 新規追加・更新はいずれも、このディレクトリへの変更を含むPull Requestとして提出してください（kumihimoアプリの申請機能からは自動的にこの形になります）。
- 提出されたPull Requestは `.github/workflows/validate-plugin-submission.yml` により自動検証されます。検証内容の詳細は `docs/PLUGIN_DEVELOPMENT_GUIDE.md` を参照してください。
