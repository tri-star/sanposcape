---
name: self-cancelling-preupload-queue-effect
description: useEffectの依存配列に自分自身がdispatchするstateが入っていると、effect自身の進行中タスクをcleanupが誤ってキャンセルする（SS-88 usePinPhotos.tsで発見）
metadata:
  type: feedback
  scope: durable
---

`useEffect(() => { ...; dispatch(action); await something(); if (cancelled) return; dispatch(result); }, [items, ...])`
という形（1回に1件だけ処理するキュー・ポーリング系 hook）で、`items` が effect の依存配列に
入っており、かつ **その effect 自身が同期的に発行する最初の dispatch が `items` を変える**場合、
React はその dispatch をトリガーに（ネットワーク応答よりずっと早く）再レンダーし、
"前回実行" のクリーンアップ（`cancelled = true`）を呼んでしまう。これは同じ実行の
クロージャを指しているため、非同期処理が完了した後の `if (cancelled) return;` が真になり、
**そのタスク自身の最終結果（成功・失敗とも）が握りつぶされる**。

具体例: `packages/mobile/src/features/pin/hooks/usePinPhotos.ts` の先行アップロードキュー。
`dispatch({type:"uploadStarted"})` を `await` の前に呼んでいたため、直後の再レンダーで
自分のクリーンアップが発火し、`uploaded`/`waited`/`failed` の dispatch が届かなくなる
（写真が `uploading` のまま永久に止まる）。さらに `inFlightRef` のような ref を
`.finally()` でクリアしても ref の変更は再レンダーを起こさないため、これ以上 `items` が
変化するきっかけがないとキュー全体が静かに停止する。

**Why:** React の「依存配列変更で cleanup → 再実行」は、effect の外側からの変化を
想定した「stale なリクエストを捨てる」パターン（react.dev の race condition 対策）だが、
「変化の発生源が effect 自身の途中経過そのもの」だと自己参照的にキャンセルされる。
hooks が単体テスト対象外の方針かつ E2E も当該フローを通らない場合、この種のバグは
実機の連続操作でしか顕在化しない。

**How to apply:** 1件ずつ処理するキュー/ポーリング系 hook（先行アップロード・
バックグラウンド同期など）をレビューするときは、(1) effect の依存配列に「その effect が
自分で dispatch する state」が含まれていないか、(2) 含まれる場合、その dispatch が
`await` より前で同期的に呼ばれていないか、を必ず確認する。該当すれば「dispatch のたびに
自己キャンセルしていないか」を疑い、`cancelled` フラグではなく「本当に不要になった条件
（アンマウント・対象アイテムの消失）」だけで無効化する実装（ref ベースのトークン比較等）に
なっているか確認する。関連: [[review-scope-verify-git-state]]（挙動の裏取りが取れない場合は
手動確認や統合テストの追加を提案する）。
