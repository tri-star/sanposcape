---
name: project_ss57_guest_walk_start
description: SS-57 ゲスト散歩解禁レビューの要点。canEnterProtectedRoutes に guest 追加、退避判定を状態遷移ベースに変更。問題なしと判定
type: project
---

SS-57（branch `tri-star/ss-57`, commit `afeaae7`）で `canEnterProtectedRoutes` が
`status === "authenticated" || status === "guest"` になり、ゲスト（トークン非保持）が
散歩開始・記録タブ・履歴・設定に到達できるようになった。レビューで Critical/High なし。

**確認した安全設計**:
- `splashDestination.ts` は `canEnterProtectedRoutes` への委譲をやめ `status === "authenticated"`
  を直接判定。理由: guest も許可されると委譲のままではコールドスタートが `/walk-start` に直行し、
  サインイン画面（ゲスト導線と Google サインインの唯一の入口）に到達できなくなるため。
  サインイン画面は `PUBLIC_ROOT_SEGMENTS` の公開ルートなのでゲートとの食い違いは起きない。
- サインアウト/401失効時の退避条件が「guest かどうか」から `shouldEvacuateOnSessionEnd`
  （`authenticated → guest` の状態遷移 + 非公開ルート）に変更された。`AuthGate` が
  `previousStatusRef`（useRef）で前回 status を保持して遷移を検出する。純粋関数化されテストで
  5パターン（authenticated→guest 公開/非公開、loading→guest、guest→guest、guest→authenticated）
  が担保されている。
- `useAuthSessionStore.setSession()` は `previous === "authenticated" && user === null` のときだけ
  `runSessionCleanup()`（queryClient.clear() + useActiveWalkStore.endWalk() +
  useFinishedWalkStore.clearFinishedWalk()）を**同期的に**呼ぶ。退避の useEffect より前に
  cleanup が走るため、退避のリダイレクト完了前に前ユーザーのキャッシュ/位置情報が画面に
  残る窓は無い（ADR-008 決定6 の目的と整合）。
- `SettingsView` はゲストのとき `useAuthSessionStore` の `status === "authenticated"` だけを
  boolean で読み、`user` オブジェクト（PII）は読まない。`.oxlintrc.json` の
  `no-restricted-imports` override 対象は `features/walk/**` / `features/history/**` のみで
  `features/settings` は対象外という前提を確認済み（意図通り）。
- guest の 401 は `hadToken: false` なので `shouldRefreshAndRetry`（`src/api/retryPolicy.ts`）が
  false を返し、refresh を試みない・`onSessionChange` も飛ばない（guest→guest の無意味な
  evacuation 発火なし）。

**Low/Nit（指摘はしたが Medium 未満）**:
- `SettingsView` の「サインイン」ボタンは `router.push("/(auth)/sign-in")`（他の遷移は
  すべて `router.replace` 連鎖）。サインイン成功後 `useAuthActions` が `router.replace("/walk-start")`
  するため sign-in エントリは置き換わるが、push で積んだ settings エントリはスタックに残り、
  サインイン後の walk-start から「戻る」と一度 settings を経由しうる。認可バイパスではない
  （SettingsView は毎回 reactive に現在の status を見るので古い状態を見せない）。

関連: [[project_ss13_auth_gate]]（AuthGate 導入の初回レビュー）、
[[project_ss20_walk_history_walkid_traversal]]（guest がこのルートに到達できるようになった影響を確認済み）。
