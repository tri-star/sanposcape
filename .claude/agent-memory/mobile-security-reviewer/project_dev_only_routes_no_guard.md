---
name: project_dev_only_routes_no_guard
description: app/ 配下の大半のルートに認証ガードがない（SS-15時点でも再確認済み）。settings.tsx のみ画面内チェックあり
type: project
---

`packages/mobile/app/design-system.tsx` と `app/dev-screens.tsx`（SS-9）に加え、`app/walk-start.tsx` /
`app/(tabs)/index.tsx`（`WalkActiveView`）/ `app/(tabs)/history.tsx` / `app/(tabs)/search.tsx` /
`app/walk-summary.tsx` も、SS-15 時点（2026-07-30 確認）で認証ガードが一切ない。
`app/_layout.tsx` はレイアウト単位のガードを持たず、`QueryClientProvider`/`ThemeProvider`/`Stack` を積むだけ。

唯一 `src/features/settings/components/SettingsView.tsx` だけが画面内で
`authService.getCurrentUser() === null` を見て `/(auth)/sign-in` へ `router.replace` する
個別実装のガードを持つ（コメント「認証全体のルートガードは SS-13 で扱う」とあるが、SS-15 の作業ブランチ時点でも
レイアウト単位のガードは未実装のまま）。

**Why:** `features/walk/**` が `services/auth` を import しない設計（M4 完了条件、認証と探索ロジックの分離）と、
グローバル認証ガードの不在は別問題。後者が無いことで、未サインインのままディープリンク
（例: `sanposcape://walk-start`）から地図・現在地取得 UI に到達できる。ただし `/explore/places` は
backend が Bearer 必須で 401 を返すため、候補データ自体は漏れない（[[project_auth_stub_switch]] とは独立の論点）。
影響は「UI 到達性」止まりで、他ユーザーのデータや認可データの漏洩には直結しない（Low〜Medium 相当）。

**How to apply:** 今後 SS-13 相当（認証ルートガード）が実装されたら、`app/_layout.tsx` または `(tabs)/_layout.tsx`
のようなレイアウト単位で全ルートに効いているか、`settings.tsx` の個別実装が二重実装のまま残っていないかを確認する。
それまでは「グローバルガード不在」を継続指摘する（新規ルート追加のたびに増分は小さいが、累積すると見落としやすい）。
