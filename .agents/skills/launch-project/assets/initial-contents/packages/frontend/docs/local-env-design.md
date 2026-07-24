# ローカル環境構築

## 概要

frontendのローカル環境は WSL2上で開発が行われていることを想定して構築する。
Editorconfig, Biomeなどを利用する環境をセットアップする。

## フォルダ

- `<project-root>` : .gitフォルダがあるプロジェクトのルートと見なせるフォルダ
- `<frontend-root>` : `<project-root>/packages/frontend`

## 設計上の注意点

- 利用するツールチェーン
  - Editorconfig : コードのフォーマットを統一するために利用する。
    - 改行: LF
    - インデント: スペース2つ
    - 文字コード: UTF-8
    - 最終行の改行: あり
  - Biome : Linter/Formatterとして利用する。
    - Editorconfigと組み合わせて、コードのフォーマットを統一するために利用する。
    - BiomeはESLintやPrettierなどのツールを統合したツールで、これらのツールを個別にインストールする必要がないため、セットアップが簡単になる。

## ドキュメント作成

- `<frontend-root>/docs/local-env.md` も作成し、ローカル環境構築手順をまとめる。
- `<frontend-root>/README.md` がまだ存在しない場合は作成し、 `local-env.md` へのリンクを含めるようにする。
