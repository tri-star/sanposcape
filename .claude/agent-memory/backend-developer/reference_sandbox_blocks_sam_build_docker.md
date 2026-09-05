---
name: reference-sandbox-blocks-sam-build-docker
description: sandbox内ではsam build --use-container / sam local invokeがDockerソケット遮断で失敗する。dangerouslyDisableSandboxが必要
metadata:
  type: reference
  scope: durable
---

`sam build --use-container` や `sam local invoke` は内部で Docker デーモンに接続するが、
Bash ツールの sandbox モード内で実行すると次のエラーで失敗する。

```
Error: Running AWS SAM projects locally requires a container runtime. Do you have Docker or Finch installed and running?
```

**Why**: sandbox が Docker の unix ソケットへの接続を遮断するため。紛らわしいのは、
同じ sandbox 内でも `docker info` 単体は成功することがある点（`sam` が使う接続経路が
`docker` CLI 直叩きとは別で、より厳しく塞がれている）。そのため `docker info` の成功だけを
根拠に `sam build --use-container` も通ると判断しないこと。

**How to apply**: `sam build --use-container` / `sam local invoke` を実行する際は
最初から `dangerouslyDisableSandbox: true` を使う（エラーを一度見てから切り替えるのでもよい）。
`sam validate --lint` は Docker を使わないため sandbox 内でも成功する。

関連: [[reference-sam-cli-location]], [[reference-aws-credentials-sandbox-denied]]
