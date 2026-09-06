---
name: reference-sam-cli-location
description: AWS SAM CLI の実体パスは PATH に無く mise 管理。絶対パスで呼ぶ必要がある
metadata:
  type: reference
  scope: durable
---

`sam` CLI はこの開発環境では `mise`（`aws-sam-cli` プラグイン）でインストールされているが、
シェルの `PATH` には入っていない。絶対パスで呼び出す必要がある。

```
/home/tristar/.local/share/mise/installs/aws-sam-cli/1.165.0/.mise-bins/sam
```

（バージョン番号のディレクトリ名はアップデートで変わり得るので、`ls
~/.local/share/mise/installs/aws-sam-cli/` で確認すること）

`sam validate --lint` はネットワーク・Docker 不要で動く。`sam build --use-container` /
`sam local invoke` は Docker が必要（[[reference-sandbox-blocks-sam-build-docker]] 参照）。

関連: [[reference-aws-credentials-sandbox-denied]]
