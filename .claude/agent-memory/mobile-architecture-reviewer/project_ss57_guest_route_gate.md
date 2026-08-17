---
name: project_ss57_guest_route_gate
description: SS-57（ゲスト散歩解禁・canEnterProtectedRoutesにguest許可）レビュー所見。ADR-009追補の質は高い一方、mid-walk中のsettings経由サインインがwalk-startへ強制遷移し進行中の散歩を暗黙に上書きしうる新規ギャップを発見
type: project
---

SS-57（ブランチ `tri-star/ss-57`、commit `afeaae7`）は ADR-009 決定3「ゲート許可は
`canEnterProtectedRoutes` に `"guest"` を足すだけ」という当初想定が誤りだったことを実装中に発見し、
`splashDestination.ts`（ゲートへの委譲をやめ `authenticated` を直接判定）と退避条件（ゲート判定→
`authenticated → guest` の状態遷移 `shouldEvacuateOnSessionEnd`）の2箇所を追加で作り替えた。

**良い点**:
- ADR-009 に「唯一の変更点という記述は不正確だった」ことを含め、決定3・6・7それぞれに追補が
  入っており、`tmp/SS-57/handover-notes.md` の調査過程（削除すると壊れる2箇所の特定）も
  ADR 本文に要約が残っている。[[project_ss13_auth_session_gate]] や [[project_ss29_route_as_composition_root]]
  で指摘した「判断根拠が tmp/ にしか残らない」問題がここでは再発していない。
- `shouldEvacuateOnSessionEnd` は `AuthGate.tsx` で `useRef` に「前回 status」を持たせ、
  effect本体でミューテートする実装。React 18 StrictMode の effect 二重実行下でも
  （2回目は previousStatus===status で不発火になるため）二重退避しない設計になっている。
- `canEnterProtectedRoutes` を `splashDestination.ts` から独立させた判断は、2つの関数が
  「保護ルートに入れるか」と「起動直後にどこへ送るか」という異なる問い（今回は前者=true でも
  後者はサインイン画面という非対称な答えになる）を扱っているため妥当。両ファイルの JSDoc が
  互いを参照し、`splashDestination.test.ts` に「この1本が委譲の逆戻りを止める防波堤」という
  コメント付きテストがあるため、ドリフト検知の仕組みも用意されている。
- `.oxlintrc.json` の override（`features/walk`/`features/history` のみ対象、`features/settings` は対象外）を
  外さずに `SettingsView` が `useAuthSessionStore` を直接参照した判断は、SS-29 で確立された
  「restricted 対象外 feature は直接参照可、対象 feature はルート経由 props 注入」という非対称ルールと整合。

**新規に見つけた残課題（このレビューで指摘）**:
- ゲスト散歩解禁により、`WalkActiveView`（散歩中タブ）の歯車ボタン → `router.push("/settings")` →
  ゲストなら `settings-sign-in` → `router.push("/(auth)/sign-in")` → Google サインイン成功 →
  `useAuthActions.runSignIn` が無条件に `router.replace("/walk-start")` する経路が新たに到達可能になった。
  この `replace("/walk-start")` は元々「スプラッシュ→サインイン→walk-start」という、進行中の散歩が
  存在し得ない文脈のためのハードコードだった（`useAuthActions.ts` のコメント「/walk-start 到達時に
  canGoBack() === false になる設計」参照）。SS-57 で新設された「mid-walk（`useActiveWalkStore.activeWalk !== null`）
  のままサインインする」経路はこの前提を満たさない：
  1. サインイン成功後、ユーザーは進行中の散歩画面ではなく `WalkStartView`（散歩「開始前」の計画画面）に
     強制的に送られる（アクティブな散歩は `useActiveWalkStore` に残ったまま、画面だけが不一致になる）。
  2. `WalkStartView.handleStartWalk` は `useActiveWalkStore.startWalk()` を無条件 `set()` で呼ぶ
     （既存 `activeWalk` の有無をチェックしない・確認ダイアログも無い）。ユーザーが状況に気づかず
     「散歩を始める」を押すと、進行中だった散歩が確認なしに上書きされる。
  3. `canGoBack() === false` という設計前提も崩れる（`settings` は `push` で積まれているため、
     新しい `walk-start` の下に `settings` が残る）。`WalkStartView` は `useScreenBack({fallbackHref: "/(tabs)"})`
     を使っており、戻る操作が意図しない `settings` 画面への `pop` になりうる。
  - ADR-009 SS-57 追補・`tmp/SS-57/handover-notes.md` はいずれも「記録タブを踏んだゲストが
    `dismissAll()` で強制退去させられる」シナリオ（不採用にした allowlist 案の理由）は検討しているが、
    この「mid-walk のまま設定からサインインする」シナリオは検討されていない。
  - 対応案: `useAuthActions.runSignIn` の成功後遷移を `useActiveWalkStore.getState().activeWalk` の有無で
    分岐する（進行中なら `/(tabs)` に replace、無ければ従来通り `/walk-start`）か、そもそも
    `router.back()` 系で呼び出し元コンテキストへ戻す。手動確認 or Maestro での再現確認が望ましい
    （このレビューでは静的解析のみで、実機/シミュレータでの再現検証はしていない）。

**軽微な指摘**: `src/store/useAuthSessionStore.ts` の `AuthSessionStatus` 型 JSDoc（`guest` の説明）が
「MVP ではゲートで弾く（将来のゲスト散歩ではこの状態のまま探索を許可する）」のまま残っており、
SS-57 で「将来」が現在になった後も更新されていない。このファイルは SS-57 プランの編集対象ツリーに
含まれていなかった（[[project_ss19_walk_finish]] / [[project_ss13_auth_session_gate]] と同種の
ドキュメントドリフトパターン）。同様に `app/settings.tsx` の「設定画面（ログアウト導線）」、
`ScreenCatalog.tsx` の設定画面 description「ログアウト導線（サインイン後に確認）」も
ゲスト分岐を反映していない（優先度は低い）。

**関連メモリ**: [[project_ss13_auth_session_gate]]（ADR-009 初版・退避を AuthGate に一本化した経緯）、
[[project_ss29_route_as_composition_root]]（`features/settings` が oxlint override 対象外という非対称性の初出）
