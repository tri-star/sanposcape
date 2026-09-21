---
name: duplicate-adr-numbers-repo-root-vs-mobile
description: ADR-008等の番号がpackages/mobile/adr/とdocs/adr/(リポジトリルート)の両方に別内容で存在する。コード中のADR参照コメントを裏取りするときは両方のパスを確認する
metadata:
  type: reference
  scope: durable
---

SS-100（`/app-config`フィーチャーフラグ）のレビューで、実装コード（`appConfigSnapshot.ts`等）の
コメントに「ADR-008 決定9」とあったが、`packages/mobile/adr/ADR-008-active-walk-state-and-route-cache.md`
（mobile固有、内容は散歩中ルートの往路/復路判定禁止）を見ても該当する「決定9」が無く、一見コメントが
古い/誤り参照に見えた。

実際には `docs/adr/ADR-008-deploy-release-separation.md`（リポジトリルート、frontend/backend横断の
「デプロイとリリースを分離しフィーチャーフラグで公開制御する」ADR）の決定9（フェイルセーフ: 取得失敗は
全フラグOFF）を指しており、参照は正しかった。

**Why**: `packages/mobile/AGENTS.md` は「mobile固有の判断は `adr/` 配下、frontend/backendにまたがる
判断やドメイン知識は `docs/adr/`（リポジトリルート）にある」と使い分けを明記しているが、両方に
`ADR-008` という同じ番号のファイルが存在しうる（採番がディレクトリ単位で独立しているため）。
番号だけでは一意に特定できない。

**How to apply**: コード/コメント中に「ADR-XXX 決定N」「ADR-XXX 追補DN」という参照を見つけたら、
`Glob "**/ADR-XXX*"` で両方のディレクトリ（`packages/mobile/adr/` と `docs/adr/`）をまず確認し、
片方に見つからなくても「誤参照」と即断せず、もう片方を確認してから裏取りする。
横断的な話題（フィーチャーフラグ、デプロイ、リリース、環境変数、認証全体設計等）は
`docs/adr/` 側にあることが多い。[[verify-generated-types-vs-plan-assumptions]] と同系統の
「一次情報を確認してから判断する」手法。
