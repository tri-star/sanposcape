---
name: effect-driven-queue-self-cancellation
description: useEffect(deps:[state])でキュー処理を書くと、自分自身のdispatchでeffectのcleanupが走り転送結果を握りつぶす。SS-88 usePinPhotos.tsで発見・修正。
metadata:
  type: feedback
  scope: durable
---

## `useEffect(() => {...}, [items])` で非同期キューを書いてはいけない

**症状**: 「`items` が変わるたびに次の仕事があるか確認する」設計の `useEffect` の中で、
`await` に入る**前**に同期的に `dispatch(...)` を呼ぶと（例:
`dispatch({type:"uploadStarted"})` してから `await fetch(...)`）、その dispatch で `items`
の参照が変わり、React が（非同期処理の完了より早く）**この effect 呼び出し自身の
cleanup** を実行してしまう。`cancelled = true` のようなフラグを立てるパターンだと、
非同期処理が実際に完了した時点で `if (cancelled) return;` に引っかかり、成功も失敗も
**すべて握りつぶされる**。結果、状態が `uploading`/`processing` のまま永久に停止する。

これは SS-88 の `usePinPhotos.ts`（先行アップロードキュー）で実際に発生した Critical
バグ（ローカルレビュー MR1）。`hooks/` はプロジェクト方針で単体テスト対象外
（[[test-scope-hooks-components]]）かつ E2E も写真を添付しないため、レビューまで
どのテストにも引っかからなかった。

**How to apply（再発防止）**: 非同期キュー・ワーカーループを書くときは、**`useEffect` の
依存配列に「自分がこれから dispatch する state」を含めない**。代わりに:

1. キューの駆動を「明示的な `kick()` 呼び出し」にする（`useEffect(deps:[])` は
   マウント/アンマウントの一度きりに限定し、状態変化への反応は `kick()` の呼び出し側
   （`dispatch` ラッパー自身）に持たせる）。
2. `kick()` は「処理中なら pending フラグを立てて後で自分を再起動する」形にし、
   同時実行数を1に保つ（`busyRef`/`pendingKickRef` の組）。
3. 「本当にこのタスクが不要になった」（アンマウント、対象アイテムの削除）だけを
   `stoppedRef`/`AbortController` で表現し、「他の何かが state を変えた」ことと混同しない。

`kick`/`runLoop`/`processWork` のような内部専用ヘルパーは、コンポーネント本体内の
**通常の `function` 宣言**（`useCallback` で包まない）として書いてよい。`useCallback([])`
で作った `dispatch`/`resume` などの安定した公開 API から1回だけ参照させれば、
「render のたびに再定義されるが ref だけを読むので挙動は変わらない」という性質を
利用して安全に動く（`kick` 自身が古い render の変数を握っていても、ref はどの render の
closure からでも同じオブジェクトを指すため）。

関連: [[direct-s3-upload-and-slot-limit-pattern]]（MR2: `dispatch` が `itemsRef` を
`reducer` で同期的に進めてから `useReducer` 本来の dispatch を呼ぶことで、
`getItems()` が dispatch 直後に必ず最新状態を返すようにする、という対の修正）

## oxlint の `eslint-disable-next-line react-hooks/exhaustive-deps` は使用箇所ではなく依存配列の直前に置く

`useCallback(() => { ...; someStableFn(); }, [])` で `someStableFn` が「missing dependency」
警告になる場合、**`someStableFn()` の呼び出し行の直前**に `eslint-disable-next-line` を
置いても抑制**されない**ことがある（SS-88 で実際に確認）。正しい配置は
**`}, [deps])` という閉じ括弧の行の直前**（既存の `WalkRouteMapView.tsx` の
`// eslint-disable-next-line react-hooks/exhaustive-deps -- ...` もこの配置）。
警告メッセージ自体は使用箇所の行番号を指すことがあるが、無効化コメントの有効範囲は
そこではないので、まず閉じ括弧の直前に置いて確認すること。
