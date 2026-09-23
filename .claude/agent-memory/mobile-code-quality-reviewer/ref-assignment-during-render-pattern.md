---
name: ref-assignment-during-render-pattern
description: このコードベースでは「render中にref.currentへ最新値を代入し、effect/callbackから読む」手法が確立した規約
metadata:
  type: project
---

`features/walk/hooks/useWalkTracking.ts` の `pausedRef`（`pausedRef.current = paused;` を
render本体で直接実行し、`useEffect` 内のクロージャから最新値を読む）が最初の実例。
この手法は `useEffect`/`useCallback` の依存配列にその値を含めたくない
（含めると購読の貼り直し・関数identityの変化が起きる）が、常に最新値を読みたい、
という場面で意図的に使われている。

SS-34 の `src/hooks/useScreenBack.ts` でも `interceptRef` / `fallbackRef` に同じ手法を
踏襲している（コード内コメントで明示的に "既存 `useWalkTracking.ts`（pausedRef）と同じ手法" と
言及）。レビュー時にこのパターンを見ても「render中の副作用的なref代入」として
アンチパターン扱いしないこと。ただしこの手法を使う理由（=どの依存配列から外したいのか）が
コード上に説明されているかは確認する。
