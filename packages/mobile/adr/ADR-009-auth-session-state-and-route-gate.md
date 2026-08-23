# ADR-009: 認証セッション状態を1箇所に集約し、認証ゲートで未認証を弾く

## 日付

2026-08-06（初版 / SS-13）、2026-08-11 追補（SS-50）、2026-08-13 追補（SS-57）、2026-08-14 追補（SS-57 ローカルレビュー対応）、2026-08-15 追補（SS-37）、2026-08-15 追補（SS-37 ローカルレビュー対応）

## ステータス

採用（SS-13、SS-50 追補、SS-57 追補、SS-37 追補）。[横断 ADR-002](../../../docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md) 決定6（「ゲストは `AuthService` のメソッドではなく、トークン非保持の認証状態として表現する」）を実装に落とす。[ADR-008](./ADR-008-active-walk-state-and-route-cache.md) 決定6（サインアウト時の後始末）を追補する。SS-57 で、SS-49 合意（未認証でも `/explore/*` を呼べる）に基づきゲスト散歩を解禁した。

## コンテキスト

SS-10（services 層の認証）・SS-11（認証画面・スプラッシュ）の時点で、認証状態の参照と未認証の扱いが画面ごとに閉じていた。

- `SplashView` は `authService.restoreSession()` の戻り値を直接見て遷移先を決め、`SettingsView` は `authService.getCurrentUser()` を自前で読んで未認証なら `router.replace("/(auth)/sign-in")` していた。**認証状態の参照元が画面ごとに分散**していた。
- **認証ゲートが存在しなかった**。`sanposcape://settings` のようなディープリンクや `/dev-screens` からの直接遷移で、未認証のまま保護画面に入れてしまう（画面ごとの自衛に依存していた）。
- **セッション復元がスプラッシュ画面に閉じていた**。`SplashView` の `useEffect` でしか `restoreSession()` を呼んでいなかったため、**ディープリンクでのコールドスタートでは復元が走らなかった**（`/` を経由しないため）。
- `createSessionAuthService` には `onSessionChange` という継ぎ目（「SS-13 の継ぎ目。本タスクでは未使用でよい」と JSDoc に明記されていた）が用意されていたが、誰にも配線されていなかった。そのため 401 → refresh 失敗（refresh token 失効・再利用検知）でサービス層がセッションを破棄しても、**UI は何も気付けなかった**。
- `useAuthActions.continueAsGuest` が `router.replace("/walk-start")` するだけで、「TODO: SS-13（認証状態と探索ロジックの分離）で認証ゲートと統合する」という TODO が残っていた。

**MVP では未認証（＝ゲスト＝トークン非保持）はゲートで弾く。** ゲスト散歩そのものは実装しない。将来ゲスト散歩を許可するときに純粋関数1本を変えるだけで済む形にすることをスコープに含めた。

**（SS-57 追補）** 上記は初版（SS-13）時点の前提であり、現在は成立していない。SS-49 の合意（`/explore/*` の任意認証化）を受けて SS-57 でゲスト散歩を解禁した。また「純粋関数1本を変えるだけ」という想定も不正確だったことが判明している（詳細は決定3・決定6の追補、および「SS-57 追補: ゲスト散歩の解禁」節を参照）。

## 決定

### 1. 認証状態は `src/store/useAuthSessionStore.ts`（Zustand）に集約する

`loading | authenticated | guest` の3状態で表す。

- `loading`: 起動時のセッション復元中。まだ「認証済み/未認証」を判定してはいけない。
- `authenticated`: 自前セッショントークンを保持している。
- `guest`: トークン非保持（ADR-002 決定6 の「ゲスト」はこの状態を指す）。`guest` は `AuthService` のメソッドとしては持たない。

不変条件: `status === "authenticated"` ⟺ `user !== null`。`status === "guest"` ⟺ `user === null`。永続化しない（`persist` ミドルウェアを使わない）。

**`folder-structure.md` の `src/store/` 原則（「サーバー由来のデータを置かない」）の例外**: `user`（`/auth/session` レスポンス由来）はこの原則の例外として扱う。`user` はセッションのライフサイクルと1:1で変わる identity snapshot であり、TanStack Query が管理する一般的なドメインデータ（散歩記録・履歴など、複数箇所からフェッチ・再検証されうるもの）とは性質が異なるため。`user` をストアから外してセッション状態だけを持たせる案は採らなかった。`authenticated ⟺ user !== null` という不変条件を弱めることになり、UI が「認証済みだがユーザー情報が無い」中間状態を扱う必要が生まれてしまうため（[ADR-008](./ADR-008-active-walk-state-and-route-cache.md) が `useFinishedWalkStore.savedWalkId` に認めている例外と同種の判断）。

### 2. ストアへの書き込み経路は2つだけにする

1. `services/auth/index.ts` が `onSessionChange` として配線するコールバック（サインイン・サインアウト・401 → refresh 失敗のすべてがここを通る）。
2. `features/auth/hooks/useAuthSessionBootstrap.ts`（起動時のセッション復元）。

UI（features / app）は `authService.getCurrentUser()` を直接呼ばない。`AuthService.getCurrentUser()` の JSDoc に「UI からは呼ばない」旨を明記した。

`useAuthSessionStore` は `@/services/auth`（バレル）を**実行時 import しない**。`AuthUser` は `import type` で `@/services/auth/types` から取る。バレルは `getAuthMode()` の結果次第で `expo-secure-store` / `react-native-nitro-google-signin` に到達し、node 環境の vitest（このストアのテスト）を壊すため。逆向き（`services/auth/index.ts` → `@/store/useAuthSessionStore`）は許可する。バレルは既に `@/api/authTokenProvider` へ自分を登録しており、「認証の合成ルート」という同じ役割の延長にあたる。ストア側は純粋なので循環参照にならない。

### 3. 認証ゲートは `app/_layout.tsx` に置いた `AuthGate` の1箇所だけにする

判定は純粋関数 `resolveAuthGateDecision`（`features/auth/lib/authGate.ts`）に切り出し、弾く条件は `canEnterProtectedRoutes` の1関数に閉じる。

初版（SS-13）時点の実装は以下だった:

```typescript
// 初版（SS-13）。SS-57 で下記のとおり変更済み（このコードブロックは経緯を示す当時のスナップショット）。
export function canEnterProtectedRoutes(status: ResolvedAuthSessionStatus): boolean {
  return status === "authenticated";
}
```

初版では「将来ゲスト散歩を許可するときは、ここに `"guest"` を許可として足すのが唯一の変更点」としていたが、**この記述は不正確だった（SS-57 追補）**。実際には `canEnterProtectedRoutes` はゲート以外に `splashDestination.ts`（決定3の下記）からも参照されており、1行変更だけでは未サインインの起動が `/walk-start` に直行し、サインイン画面（ゲスト導線と Google サインインの唯一の入口）に到達できなくなる。SS-57 時点の実装は以下（`status === "authenticated" || status === "guest"` と明示的に列挙し、`return true` にはしていない）:

```typescript
export function canEnterProtectedRoutes(status: ResolvedAuthSessionStatus): boolean {
  return status === "authenticated" || status === "guest";
}
```

詳細は下記「SS-57 追補: ゲスト散歩の解禁」を参照。

`AuthGate` は「起動時のセッション復元の起動」（`useAuthSessionBootstrap`）と「ゲート判定に基づく遷移」を担う、UI を持たないコンポーネント。`children` を条件分岐で差し替えず（`<Stack>` のアンマウント＝ナビゲータ再生成を避けるため）、`useEffect` の依存には `segments`（配列。レンダーごとに同一性が変わりうる）ではなく `redirectHref: string | null` を置く。

認証済みユーザーを `(auth)` から追い出さない（片方向のゲート）。双方向にすると `/dev-screens` からサインイン画面を開けなくなり、遷移が往復して読みづらくなるため。サインイン成功後の遷移は `useAuthActions` が行う（遷移先は `/walk-start` 固定ではなく、`getPostSignInDestination` が進行中の散歩の有無で `/walk-start` と `/(tabs)` を分岐する。SS-57 ローカルレビュー対応。詳細は下記「SS-57 追補」を参照）。**`router.replace(...)` だけとは限らない**: SS-37 で `getPostSignInDestination` が返す遷移先に `router.dismissTo("/walk-summary")` の分岐が加わった（保存待ちドラフトかつサマリ画面の CTA から来た意思表示があるときのみ。詳細は下記「SS-37 追補」「SS-37 ローカルレビュー追補」を参照）。

**`PUBLIC_ROOT_SEGMENTS` に `_sitemap` を含む前提について**: expo-router 57 は `app.json` の expo-router config plugin に `sitemap: false` を明示しない限り、本番ビルドにも `/_sitemap`（ルート一覧）を含める。「開発時のみ提供される」という前提は誤りで、`_sitemap` は本番でも到達可能である。本 ADR ではこれを無効化せず公開ルート扱いのままにする判断をした。理由は、`_sitemap` の内容がルート一覧へのリンクのみでアプリの機微データを含まないこと、RN アプリ自体はバンドル解析によって同等のルート構造情報を得られること、の2点から実害が小さいと判断したため。無効化する場合は `app.json` の expo-router config plugin に `sitemap: false` を設定し、`PUBLIC_ROOT_SEGMENTS` から `_sitemap` を外す（本ブランチでは対応せず申し送りとする）。

### 4. 復元中（`loading`）は絶対に弾かない

`resolveAuthGateDecision` は `status === "loading"` を最優先で `allow` にする。復元は数百 ms で終わり、終われば再評価される。誤ってサインインへ飛ばさないことをテストで固定する。

復元は `SplashView` ではなく `AuthGate`（ルートレイアウト）で走らせる。`useAuthSessionBootstrap` はモジュールスコープのラッチで1回だけ実行し、StrictMode の二重実行でも復元が重複しないようにする。**cleanup では `AbortController.abort()` しない**（`AuthGate` はルートに常駐しアンマウントされないため中断の必要が無く、中断するとラッチにより2回目の実行がブロックされ `status` が永久に `loading` のままになる）。これによりディープリンクのコールドスタートでも復元が成立する。

### 5. 401 → refresh 失敗はストア経由でゲートに届く

`onSessionChange(null)` でストアへ届き、ゲートがサインインへ戻す。**ネットワーク起因の refresh 失敗ではセッションを保持する**（`createSessionAuthService` の既存の挙動をそのまま利用する。変更しない）。

### 6. サインアウト時の後始末（`runSessionCleanup()`）の実行側を移す（ADR-008 決定6 の追補）

実行側を、サインアウト導線（`SettingsView`）から「認証状態が `authenticated → guest` に落ちた時点」（`useAuthSessionStore.setSession`）へ移す。これによりサインアウトだけでなく、refresh token 失効による非自発的なセッション終了でも後始末が走るようになる。詳細は [ADR-008](./ADR-008-active-walk-state-and-route-cache.md) の追補を参照。

**`useAuthSessionStore` 自身を `registerSessionCleanup()` に登録してはいけない**。このストアは「クリアされる側のデータ」ではなく「セッション状態そのもの」であり、`loading` に戻すとゲートがスプラッシュへ送り返してしまう。

**サインアウト・セッション失効の退避は `AuthGate` に一本化する（SS-50 追補）**: `SettingsView` は `authService.signOut()` の起動だけを担う。`authenticated → guest` を受けた `AuthGate` は保護ルート上で `router.canDismiss()` を確認し、可能な場合だけ `router.dismissAll()` を実行してから `router.replace("/(auth)/sign-in")` する。これにより設定画面の Promise callback と React effect の実行順、または二重の `replace` に依存しない。401 → refresh 失敗のように設定画面を経由しない失効にも同じ退避・スタック整理を適用できる。

**SS-57 追補: 退避条件を「ゲート判定（guest を弾く）」から「`authenticated → guest` の状態遷移」へ移した**。SS-57 でゲスト散歩を解禁し `canEnterProtectedRoutes` が guest も許可するようになったため、上記の退避ロジック（「`resolveAuthGateDecision` が guest を保護ルートで弾く」ことに依存していた）が成立しなくなった。移さない場合、ログアウトしても遷移せず `SettingsView` のダイアログが「ログアウト中...」で固まり、401 失効では `runSessionCleanup()` だけが走って画面が取り残される。判定は純粋関数 `shouldEvacuateOnSessionEnd`（`features/auth/lib/authGate.ts`）に切り出し、`AuthGate` は前回 `status` を `useRef` で保持して遷移を検出する。退避を `AuthGate` の1箇所に集約するという本決定の狙いは維持している。

### 7. ゲスト導線（「ゲストで試す」）

初版（SS-13）では MVP スコープでボタンを外していた。**SS-57 で復活した**（`sign-in-guest-button` / `sign-up-guest-button`）。詳細は下記「SS-57 追補: ゲスト散歩の解禁」を参照。

### 8. `features/walk` / `features/history` から認証への import を oxlint で禁止する

`.oxlintrc.json` に `no-restricted-imports` の override を追加し、`@/services/auth` / `@/services/auth/*` / `@/store/useAuthSessionStore` への import をエラーにする。既存コードはこれらに一切依存していなかったため、新規違反の追加を禁止するだけで既存コードの修正は不要だった。SS-57 でゲスト散歩を解禁した後もこの override は外していない（`features/walk` / `features/history` はゲスト時の差異を API の 401 分類に吸収しており、認証状態を直接見る必要が発生しなかったため）。

### SS-57 追補: ゲスト散歩の解禁

SS-49 の合意（2026-08-11）で `/explore/places` `/explore/routes/walking` が任意認証になり（未認証は IP バケットでレート制限、backend 実装は SS-56）、決定7 が MVP スコープとしていた前提（「ゲストボタンを押しても何も起きない」）が解消されたため、ゲスト散歩を解禁した。

- **`canEnterProtectedRoutes` に `"guest"` を許可として追加した**（決定3）。`status === "authenticated" || status === "guest"` と明示的に列挙し、`return true` にはしていない。`resolveAuthGateDecision` と `AuthGateDecision` 型はそのまま残した。現状 `redirect` を返す経路は無いが、「保護ルートに誰が入れるか」の判断を1箇所に閉じる器を壊さないため、また将来「ゲストは入れないルート」が必要になったときの追加場所を固定するためである。
- **`splashDestination.ts` はゲートへの委譲をやめ、`status === "authenticated"` を直接見る形に変えた**。当初（決定3 初版）の想定は「1行変更だけで済む」だったが、`splashDestination.ts` が `canEnterProtectedRoutes` に委譲していたため、1行変更では未サインインの起動が `/walk-start` に直行し、サインイン画面（ゲスト導線と Google サインインの唯一の入口）に到達できなくなる。委譲で防ぎたかった「スプラッシュが通した先でゲートが弾く」向きの食い違いは、送り先（サインイン画面）が公開ルート（`PUBLIC_ROOT_SEGMENTS` の `(auth)`）である限り発生しないため、委譲をやめても安全と判断した。
- **サインアウト / 401 失効時の退避条件を「ゲート判定」から「`authenticated → guest` の状態遷移」（`shouldEvacuateOnSessionEnd`）へ移した**（決定6 の追補、詳細は上記）。
- **ゲスト導線を復活させた**（決定7）。`SignInView` / `SignUpView` に `sign-in-guest-button` / `sign-up-guest-button` を追加し、`useAuthActions.continueAsGuest`（`router.replace("/walk-start")`）を呼ぶ。`authService` は呼ばない（ゲストは「トークン非保持状態」であって `AuthService` のメソッドではないため。ADR-002 決定6）。
- **影響**: ゲストは記録タブ・履歴・設定にも入れるようになった。`/walks` 系（保存・履歴・統計）は 401 になり、既存のエラー分類（`walkSaveError.ts` / `walkHistoryError.ts` / `walkStatsError.ts`）の文言で degrade する。ルート単位の allowlist で guest を一部ルートから締め出す案（記録タブ等は引き続き弾く）も検討したが、タブバーの「記録」タブは散歩中でも常に見えているため、ゲストが記録タブを踏んだ瞬間に `dismissAll()` で進行中の散歩から強制退去させる導線になってしまい、全ルート開放より明確に体験が悪いため不採用にした。保存失敗時のサインイン誘導 CTA（当時の文言は再試行ボタン無しの「サインインし直すと、記録を保存できます。」）の改善は **SS-37 で対応済み**（下記「SS-37 追補: 保存失敗時のサインイン誘導」を参照。文言も「サインインすると、この散歩の記録を保存できます。」へ変更した）。
- **設定画面（`SettingsView`）はゲストのときログアウトの代わりにサインイン導線（`settings-sign-in`）を出す**。ゲストのまま `/settings` に到達できるようになったため、押しても何も起きない・固まる「ログアウト」を見せないための対応。`features/settings` は `.oxlintrc.json` の `no-restricted-imports` override の対象外（対象は `features/walk` / `features/history` のみ）なので、`useAuthSessionStore` を直接参照する（決定2 の「UI は `authService.getCurrentUser()` を見ない」は維持）。

### SS-57 ローカルレビュー追補: mid-walk 中の設定経由サインインへの対応

SS-57 のローカルレビューで、「散歩中タブの歯車 → 設定 → guest向けサインイン導線 → Google サインイン成功」という経路が生まれたことが指摘された。上記「ゲスト導線を復活させた」時点の実装は `useAuthActions.runSignIn` の成功後に無条件で `router.replace("/walk-start")` していたため、進行中の散歩が見えない画面に飛ばされ、気づかず「散歩を始める」を押すと**進行中の散歩が無警告で上書きされる**問題があった。

- **サインイン成功後の遷移先を、進行中の散歩の有無で分岐するようにした**。純粋関数 `getPostSignInDestination`（`features/auth/lib/postSignInDestination.ts`）を新設し、`useActiveWalkStore.activeWalk !== null` のときは `/(tabs)`（`WalkActiveView` が引き続き表示される既定ホーム）、無ければ従来どおり `/walk-start` へ `router.replace` する。`continueAsGuest`（サインイン画面の「ゲストで試す」）はこの分岐の対象外（サインイン画面から到達する時点で進行中の散歩は無い正規の導線のため、従来どおり `/walk-start` 固定）。（**SS-37 で `getPostSignInDestination` は「遷移先の文字列」から「遷移アクション（`replace`/`dismissTo` + href）」を返す形へ拡張された。下記「SS-37 追補」「SS-37 ローカルレビュー追補」を参照**）
- **`SettingsView` のサインイン導線（`settings-sign-in`）を `router.push` から `router.replace` に変更した**。他の全遷移（スプラッシュ→サインイン、サインイン成功→walk-start/(tabs) 等）が `replace` 連鎖前提であるのに対しここだけ `push` だったため、サインイン後に「戻る」で一瞬 settings 画面を経由しうる不整合があった。

### SS-37 追補: 保存失敗時のサインイン誘導

SS-57 追補（「ゲスト散歩の解禁」節末尾）で「保存失敗時のサインイン誘導 CTA の改善は SS-37 のスコープとする」としていた宿題への回答。**SS-37 で対応済み**。文言は「サインインし直すと、記録を保存できます。」から「サインインすると、この散歩の記録を保存できます。」へ変更した（`walkSaveError.ts` の `unauthorized` メッセージ。「以前サインインしていた」前提を外し、初めてのゲストにも通じる言い回しへ）。

- **シナリオの整理**: `POST /walks` が 401 になる経路は2つあり、性質が異なる。
  - **シナリオA（散歩中のセッション失効）**: `authenticated → guest` の状態遷移が起きるため、決定6 の `shouldEvacuateOnSessionEnd` が発火し `AuthGate` が自動的にサインイン画面へ退避させる。行き止まりにはならないが、`runSessionCleanup()`（ADR-008 決定6）により保存待ちドラフトが消え記録を失う。**この記録喪失は本追補では解かない**（ADR-008 決定5 のフォローアップ課題＝ローカル永続化の担当）。
  - **シナリオB（ゲストのまま保存。本追補の本命）**: 起動時からずっと `guest` で状態遷移が起きないため、`runSessionCleanup()` も `shouldEvacuateOnSessionEnd` も発火しない。ドラフトは無傷のままサマリ画面に留まり、`isRetriableWalkSaveError("unauthorized") === false` のため再試行ボタンも出ない**真の行き止まり**になっていた。
- **決定8（`features/walk` から認証への import 禁止）は維持する**。CTA に必要な認証状態（`isSignedIn`）と遷移ハンドラ（`onSignIn`）は `app/walk-summary.tsx` が `useAuthSessionStore` から読んで `WalkSummaryView` → `useWalkSummary` → `useWalkSave` へ props/引数で注入する（SS-29 で実例化した「ルートが props を注入する」パターン、architecture-guideline 参照）。
- **サインイン画面へは `push` で送る**。他の遷移が `replace` 連鎖の原則（SS-57 ローカルレビュー対応で `settings-sign-in` も `push` → `replace` に変更済み）に対する意図的な例外とする。サマリ画面からの CTA だけ `replace` にすると、サインインをやめて端末バックしたときにサマリへ戻れず**新しい行き止まりを作ってしまう**ため。行き止まり解消が本タスクの目的であるため例外を許容した。
- **サインイン成功後の戻り先は `router.dismissTo("/walk-summary")`**。`getPostSignInDestination`（`features/auth/lib/postSignInDestination.ts`）を「遷移先の文字列」から「遷移アクション（`replace` / `dismissTo` + href）」を返す形に拡張し、優先順を「進行中の散歩（`/(tabs)`）＞保存待ちドラフト（`/walk-summary` へ `dismissTo`）＞既定（`/walk-start` へ `replace`）」とした。進行中の散歩を保存待ちドラフトより優先するのは、決定3 の SS-57 ローカルレビュー対応と同じ理由（散歩の最中に別画面へ連れて行かない）。`dismissTo` を使うのは、CTA から `push` で来た場合に `replace` だとサマリ画面がスタックへ二重に積まれるのを避けるため（`dismissTo` はスタックに対象が無ければ現在画面を置き換えるので、設定画面からのサインインでも破綻しない）。**この「保存待ちドラフト」の判定条件は SS-37 ローカルレビュー対応で変更されている。下記「SS-37 ローカルレビュー追補」を参照。**
- **保存の再送は遷移に依存させない（多重防御）**。`authService.signIn()` 内で `setSession(user)` が走った瞬間にサマリ画面（スタック下で mount 済み）の `isSignedIn` が `true` になり、`useWalkSave` の自動発火 effect（ADR-008 の SS-37 追補、`nextWalkSaveFireKey`）が再発火する。`dismissTo` はユーザーを保存中の画面へ**戻すだけ**であり、仮に遷移が失敗しても保存自体は走る。
- **`continueAsGuest`（サインイン画面の「ゲストで試す」）はこの分岐の対象外**。従来どおり `/walk-start` へ `replace` する。ドラフトはメモリに残るがサマリへ戻る導線が無いため自動再送はされない。ADR-008 決定5 のローカル永続化が入るまではこの制約を許容する。

### SS-37 ローカルレビュー追補: サインインの起点限定（Security High 対応）

SS-37 初版のセキュリティレビューで、上記の自動再発火・`dismissTo("/walk-summary")` による強制復帰が、**「どこから来たサインインか」を一切見ずグローバルな保存待ちドラフトの有無だけで発火する**ことが指摘された。詳細な実装（`useFinishedWalkStore.signInForSaveRequested` / `nextWalkSaveFireKey` 側の条件）は [ADR-008 の同名の追補](./ADR-008-active-walk-state-and-route-cache.md) を参照。本 ADR には認証・遷移側の変更点のみをまとめる。

- **なぜ起点限定にしたか**: 共有端末（家族の共用タブレット・店頭のデモ機など）で、人物A がゲストのまま散歩を記録して保存に失敗（401）、CTA を無視して離脱した場合、保存待ちドラフトは `useFinishedWalkStore` にメモリ上残り続ける。ここで人物B が全く無関係な理由（設定画面の確認など）でサインインすると、起点を見ていない実装では人物Aの軌跡（機微な位置情報）が人物Bのアカウントへ無確認で保存され、人物Bは強制的にサマリ画面へ連れて行かれて見覚えのない記録を目にしてしまう。これは共有端末での**他人のドラフト混入**であり、防ぐ必要がある。
- **対応**: `getPostSignInDestination` の入力を `hasUnsavedFinishedWalk`（保存待ちドラフトがあるか）から `wantsToSaveFinishedWalk`（保存待ちドラフトが**あり、かつサマリ画面の CTA から明示的にサインインした意思表示がある**）へ変更した。`useAuthActions.ts` のセレクタも同じ条件に合わせる（`state.finishedWalk !== null && !state.saved && state.signInForSaveRequested`）。CTA を経由しない無関係なサインイン（設定画面の `settings-sign-in` など）では、保存待ちドラフトが残っていても `dismissTo("/walk-summary")` を選ばず、従来どおり `/walk-start` へ `replace` する。
- **ADR-002（横断）決定6-1 との関係**: 決定6-1（「`POST /walks` は未認証では許可しない。サインインを促す導線に倒し、ゲスト記録を後からアカウントへマージする機能は作らない」）と本追補・SS-37 初版は矛盾しない。「サインインを促す導線」は SS-37 の CTA そのものであり、決定6-1 はむしろこれを指示している。決定6-1 が禁じる「マージ機能」は**既にサーバーに永続化されたゲスト記録の所有権付け替え**（決定理由に「所有権付け替えと `client_walk_id` 冪等キーの再設計という複雑さ」と明記）を指すが、ゲストの散歩はそもそも `POST /walks` が 401 で弾かれサーバーに永続化されない。SS-37 が扱うのは「未保存のままクライアント側に残ったドラフトを、CTA を押した本人が明示的にサインインして保存する」という決定6-1 が推奨する導線そのものであり、ADR-002 の修正は不要と判断した。
- **見送った代替案**: 「未保存ドラフト離脱時（`WalkSummaryView` の『記録を見る』『ホームへ』）に確認ダイアログを出し `clearFinishedWalk()` を呼ぶ」という案も提示されたが、UX 変更（離脱ダイアログの新設）を伴い SS-37 のスコープ（行き止まり解消）を超えるため見送った。起点限定だけでも実害シナリオ（無関係な後続サインインへの混入）は解消できる。「同一端末で CTA を押したのが別人」という残余リスクは本追補の対象外とし、フォローアップ課題として離脱時の明示的破棄を起票することを推奨する。

## 検討した選択肢

### ゲートの実装方式

#### 選択肢1: `AuthGate` + `useSegments()` + effect で `router.replace`（採用）

- **概要**: `app/_layout.tsx` に1つだけ配置し、判定を純粋関数に切り出す。
- **メリット**: 弾く条件を1関数に閉じられる。`loading` を素通しにする分岐を明示的に書ける。未認証時のディープリンクの落ち先を「サインイン画面」と明示できる。
- **デメリット**: `useSegments()` の戻り値の同一性に注意が必要（依存配列の扱いを誤ると redirect が連打されうる）。

#### 選択肢2: `Stack.Protected`（expo-router 57 に存在する）で保護ルートを列挙

- **概要**: `_layout.tsx` で保護ルートを列挙し、ガードの真偽で navigator から出し入れする。
- **メリット**: Expo Router 標準機能で、`router.replace` を自前で呼ぶ必要が無い。
- **デメリット**: ルート一覧を `_layout.tsx` に列挙する必要があり、機能が増えるたびに一覧を更新し忘れるリスクがある。ガードが false に変わると**アンカールート（＝スプラッシュ）へ飛ばされる**ため、サインアウト直後にスプラッシュの最低表示 900ms を挟む挙動になる。保護ルートが navigator から消えるため、未認証時のディープリンクの落ち先が「サインイン画面」ではなくアンカールートになり、意図を表現しづらい。

#### 選択肢3: 画面ごとの自衛（現状・不採用）

- **概要**: 各画面が `authService.getCurrentUser()` を読んで自分で退避する（SS-11 時点の実装）。
- **メリット**: 追加の仕組みが不要。
- **デメリット**: ディープリンクや `/dev-screens` からの直接遷移で防げない画面が生まれうる。画面が増えるたびに同じガードコードを書く必要があり、書き漏れが構造的に起こりうる。

MVP の要件（弾く条件を1箇所に閉じる）は選択肢1 で満たせるため、選択肢1 を採用した。

### ゲスト導線の扱い

**（SS-57 追補）** 本節は初版（SS-13）時点の判断であり、**SS-57 でこの判断は覆された**。SS-49 の合意で「ゲストボタンを押しても何も起きない」という選択肢1採用の前提（下記デメリット参照）が解消されたため、削除していたボタンを復活させた（詳細は上記「SS-57 追補: ゲスト散歩の解禁」）。以下は初版時点の記録として残す。

#### 選択肢1: ボタン削除（初版時点で採用。SS-57 で覆した）

- **概要**: `SignInView` / `SignUpView` の「ゲストで試す」ボタンを削除する。
- **メリット**: 動かない導線がコード上に残らない。
- **デメリット**: デザインモック（`isLogin`）との差分が生まれる。

#### 選択肢2: ボタンを残して「準備中」トースト（不採用）

- **概要**: ボタンは残し、押下時に「ゲスト散歩は準備中です」のようなトーストを出す。
- **メリット**: デザインモックとの見た目の一致を保てる。
- **デメリット**: 実装できない機能の導線を残すと、後から「なぜ動かないのか」の調査コストが繰り返し発生する。復活時期が未定な機能のためだけに専用の分岐を持つコストも生じる。

デザインモックとの差分は本 ADR に記録して復活手順を残すほうが安全と判断し、選択肢1 を採用した。

### ストアの置き場

#### 選択肢1: `src/store/`（採用）

- **概要**: `useAuthSessionStore` を横断的なストアとして `src/store/` に置く。
- **メリット**: `folder-structure.md` の昇格ルール（2つ以上の機能から参照されるなら `src/store/`）に合致する。参照元は `features/auth`（ゲート・スプラッシュ）と `features/settings`（サインアウト導線）、`app/_layout.tsx`（アプリ全体のゲート）にまたがり、将来のゲスト散歩では `features/walk` からも参照されうる。

#### 選択肢2: `src/features/auth/store/`（不採用）

- **概要**: `auth` 機能に閉じたストアとして配置する。
- **デメリット**: 参照元が auth / settings / ルートレイアウトにまたがる＝すでに横断状態であり、最初から `features/auth` に閉じるのは実態に合わない。

最初から横断状態であることが確定していたため、選択肢1 を採用した。

### セッション失効時に walk 系ストアをクリアするか

#### 選択肢1: クリアする（採用）

- **概要**: `authenticated → guest` の遷移（サインアウトだけでなく非自発的失効も含む）で `runSessionCleanup()` を実行する。
- **メリット**: 共有端末でのアカウント切り替え時に前ユーザーの軌跡が次ユーザーのトークンで送信される事故を防ぐという ADR-008 決定6 の目的を、非自発的失効にも広げられる。
- **デメリット**: セッション失効時に未保存の散歩（`useFinishedWalkStore` のドラフト）が失われる（下記「影響」に残存リスクとして明記）。

#### 選択肢2: 保持する（不採用）

- **概要**: `authenticated → guest` では何もクリアしない。
- **メリット**: 未保存の散歩を再サインイン後に救える可能性がある。
- **デメリット**: ADR-008 が守ろうとしたセキュリティ上の性質（前ユーザーのデータが次ユーザーのトークンで送信される事故の防止）を、非自発的失効の経路では守れないままになる。

セキュリティ上の性質を一貫させることを優先し、選択肢1 を採用した。

## 決定理由

- **「保護ルートに誰が入れるか」の判断を1関数（`canEnterProtectedRoutes`）に閉じることを最優先した**。将来ゲスト散歩を許可する際の変更点を最小化し、レビューしやすくするための狙いだったが、**SS-57 での実装時にこの想定は不正確だったと判明した**（`splashDestination.ts` が同関数に委譲していたため、実際には委譲の解消・退避条件の変更を含む複数箇所の変更が必要になった。詳細は「SS-57 追補」）。それでも「判断を1関数に閉じる」という設計自体は維持する価値があると判断し、`canEnterProtectedRoutes` を器として残した。
- **状態遷移の起点をストアの1箇所に集約することで、UI 側の認証状態参照を構造的に一本化した**。画面ごとに `authService.getCurrentUser()` を読む実装が増えるたびに同じ穴（ディープリンクでの弾き漏れ）が繰り返されるのを防ぐ。
- **復元をルートレイアウトへ移したのは、ディープリンクのコールドスタートという既存の欠落を同時に埋めるため**。スプラッシュに閉じたままでは、ゲートを追加しても「保護ルートへ直接遷移したときだけ復元が走らない」という別の穴が残ってしまう。
- **`onSessionChange` の配線を`services/auth/index.ts`に置いたのは、`initAuth()` と同じ「認証の合成ルート」という役割に沿わせるため**。DI を deps 経由で real/dev/mock へ配ることで、`createSessionAuthService` 自体は SS-13 のためのロジックを一切持たずに済む。
- **セキュリティ上の性質（後始末が走ること）を非自発的失効にも一貫させることを優先し、未保存データが失われるリスクは許容した**。前ユーザーのデータ漏出という重大なリスクと比べ、未保存の散歩が失われるリスクの方が小さいと判断した（恒久対応は ADR-008 のローカル永続化フォローアップ課題に依存する）。

## 影響

### ポジティブな影響

- ディープリンクのコールドスタートでセッションが復元されるようになった。
- セッション失効（401 → refresh 失敗）が UI に届くようになった。ゲートが自動的にサインインへ戻す。
- 画面ごとの自衛コード（`SettingsView` の未認証退避）が消えた。
- サインアウト導線と非自発的なセッション失効で、退避と履歴スタック整理が同じ `AuthGate` の処理に集約された（SS-50 追補）。
- 探索/散歩ロジック（`features/walk` / `features/history`）の認証非依存が oxlint で構造的に担保された。
- `useAuthActions.continueAsGuest` の SS-13 向け TODO が解消された。
- **（SS-57 追補）** ゲスト散歩が解禁され、サインインせずに探索・散歩の実行ができるようになった。デザインモック（`isLogin`）との差分が解消された。
- **（SS-37 追補）** ゲストのまま保存に失敗しても、サインイン CTA からサインインして戻れば自動で保存が再送されるようになり、真の行き止まりが解消された。

### ネガティブな影響・トレードオフ

- `/dev-screens` から保護画面を開くには先にサインインが必要になった（`EXPO_PUBLIC_AUTH_MODE=dev` なら1タップで済む）。
- セッション失効時に未保存の散歩（`useFinishedWalkStore` のドラフト）が失われる（決定6 参照。ADR-008 の「アプリを落とすと散歩状態が消える」という既存の残存リスクに、非自発的セッション失効というトリガーが新たに加わった形）。
- ゲートは `loading` 中は素通しのため、ディープリンクで開いた保護画面が復元完了までの数百 ms だけ描画されうる（機微データはサーバー由来で、トークンが無ければ API が 401 になるため実害は小さいと判断している）。
- **（SS-57 追補）** ゲストは記録タブ・履歴・設定にも入れるようになり、`/walks` 系は 401 のエラーカードで degrade する（保存誘導 CTA は **SS-37 で対応済み**。履歴・統計は引き続きエラーカードで degrade する）。
- **（SS-37 追補）** サインイン画面への遷移だけ `push` にする例外が1つ増えた（決定3・SS-57 ローカルレビュー対応が確立した「原則 `replace` 連鎖」に対する意図的な例外）。将来別の CTA を足す際は、行き止まり解消が目的かどうかを基準に `push`/`replace` を選ぶこと。

### 移行・対応が必要な事項

- `features/walk` / `features/history` が認証状態（`guest` かどうか）を見る必要が出たら、`.oxlintrc.json` の override を外すのではなく「ゲスト可否」を props / 引数で受け取る形に寄せること。
  - この形は SS-29 で最初に実例化された: `app/(tabs)/history.tsx`（restricted 対象外の `app/` ルート）が
    `useAuthSessionStore` から表示名を読み、`HistoryView` → `useHistorySummary` へ props / 引数として注入する。
    横断 hook を新設して override を形式的に回避する案は、ルールの趣旨（探索・散歩・履歴のロジックを認証状態に
    依存させない）に反するため採らなかった。同種の合成が必要になった場合はこのパターンに倣うこと。
  - SS-57 時点では `features/walk` / `features/history` に認証状態を見る必要は発生しなかった（ゲスト時の差異は API の 401 分類に吸収されている）。**SS-37 で2例目が実例化された**: `app/walk-summary.tsx` が `isSignedIn` / `onSignIn` を `WalkSummaryView` → `useWalkSummary` → `useWalkSave` へ注入する。
- **（SS-37 追補）** シナリオA（散歩中のセッション失効による記録喪失）は本追補のスコープ外のまま残っている。解消するには ADR-008 決定5 のフォローアップ課題（ローカル永続化）の着手が必要。
- backend との合意が必要になる論点（今回は決めない）としていた2点は、SS-49 で決定済み。決定内容は [横断 ADR-002](../../../docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md) 決定6-1 を参照。
  - `/explore/places` `/explore/routes/walking` は認証を任意化し、未認証でも呼べるようにする（レート制限は既存の IP バケットを流用。backend 実装は SS-56）。
  - `POST /walks`（散歩記録の保存）は未認証では許可せずサインインを促す。ゲスト記録のマージ機能は作らない。
  - ゲスト散歩そのものの解禁は SS-57 で実装済み（本追補）。

## 関連情報

- [横断 ADR-002: 認証は Google 直結 + 自前セッショントークン + 3モードスタブ](../../../docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md) — 決定6「ゲストはトークン非保持の認証状態として表現する」、決定6-1（SS-49 追補、backend のゲスト API 契約）
- [ADR-008: 進行中の散歩は feature スコープの Zustand で保持し、ルートは TanStack Query のキャッシュを画面間で共有する](./ADR-008-active-walk-state-and-route-cache.md) — 決定6（サインアウト時の後始末）を本 ADR で追補
- [architecture-guideline](../docs/architecture-guideline.md) — 認証の扱い
- [folder-structure](../docs/folder-structure.md) — `src/store/` の配置ルール
- 実装: `src/store/useAuthSessionStore.ts`、`src/features/auth/lib/authGate.ts`、`src/features/auth/lib/splashDestination.ts`、`src/features/auth/lib/postSignInDestination.ts`（SS-57 ローカルレビュー対応、SS-37 追補）、`src/features/auth/components/AuthGate.tsx`、`src/features/auth/components/SignInView.tsx`、`src/features/auth/components/SignUpView.tsx`、`src/features/auth/hooks/useAuthSessionBootstrap.ts`、`src/features/auth/hooks/useAuthActions.ts`、`src/features/settings/components/SettingsView.tsx`、`src/services/auth/index.ts`、`.maestro/auth-gate.yaml`、`.maestro/logout.yaml`、`app/(tabs)/history.tsx`（SS-29、ルート経由の props 注入の実例）
- （SS-37 追補）実装: `app/walk-summary.tsx`、`src/features/walk/components/WalkSummaryView.tsx`、`src/features/walk/components/WalkSaveStatus.tsx`、`src/features/walk/hooks/useWalkSummary.ts`、`src/features/walk/hooks/useWalkSave.ts`、`.maestro/guest-walk-save-sign-in.yaml`
- （SS-37 ローカルレビュー対応）実装: `src/features/walk/store/useFinishedWalkStore.ts`（`signInForSaveRequested` / `requestSignInForSave`）、`app/walk-summary.tsx`、`src/features/auth/hooks/useAuthActions.ts`、`src/features/auth/lib/postSignInDestination.ts`（`wantsToSaveFinishedWalk`）
- Plane: SS-13（本 ADR の発生元）、SS-50（サインアウト遷移の一本化）、SS-10（services 層の認証）、SS-11（認証画面・スプラッシュ）、SS-49（backend ゲスト API 契約の決定）、SS-56（backend 実装）、SS-57（mobile 実装）、SS-29（記録タブのユーザー名を認証セッションから供給、ルート props 注入パターンの実例化）、SS-37（本追補の発生元）
