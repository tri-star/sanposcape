---
name: project_ss124_pin_location_picking
description: SS-124(任意地点でのピン登録・位置調整)mobileアーキレビュー結果。Must無し、feature間import非強制とrender中setStateパターンのドキュメント化がShould
metadata:
  type: project
  scope: durable
  adr: packages/mobile/adr/ADR-011-pin-location-picking-and-adjustment.md
  source_issue: SS-124
---

SS-124（散歩中以外・任意地点でのピン登録 (b) と登録画面での位置の微調整 (a)）の mobile 実装を
アーキテクチャレビュー（2026-09-25）。実装プラン（D1〜D12。詳細は ADR-011 本文に転記済み）・
ADR-011 と実装がほぼ完全に一致しており、Must 相当の指摘は無し。

**Why:** このタスクで確立された設計判断のうち、他のレビューでも再利用価値が高いものを残す。

1. **`PinMapFullScreen` による (a)(b) の共通化**（`features/pin/components/PinMapFullScreen.tsx`）
   は、見た目・地図設定（`showsUserLocation={false}` 等）を1箇所に揃えつつ、ジェスチャーの違い
   （`pickGesture: "tap" | "long-press"`）や確定ボタンの有無を props に出す設計。2機能ルール
   （`features/pin` 内だけで使う2コンポーネント）の適用例として妥当。
2. **`Modal` を避けた全画面オーバーレイ設計**は [[pattern_modal_backhandler_coexistence]] で
   指摘していた既知の問題（Android で `Modal` 表示中は `hardwareBackPress` が `Dialog` 側に
   奪われ `useScreenBack.onIntercept` が実質届かない）を ADR-011 D7 で明示的に踏まえた回避。
   今後 "地図を全画面で見せる" 系の新規オーバーレイを見たら、同じ理由で `Modal` を避けているか
   確認する。
3. **feature 間 import の非依存（`features/walk` ⇔ `features/pin`）は `.oxlintrc.json` の
   `no-restricted-imports` では強制されていない**（対象は認証系のみ）。ADR-011 D6 のルーティング
   設計（ルート文字列だけで遷移する）はこの非依存を前提にしており、依存度が増した。次に
   feature 間 import を lint で強制する提案が出たら、この点を後押し材料にできる。
4. **`usePinLocationPicker.ts` の「render 中に直接 setState して単発の派生状態を確定する」パターン**
   は、`react/set-state-in-effect`（React Compiler 由来の oxlint 警告）を避けるために採用された、
   リポジトリで唯一の用例（他は `useEffect` + `ref` ラッチ）。React 公式ドキュメントが認める
   パターンではあるが、`docs/architecture-guideline.md` 等のチーム共有ドキュメントには載っておらず
   mobile-developer エージェントの pitfalls メモリにのみ記録されている（エージェント間・人間には
   共有されない）。次に同じ oxlint 警告に遭遇した実装を見たら、チーム文書（`docs/` 配下）に
   反映されているか確認し、されていなければ指摘する。

**How to apply:** 次に `features/pin` または地図系オーバーレイ（`Modal` 代替）を触る PR を
見たら、上記1・2が踏襲されているか確認する。feature 間 import の lint 強制（3）と
render中setStateパターンのドキュメント化（4）は、このレビュー時点では「Should」止まりで
まだ対応されていない。次回以降のレビューで実際に対応されたか確認し、されていれば本メモリから
該当項目を削除する。

**関連メモリ**: [[project_ss88_pin_registration_mobile]]（features/pin の oxlintrc override は
SS-124時点で解消済みと確認）、[[pattern_modal_backhandler_coexistence]]（本チケットでの
ポジティブな適用例を追記済み）。
