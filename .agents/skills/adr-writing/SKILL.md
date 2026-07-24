---
name: adr-writing
description: ADRを作成・更新する際に利用します。ある機能の設計が完了した時、実装や修正が完了した時に、機能と紐付けて永続化されるべき知識をADRという形で記録しておくために利用します。特に新しい機能の追加や、仕様変更を伴う機能改修時に利用します。
---

# ディレクトリ定義

- `<project-root>`: プロジェクトの .git フォルダのある、ルートと見なせるディレクトリ
- `<frontend-root>`: `<project-root>/packages/frontend`
- `<backend-root>`: `<project-root>/packages/backend`

# ADRの作成場所

ADRは内容により作成場所が異なります。以下のルールに従って保存してください。

## frontend/backendにまたがるものや、ドメイン知識に関するもの

- `<project-root>/docs/adr/ADR-<sequence-number>-<title>.md`
  - 例: `/docs/adr/ADR-001-auth.md`

このフォルダに分類されるもの

- 機能単位の例: 在庫管理アプリケーション
  - 受注(受注処理、受注業務)
  - 発注(発注処理、発注業務)
  - 在庫管理(在庫管理処理、在庫管理業務)
  - 顧客管理(顧客管理処理、顧客管理業務)
  - 決済(決済処理、決済業務)
- アーキテクチャ
  - 認証
  - ロギング・モニタリング
  - キャッシュ戦略
  - スケーリング戦略
  - セキュリティ対策
  - CI/CD

## frontend/backendのどちらかに特化した技術的なもの

先に `<project-root>/docs/adr` 配下のドキュメントに保存することを検討し、
その上でfrontend/backendに特化していてfrontend/backend用と思われる場合は以下の場所に保存する。

- frontendに関するもの
  - `<frontend-root>/docs/adr/ADR-F-<sequence-number>-<title>.md`
    - 例: `packages/frontend/docs/adr/ADR-F-001-some-title.md`

- backendに関するもの
  - `<backend-root>/docs/adr/ADR-B-<sequence-number>-<title>.md`
    - 例: `packages/backend/docs/adr/ADR-B-001-some-title.md`

Important: `<sequence-number>` はフォルダ内での連番とします。

## ADRのテンプレート

[ADRテンプレート](./templates/adr-template.md) を参照
