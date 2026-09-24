---
name: project_ss88_pin_registration_mobile
description: SS-88ピン登録機能(features/pin, services/photo, ADR-010)のmobileアーキレビュー結果と既知ギャップ
metadata:
  type: project
  scope: task-local
  source_issue: SS-88
---

SS-88（ピン登録・写真presigned POST直送）の mobile 実装は事前プランに極めて忠実で、Critical指摘なし。
`src/features/pin/lib/pinSaveRunner.ts`（未使用枠30の吸収・冪等再開）と `src/services/photo/`
（real/mock）は ADR-010 の「複雑な状態遷移はすべて lib/ の純粋関数に閉じ、vitest で網羅する」方針の
模範実装。レビュー日 2026-09-21。

**Why:** 次に `features/pin` や同種の「複雑な非同期状態機械 + DI テスト」を見たとき、以下2点を
再確認する価値がある。

1. **DIユニットテストの同期性前提と実Reactフックのタイミングの乖離**
   `pinSaveRunner.test.ts` のテストハーネスは `dispatch()` 呼び出しのたびに内部の `items` 配列を
   同期的に書き換えるが、実配線（`usePinPhotos.ts`）は `useReducer` の `dispatch` +
   render時に同期される `itemsRef.current`（`useRef`）を使うため、`await` を挟まずに連続して
   `dispatch` → 直後に `getItems()` 相当の読み出しを行うループでは、直前の dispatch が
   まだ反映されていない古い配列を読みうる。`createPin`/`addPinPhotos` が冪等なため実害は
   「無駄な追加リクエスト」「進捗表示の一瞬の遅れ」程度に留まるが、同種のDIパターン
   （複数の状態変更を1ループ内で連続して行い、直後に最新状態への参照に依存する設計）を見たら、
   実フック側で dispatch と ref 同期が本当に同期しているか（あるいは dispatch と同時に
   ref も手動で進めるラッパーになっているか）を確認すること。
2. **restricted feature の認証非依存パターンが `features/pin` には機械的強制されていない**
   `app/pins/new.tsx` が `useAuthSessionStore` を読み `isSignedIn`/`onSignIn` を props で
   `PinRegisterView` に注入する設計は SS-29/SS-37 の先例（[[project_ss29_route_as_composition_root]]）
   どおりで、`features/pin/**` は実際に `@/store/useAuthSessionStore` / `@/services/auth` を
   import していない。ただし `.oxlintrc.json` の `no-restricted-imports` override は
   `src/features/walk/**` / `src/features/history/**` のままで `src/features/pin/**` が
   対象に入っておらず、この規律は手作業のみで守られている。次に `features/pin` へ認証関連の
   変更が入ったら、override 追加漏れのままか確認する。

**How to apply:** `features/pin` 配下の新規PRで `pinSaveRunner`/`photoDraft`/`usePinPhotos` に
手を入れる変更を見たら、上記2点が解消されているか（1: dispatch同期化 or 結合テスト追加、
2: `.oxlintrc.json` へのoverride追加）をまず確認してから他の観点に進む。ADR-010・
`docs/architecture-guideline.md`「写真の扱い」節は実装と一致していることを確認済み
（2026-09-21時点）。SS-88 がクローズしたら、2点とも実際に解消済みか確認したうえでこのメモリは
削除するか、まだ未解消なら `.oxlintrc.json` の override 追加を ADR-009 追補として提案し
durable なメモリへ昇格させる。
