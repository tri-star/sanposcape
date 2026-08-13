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

# 既存のADRを更新する場合（追補のルール）

既にあるADRの対象領域に新しい決定が加わった場合は、**新規ADRを作らず既存ADRに追補する**ことを
まず検討します。追補は「書き換え」ではなく「追記 + 既存箇所への注記」で行います。

- 当時の判断や経緯を示す記述は**消さない**。内容が古くなった箇所には
  `（<課題ID> 追補: …）` の形で注記を添えて、後から時系列の意思決定記録として読めるようにする。
  - 例: 「削除APIは今回スコープ外」→ 「削除APIは今回スコープ外（**SS-53 追補**: API は追加したが
    mobile の導線は未実装のため、エンドユーザー視点では依然として削除手段が無い）」
- 例外として、「未着手」「未実装」のような**現在の状態を示す記述**は残すと誤読を招くため、
  実績の表記に置き換える。
- 決定・選択肢・影響のような節に新しい項目を足す場合も、見出しや箇条書きに
  `（<課題ID> 追補）` を付けて、どの課題で加わった決定かを追えるようにする。
- 冒頭（`## ステータス` 付近）と `## 日付` に、どの課題でいつ追補したかを1行で残す。
  - 例: `2026-08-01（初版）、2026-08-09 追補（SS-42）、2026-08-12 追補（SS-53）`

参考にできる実例: `docs/adr/ADR-003-walk-record-persistence-and-history-api.md`（SS-20 / SS-42 / SS-53 の追補）
