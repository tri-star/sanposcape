---
name: mobile-react-correctness
description: mobile の React と TanStack の静かな不具合の観点 — useQueries の combine、React.memo の props 安定性、自己キャンセルする effect、成功後の busy、部分保存の基準値、AbortError の診断ログ、連結キー、mock が隠す catch 漏れ
metadata:
  type: feedback
  scope: durable
---

どれも機能テストでは落ちず、「意図した動作が黙って効かない」形で残る。実装側の注意は `.claude/agent-memory/mobile/hooks-and-query.md`。

## useQueries の戻り配列は毎レンダー新しい参照

`useMemo(() => derive(queries), [queries])` は実質毎回再計算され、結果を渡した `React.memo` の子が無効化される（SS-118。決定は ADR-M-012 D15）。
**確認:** `combine` にモジュールレベルの純粋関数を渡しているか（インラインのクロージャは不可）。再試行も `combine` の戻り値から呼ぶ。`useQuery` 単体の `.data` 依存は問題ない。

## React.memo の props と閉じ込めた配列

- `React.memo` のコンポーネントが複数箇所から使われていたら、全呼び出し元でコールバックが安定しているか横並びで比べる（片方だけ `useCallback` で memo が効かなかった）。
- `exhaustive-deps` を外して配列を閉じ込めた `useCallback` は、配列の長さが後から変わりうるなら stale closure を疑う。

## 自分の dispatch でキャンセルされる effect

1件ずつ処理するキュー・ポーリングの hook で、(1) effect の依存配列に自分が dispatch する state があるか、(2) その dispatch が `await` より前に同期で呼ばれるか。
両方なら自分の cleanup で結果を握りつぶす（SS-88 `usePinPhotos.ts`）。無効化が「本当に不要になった条件」だけで行われているかを見る。

## 成功後も busy として扱う

`useMutation` の `isPending` は settle と同時に false になる。成功後の遷移が非同期チェーン（`signOut()` → store → `AuthGate` の effect）だと、
その間ボタンが押せる見た目に戻る（SS-62 のアカウント削除で、2回目が 401 になりうる）。
**確認:** 破壊的操作のダイアログの disabled が成功状態（`deleted`）も busy に含めているか。成功時に同期で遷移するなら問題にならない。

## 部分保存の後の基準値

差分 PATCH + 多段保存（PATCH → 写真削除 → 写真追加）で途中失敗しても画面に留まれるとき、成功した段の応答で基準値を作り直さないと、
「A→B を保存→A に戻す」編集が差分ゼロになりサーバーに届かない（SS-119。決定は ADR-M-017 D11）。
**確認:** 基準値の作り直し、「A→B→A」のテスト、基準値の確定で fetching 中のキャッシュを掴んでいないか。

## 診断ログに正常な中断が紛れる

削除・画面離脱で `AbortController.abort()` が走ると、進行中の fetch の AbortError が分類関数経由で「失敗」として記録されうる（SS-88。`isAbortError()` で解消済み）。
**確認:** 能動的に abort する経路があるか、分類の前に意図した中断を除いているか。JSDoc の「呼び出し側で弾く」を鵜呑みにせず catch ブロックを読む。

## 文字列連結のキー

`${a}:${b}` の重複判定キーは区切り文字が値に含まれると衝突し、処理が黙ってスキップされる。
**確認:** 指摘の前に値の生成元（`randomUuidV4()` など）を grep し、今起こりうるかで重大度を決める。起こりえなければ保守性の Suggestion に留める。

## mock / dev が隠す catch 漏れ

`src/services/*` の mock / dev は常に成功するので、呼び出し側 hook の `.catch` 欠如が開発中に見えない。real（Google サインイン → `POST /auth/session` など）は reject しうる。
**確認:** services を呼ぶ hook に `.catch` かエラー state があるか。無ければ P2。
