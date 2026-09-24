---
name: project_ss100_app_config_flags
description: SS-100 mobile app-config フィーチャーフラグ受け皿レビューで得た、横断ディレクトリ分散パターンとsrc/api/肥大化リスクの確認事項
metadata:
  type: feedback
  scope: durable
---

## 背景

SS-100（mobile が `/app-config` からフィーチャーフラグを取得して機能表示をガードする）を
アーキテクチャレビュー（2026-09-20）。Critical/High 無し。決定事項そのものは
`docs/adr/ADR-008-deploy-release-separation.md`（D11〜D18 追補）と
`packages/mobile/adr/ADR-009-auth-session-state-and-route-gate.md`（SS-100 追補）に記録済み。
このメモリは次に同種の差分（フラグ追加・`src/api/` への新規ラッパ追加・横断機能の配置判断）を
レビューするときに確認すべきことを残す。

## 骨子（前提として押さえておく）

- フラグ値保持は TanStack Query 一本（`queryKey: ["app-config"]`）。Zustand へ複製しない。
- `features/app-config/` は作らず `src/api/` / `src/lib/`（純粋関数）/ `src/hooks/` /
  `src/components/app-config/`（UIを持たない配線コンポーネント）に分散。
  「その機能の外から import されるものは features に置かない」という folder-structure.md の
  既存ルールへ素直に従った結果であり、`services/location`（features/location を持たない）と
  同じ思想の踏襲。
- `AppConfigSnapshot` は `config_source` を型から意図的に落として分岐を構造的に禁止。
  フェイルセーフ3値（loading/ready/unavailable）と GateDecision3値（pending/enabled/disabled）を
  分離し「まだ分からない」と「OFF確定」を型で区別する設計は今後の参照実装になる。

## `src/api/` 直下にドメイン形状のラッパが増える兆候に注意

`appConfigApi.ts` は `src/api/`（従来は `client.ts`/`apiError.ts`等の機能非依存インフラのみ）に
初めて「ドメイン形状を持つエンドポイント別ラッパ」を置いた前例。採用基準（「特定の機能に属さない
アプリ基盤の取得」）は `appConfigApi.ts` のJSDocに書かれているが主観的で、`src/components/` が
`ui/`/`layout/` サブフォルダで肥大化を明示的に防いでいるのに対し `src/api/` には同種の歯止めが
folder-structure.md に無い。

**この指摘は SS-100 内で解消済み**: `folder-structure.md` の `src/api/` 節に
「2本目の横断的エンドポイントラッパが増えたら `src/api/endpoints/` のようなサブフォルダへ分ける」
という閾値ルールが追記された。

**How to apply**: 次に `src/api/` 直下へ2本目以降のドメイン形状ラッパ（`healthApi.ts` 等）が
追加される差分を見たら、**上記ルールに従って `src/api/endpoints/` へ分割されているか**を確認する。
フラットに積まれていればルール違反として指摘する。

## `FeatureGate` の「画面ガードレシピ」への dangling reference

`src/components/app-config/FeatureGate.tsx` の JSDoc が `architecture-guideline.md` の
「画面ガードレシピ」を参照しているが、実体は「`pending`を使い`<Redirect>`しない」という
1文の注意書きのみで、具体的な実装例・独立した見出しは存在しない（リポジトリ全体で
「レシピ」という語はこの1箇所のみ）。SS-100 時点で画面単位のフラグガードの実例はゼロ。

**この指摘は SS-100 内で解消済み**: `architecture-guideline.md` に「画面ガードレシピ」の
独立した節（単一ルート／タブのガード実装例）が新設され、参照先が実在するようになった。

**How to apply**: 次に実際に画面単位のフラグガードが実装されたら、**そのレシピ節に従っているか**
（`pending` 中に `<Redirect>` していないか、タブは `options={{ href: null }}` か）を確認する。
レシピから外れた独自実装なら、理由が妥当かを確認する。

## SS-101 への接続点

`AppConfigSnapshot.minimumSupportedVersions`（`{ios, android}: string | null`）は既に型として
保持済み（`src/lib/appConfigSnapshot.ts`）。SS-101 は比較ロジック・UIを足すだけで着手できる形に
なっている。次に SS-101 をレビューするときは、この型をそのまま再利用しているか
（独自に version 文字列を再定義していないか）を確認する。
