---
name: project_ss37_guest_walk_signin_merge
description: SS-37（保存失敗401時のサインインCTA・自動再送）レビューの要点。High指摘「未保存ゲストドラフトが無関係な後続サインインに自動添付される」は同PR内で解消済み
type: project
---

SS-37（branch `tri-star/ss-37`、2026-08-15 レビュー）で `POST /walks` 401 時にサインイン CTA を追加し、
サインイン後 `walk-summary` へ `dismissTo` して保存待ちドラフトを自動再送する機能を実装。
`useWalkSave` の自動発火キーに `isSignedIn` を含めた（`walkSaveFireKey`）ことで
guest → signed-in で再発火する。

**High 指摘（同一PR内で解消済み。以下は指摘時点の状況）**:
`useFinishedWalkStore` の未保存ドラフト（`saved: false`）は、`WalkSummaryView` の
「記録を見る」「ホームへ」ボタンでは一切クリアされない（`clearFinishedWalk()` の呼び出し元は
`registerSessionCleanup`（`authenticated → guest` 遷移時）のみ）。かつ `useAuthActions.runSignIn`
（`useAuthActions.ts`）は**サインインの起点を見ずに**、グローバルな `hasUnsavedFinishedWalk` だけで
`router.dismissTo("/walk-summary")` を強制発火する。`SettingsView` の「サインイン」ボタンも
`SignInView` も同じ `useAuthActions` を共有しているため、**walk-summary の CTA 経由でなくても**、
放置された未保存ゲスト散歩ドラフトは「次にこの端末でサインインした誰か」のアカウントへ
無確認・強制遷移付きで自動保存されてしまう。共有端末シナリオ（人物Aがゲスト散歩→保存失敗→放置、
人物Bが無関係にサインイン）で、人物Aの位置情報軌跡が人物Bのアカウントに同意なく書き込まれる。

**訂正（オーケストレーターによる査読。次回この指摘を再利用する際は必ず読むこと）**:
初版のこのメモは「横断 ADR-002 決定6-1『ゲスト記録のマージ機能は作らない』と食い違う」と
書いていたが、**これは過大評価だった**。決定6-1 の該当文は「`POST /walks` は未認証では
許可しない。**サインインを促す導線に倒し**、ゲスト記録を後からアカウントへマージする機能は
作らない」であり、(1)「サインインを促す導線」＝ SS-37 の CTA そのもので ADR はむしろこれを
指示している、(2)「マージ機能」＝**既にサーバーへ永続化されたゲスト記録の所有権付け替え**
（決定理由に「所有権付け替えと `client_walk_id` 冪等キーの再設計という複雑さ」と明記）を指し、
ゲスト記録はそもそも永続化されないため SS-37 は該当しない。
**ADR-002 との矛盾は無い**。共有端末のプライバシー懸念だけが正味の指摘であり、
その一点で High 判定自体は妥当だった。ADR を根拠に severity を上げないこと。

**Why**: SS-37 のタスク指示（呼び出し元プロンプト）で名指しされていた懸念点そのもの。
「ゲスト＝ユーザーに紐付いていない軌跡」という軽減要因はあるため Critical ではなく High 判定とした
（他人の既存個人情報漏洩ではなく、同一端末上での意図しない自分アカウントへの他人データ混入という
一段階弱いリスクのため）。

**実際の対応（同一PR内、commit `210ec34`）**: 上記(2)「サインインの起点を区別する仕組み」を
採用して解消した。`useFinishedWalkStore` に `signInForSaveRequested`（サマリ画面の CTA を
押したという明示的意思表示。`finishWalk`/`markSaved`/`clearFinishedWalk` でリセット）を追加し、
`nextWalkSaveFireKey` と `getPostSignInDestination` がこのフラグを唯一のゲートにする。
ルールは非対称: 初回発火と別ドラフトへの切替は無条件（サインイン済みユーザーの通常保存を
壊さないため）、**同一ドラフトの認証状態変化による再発火だけが意思表示を要求する**。

**未対応で残した部分**: (1)「未保存ドラフトの明示的破棄導線」（`WalkSummaryView` の
「記録を見る」「ホームへ」離脱時の確認ダイアログ + `clearFinishedWalk()`）は UX 変更を伴い
SS-37 のスコープ（行き止まり解消）を超えるため見送り、フォローアップ起票を推奨した。
そのため「未保存ドラフトがプロセス生存中メモリに残り続ける」こと自体は依然として真。

**How to apply**: 次回このフロー（`useAuthActions.ts` / `postSignInDestination.ts` /
`walkSaveTrigger.ts`）に変更が入るレビューでは、`signInForSaveRequested` のゲートが
外れていないか（特に「初回無条件」の例外が広がって同一ドラフトの再発火まで無条件に
なっていないか）を最初に確認する。あわせて未対応の(1)が起票・実装されたかも見る。

**副次確認（Low、実害なし）**: `signed-in → guest`（サインアウト/セッション失効）方向の再発火は、
`useAuthSessionStore.setSession()` 内で `runSessionCleanup()`（`finishedWalk` クリア含む）が
**同期的に先行**するため、`useWalkSave` の effect が実行される時点で既に `finishedWalk === null` に
なっており実質到達不能。`walkSaveTrigger.ts` の JSDoc はこの理由付けを「冪等性 + AuthGate 退避」と
説明しているが、実態は「セッション後始末が先に走ってドラフトが消えるため発火条件に届かない」。
コードと乖離した説明だが結論（安全）自体は正しい。→ 同一PRで JSDoc を実態に合わせて修正済み。

関連: [[project_ss19_walk_finish_save]]（`useFinishedWalkStore` 新設時のクロスアカウント懸念の初出。
サインアウト時未クリアの指摘はその後 `registerSessionCleanup` 登録で解消されたが、
「明示的破棄導線が無い」という部分は今回まで未解消のまま持ち越されていた）、
[[project_ss13_auth_gate]]（`AuthGate` は今回もバイパスされていないことを確認済み）、
[[project_ss57_guest_walk_start]]（ゲスト散歩解禁がこの経路の前提）。

レビュー結果は `tmp/SS-37/mobile-local-review.md` の `## セキュリティレビュー` に記載
（このファイルは将来削除・移動される可能性あり）。
