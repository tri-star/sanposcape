---
name: project_dev_only_routes_no_guard
description: app/design-system.tsx と app/dev-screens.tsx は開発確認用ルートだが本番ビルドで除外する仕組みがなく、__DEV__ ガードや env 分岐も一切ない（SS-9 時点）
type: project
---

`packages/mobile/app/design-system.tsx`（SS-8）と `packages/mobile/app/dev-screens.tsx`（SS-9、`ScreenCatalog` を表示）は
コメントで「開発確認用ルート」「プロダクト導線には含めない」と明記されているが、実装上は:

- `__DEV__` や `EXPO_PUBLIC_*` による分岐なし
- `app/_layout.tsx` にも認証ガード自体が一切ない（`(auth)`/`(tabs)` どちらも無条件到達可能）
- Expo Router はファイルベースなので `app/` 配下に置かれたファイルは自動的にルートになり、
  `sanposcape://dev-screens` / `sanposcape://design-system` のカスタムスキームで本番アプリからも到達可能

**Why:** 現時点（SS-9）ではアプリ全体に認証ガードが存在しないため、`/dev-screens` 経由で新たに到達可能になる画面は
実質ゼロ（history や walk-summary は元々ディープリンクで直接開ける）。つまり増分リスクは「開発者向けカタログ画面の存在が
本番ユーザー/リバースエンジニアリングに見える」という情報漏洩・見た目の問題に留まる。ただし認証ガードが将来実装された際、
これらのルートが依然として `app/` 直下に残っていると、ガード実装場所（レイアウト単位か個別画面かによる）次第で
バイパス経路になり得る。

**How to apply:** 今後の認証実装レビューでは、ガードが `app/_layout.tsx` などレイアウト単位で全ルート共通に効くよう
実装されているか（個別画面に条件分岐を書く方式だと dev-screens/design-system が漏れやすい）を確認する。
また、リリースビルド前に dev 専用ルートを除外する仕組み（`app.json` の `router.exclude` 相当、ビルドスクリプトでの
ファイル除外、あるいは最低限 `if (!__DEV__) return null` 的なガード）の導入を推奨事項として毎回指摘する。
[[project_auth_stub_switch]] とあわせて、認証実装タスクが来たときにまとめて確認する。
