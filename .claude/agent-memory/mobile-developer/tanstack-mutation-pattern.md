---
name: tanstack-mutation-pattern
description: このリポジトリで初めて useMutation を使った際に確立したパターン（SS-19 useWalkSave）
metadata:
  type: project
---

SS-19（散歩終了処理・散歩ルート保存）まで、mobile には `useQuery` の利用例
（`useWalkRoute` 等）はあったが `useMutation` の利用例が無かった。
`src/features/walk/hooks/useWalkSave.ts` が最初の実装で、以下のパターンを確立した。

- `useMutation` の `mutationFn` 内で「送信不能な入力（バリデーション関数が null を返す）」を
  検出したら、通信せずに `throw new ApiError(422)` する（既存の `ApiError`/エラー分類関数を
  そのまま再利用でき、専用の例外型を増やさずに済む）。
- 自動発火は `useEffect` + `useRef<string | null>`（発火済みキーの記録）で1回だけ行い、
  React 18 StrictMode の二重実行を吸収する。冪等キー（`client_walk_id` 相当）がある操作
  でないとこの手法は安全でない点に注意。
  - **SS-37 追補**: 発火済みキーは「冪等キーだけ」ではなく「冪等キー＋関連する外部状態」の
    複合キーにできる。`useWalkSave` は `${clientWalkId}:${isSignedIn ? "signed-in" : "guest"}`
    という形にし、外部状態（認証）が変わったら「もう一度だけ」自動再発火するようにした
    （ゲストで401→サインイン→自動再送）。判定は `useEffect` の中に書かず
    `features/walk/lib/walkSaveTrigger.ts` の純粋関数 `nextWalkSaveFireKey` に切り出し、
    vitest で固定する（[[test-scope-hooks-components]] の方針どおり、hookはテストしない）。
- `retry`（TanStack Query の自動リトライ可否）は独自の「再試行可能なエラーコードか」判定関数
  （`isRetriableWalkSaveError`）に委譲し、指数バックオフ（`retryDelay: (n) => Math.min(base * 2 ** n, max)`）
  をそのまま使う。**「自動リトライしてよいか」と「UIに何を提示するか」は別関数に分ける**
  （SS-37）: `unauthorized` は自動リトライ不可（`isRetriableWalkSaveError` → false）だが、
  UIには「サインインして保存」CTAを出したい（`walkSaveErrorAction` → `"sign_in"`）。
  1つの関数に両方の意味を持たせると将来のエラーコード追加で必ず食い違う。
  `Record<ErrorCode, Action>` にすると新しいコード追加時に型で網羅漏れに気づける。
- `useQueryClient()` を hook 内で取得し、成功時に `invalidateQueries({ queryKey: [...] })`
  する（`@/api/queryClient` のシングルトンを直接 import しない）。

**Why:** 保存の進行・失敗・再試行をユーザーが今見ている画面（サマリ画面）に出したかったため、
`useMutation` の状態をそのまま画面の表示状態として使う設計にした（終了確定時点で発火すると
画面遷移で mutation 状態が失われるため採用しなかった）。

**How to apply:** 次に mutation（POST/PUT/DELETE 系の書き込み操作）を実装する際は、この
`useWalkSave.ts` を雛形にする。読み取り専用の `useQuery` 系フックは `useWalkRoute.ts` を
参照する（[[services-real-dev-mock-pattern]] とは別軸の話）。
