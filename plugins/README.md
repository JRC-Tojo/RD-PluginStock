# plugins/

このディレクトリ配下に、プラグイン1件ごとに1フォルダを配置する。

```
plugins/
└── <pluginId>/
    ├── plugin.json   # 必須。プラグインのメタ情報（静的）
    └── <mainFile>     # plugin.jsonのmainFileで指定した本体ファイル（.wasm または .py）
```

- `<pluginId>` はフォルダ名と `plugin.json` の `id` フィールドを一致させること。
- `plugin.json` の仕様は [`docs/PLUGIN_DEVELOPMENT_GUIDE.md`](../docs/PLUGIN_DEVELOPMENT_GUIDE.md) を参照。
- このディレクトリ配下への変更を含むプルリクエストは、`.github/workflows/validate-plugin-submission.yml` により自動検証される。
