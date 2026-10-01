---
name: project-theme-appearance
description: ライト/ダークの実装実態と、アプリ側でテーマを上書きするときの落とし穴（StatusBar auto・Appearance.setColorScheme の値・起動前の同期読込）
metadata:
  type: project
  scope: durable
  adr: packages/mobile/adr/ADR-M-015-theme-mode-preference.md
  verify_by: 2027-03-31
---

SS-86（テーマをアプリ設定に）の計画時にコードと公式ソースで確認した事実（2026-10-01）。

- `ThemeMode = "system"|"light"|"dark"`・`resolveTheme(mode, systemScheme)`・Context の `setMode` は **SS-86 以前から存在する**。
  当時の `setMode` の利用は `DesignSystemGallery` の Switch だけで、永続化はされていなかった。足りないのは保存・起動時の復元・ネイティブ外観の一致・UI。
- **`<StatusBar style="auto" />`（`app/_layout.tsx`）はネイティブの配色を見る**。JS の Context だけでダークを強制すると、暗い背景に黒いアイコンが出る。
  テーマを上書きする設計では、テーマから明示指定するか `Appearance.setColorScheme` を併用する。
- **RN 0.86 の `Appearance.setColorScheme` が受け付けるのは `'light'|'dark'|'unspecified'` だけ**。`'auto'` は RN の最新ドキュメントにしか無く、`null` も不可。iOS 13+ / Android 10+ でのみ有効。
  上書き中は `useColorScheme()` が上書き後の値を返すので、端末の本当の設定は読めない。
- Expo の MainActivity は `configChanges` に `uiMode` を含む（prebuild テンプレートで確認）。そのため上書きしても Activity は作り直されない。
- `app.json` の `userInterfaceStyle: "automatic"` は維持する（`light` にすると iOS が固定される）。Android で効かせるのに必要な `expo-system-ui` は導入済み。
- Android の Google Maps のタイルは常にライト（`MapView` に配色指定なし）。iOS の Apple Maps はネイティブの外観に従う。
- ADR-M-008:287 の「エミュレータで `cmd uimode night yes` にしてもアプリが追従しなかった」は、SS-86 の実装後に確認して**再現しなかった**（「端末の設定」のまま `adb shell "cmd uimode night yes|no"` で即追従。ADR-M-015「影響」）。
  ただし保存値 `system` のまま起動した直後の追従は未確認なので、system モードの挙動に触るプランでは手動確認に入れておく。
- SS-86 で実装済みの形（ADR-M-015）: 保存は `src/services/preferences`、初期値は `app/_layout.tsx` のモジュール評価時に同期で読んで `ThemeProvider` の `initialMode` へ、ステータスバーは `ThemedStatusBar`。
- `Alert.alert` は 2026-10 時点で未使用。ダイアログはすべて独自の `Dialog`。

**Why:** テーマの話は「Context を足せば済む」と見えやすいが、ネイティブ側の部品と起動直後の描画で食い違いが出る。

**How to apply:** テーマ・外観に触るプランでは、ステータスバー・ネイティブ部品・起動前の同期読込（[[project-rn-runtime-capabilities]] の expo-file-system 同期 API）をセットで扱う。
保存値の適用をフィーチャーフラグ（非同期取得）で制御すると毎回の起動でちらつくことにも注意する（[[project-feature-flags]]）。
