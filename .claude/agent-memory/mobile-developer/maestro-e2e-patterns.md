---
name: maestro-e2e-patterns
description: Maestro E2E（.maestro/）のフロー構成・tag運用・状態別testIDの付け方（SS-21で確立）
metadata:
  type: project
---

SS-21（MVP主要フローのE2E）で確立した `packages/mobile/.maestro/` の設計パターン。

## フロー構成
- `.maestro/` 直下の yaml だけが Maestro の自動実行対象（既定 `flows: *`）。共通手順は
  `.maestro/subflows/` に置き `runFlow: subflows/xxx.yaml` で呼ぶ（単体では実行されない）。
- `.maestro/config.yaml` はあえて作らない（`flows:` の glob を書き間違えると「1本も実行されない
  のに緑」になる最悪の失敗をするため。既定挙動で十分）。
- MVP のような「状態が連続する1シナリオ」は分割しない。`useActiveWalkStore` 等の状態は
  フロー間（＝アプリ再起動間）で永続化されないため、分割すると引き継げない。

## tag によるCI除外
- ヘッダに `tags: [smoke]` / `tags: [mvp, maps-required]` のように付け、CLI から
  `maestro test --exclude-tags=maps-required <dir>` / `--include-tags=...` で絞り込む。
- 外部API（backendのGoogle Maps連携など）に依存し、CI側の環境がまだ整っていないフローは
  専用タグ（例 `maps-required`）を付けて `--exclude-tags` で除外し、CI全体を赤にしない。
  対応が入ったらワークフロー側の除外行を外すだけで復帰できる設計にする。

## フレーク対策
- `assertVisible` は待ち時間が短い。ネットワーク/画面遷移をまたぐ箇所は必ず
  `extendedWaitUntil: { visible/notVisible: { id }, timeout }` を使う。
- **disabledなボタンをタップしてもMaestroは失敗しない**（そのまま次のステップへ進む）。
  「押せる状態になったこと」を示す専用testIDを先に待ってからタップする。
- 件数・空状態など外部データ/実行順に依存する値はassertしない。「エラーになっていない」
  （`assertNotVisible: *-error`）＋「ローディングが終わった」（`extendedWaitUntil notVisible: *-loading`）
  の2段で「取得が成功して落ち着いた」ことだけを見る。

## 状態ごとのtestID付与ルール（[[render-body-centered-pattern]] と対）
- 同じコンポーネントが複数の状態（loading/saving/saved/error等）で同じroot `testID` を返す設計は
  そのままにする（**rootのtestIDを状態ごとに付け替えない**。既存のE2E/コードのアサーションが壊れる）。
- 判別が必要なら、**その状態でしか描画されない内側の要素**に `${testID}-<state>` を追加する
  （例: `WalkSaveStatus` の saving/saved 分岐にある `Text` へ `${testID}-saving` / `${testID}-saved`）。
- 共有プリミティブ（`TabBar` 等）には固定 testID を埋め込まず、`itemTestIDPrefix` のような
  prop で呼び出し側から注入させる（複数箇所から使われる想定があるため）。
  `TabBar` の例: `itemTestIDPrefix="app-tab"` → 各項目に `${prefix}-${item.value}`。

## CI（mobile-e2e.yml）の運用
- push トリガの `paths` に `.maestro/**` と workflow 自体を含めないと、フロー変更が
  main で検証されずnightlyまで気付けない。
- 失敗時のデバッグ成果物は `~/.maestro/tests/` に自動出力される（ログ・スクショ・階層ダンプ）。
  `if: failure()` で `actions/upload-artifact@v4`（`if-no-files-found: ignore`）を足しておく。
