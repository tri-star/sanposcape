---
name: hooks-and-query
description: mobile の hook と TanStack Query の落とし穴 — 自分の dispatch でキャンセルされるキュー（kick 駆動へ）、間隔制御は errorUpdatedAt も見る、useMutation の雛形、削除直後の 404、Rules of Hooks、手動メモ化の警告
metadata:
  type: feedback
  scope: durable
---

hooks はユニットテストの対象外なので、ここに挙げる不具合はレビューか実機でしか見つからない。判定は `lib/` の純粋関数に寄せる。
レビュー側の観点は `.claude/agent-memory/review/mobile-react-correctness.md`。

## effect の依存配列で駆動するキューは自分をキャンセルする

`useEffect(() => {...}, [items])` で「items が変わるたびに次の仕事を確認する」キューを書き、`await` の前に同期で
`dispatch({type:"uploadStarted"})` すると、その dispatch で `items` が変わり、React が非同期処理の完了より先に**この effect 自身の cleanup** を実行する。
`cancelled = true` 方式だと完了時の `if (cancelled) return;` で成功も失敗も握りつぶされ、状態が `uploading` のまま止まる
（SS-88 `usePinPhotos.ts` の Critical。修正の説明は同ファイルの JSDoc）。

**How to apply:** 非同期キュー・ワーカーループでは、自分が dispatch する state を effect の依存配列に入れない。
- 駆動は明示的な `kick()` にし、`useEffect(deps:[])` はマウント・アンマウントだけにする。
- `kick()` は処理中なら pending フラグを立てて後で再起動し、同時実行を1に保つ（`busyRef` / `pendingKickRef`）。
- 「本当に不要になった」（アンマウント・対象の削除）だけを `stoppedRef` / `AbortController` で表し、他の state の変化と混同しない。
- `kick` などの内部ヘルパーは `useCallback` で包まない通常の関数でよい（ref だけを読むので古い render の closure でも同じに動く）。

## ポーリング・復帰の間隔制御は成功時刻だけで判定しない

`dataUpdatedAt` は成功時にしか更新されない。これだけで「最小間隔」を判定すると、失敗が続く間だけ間隔制御が効かない
（`invalidateQueries` 1回が transport の再送 × TanStack の `retry` で最大9リクエストになりえた。PR #89）。

**How to apply:** 起点は `max(dataUpdatedAt, errorUpdatedAt)` にし、`fetchStatus === "fetching"` なら重ねて発火しない（実例: `src/lib/appConfigRefresh.ts`）。
`refetchOnWindowFocus` は `focusManager` を配線していないので RN では効かない。フォアグラウンド復帰は `AppState` を自前で購読する（グローバルに配線しない）。

## useMutation の雛形は `useWalkSave.ts`

- 送信できない入力（検証関数が `null`）は通信せずに `throw new ApiError(422)`。既存の分類関数をそのまま使える。
- 自動発火は `useEffect` + `useRef`（発火済みキー）で1回にする。冪等キーがある操作でだけ安全。
  キーは「冪等キー + 関連する外部状態」の複合にできる（`${clientWalkId}:${isSignedIn ? "signed-in" : "guest"}`。判定は `lib/walkSaveTrigger.ts` の純粋関数）。
- **「自動リトライしてよいか」と「UI に何を出すか」は別の関数にする**（`isRetriableWalkSaveError` と `walkSaveErrorAction`）。
  `Record<ErrorCode, Action>` にすると、コード追加時に型で網羅漏れに気づける。
- 成功時の invalidate は hook 内の `useQueryClient()` で行う（`@/api/queryClient` のシングルトンを直接 import しない）。

## 削除直後の invalidate は自分が消した詳細を取り直して 404 を引く

`invalidateQueries({ queryKey: ["walks"] })` はマウント中の詳細クエリも再取得させる。削除直後に呼ぶと 404 を引き、遷移の直前に「見つかりませんでした」が一瞬出る。

**How to apply:** `removeQueries(["walks","detail",id])` も呼び、画面の表示状態を決める純粋関数で「削除済み」をエラーより優先させる。

## Rules of Hooks と手動メモ化

- 早期 return（例: 閉じるアニメーション後に `if (!mounted) return null;`）を持つコンポーネントでは、すべての hook を return より前に置く。oxlint は検出しなかった。
- React Compiler が有効なので、oxlint の `react(preserve-manual-memoization)` 警告（exit code は 0）が出たら、軽い計算の `useMemo` / `useCallback` は外す。
  残すのは `queryKey`・Query のオプション、`useEffect` の依存に渡すオブジェクト、本当に重い計算。参照実装: `features/pin/hooks/usePinRegister.ts`。
- 派生 state の setState を effect に入れない件は `architecture-guideline.md`「hook 内での『1回だけの状態確定』パターン」が正本。

Related: [[api-and-http]], [[pins-and-photos]], [[ts-rn-pitfalls]]
