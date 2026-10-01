# ADR-M-015: テーマ（外観）設定は端末ローカルに同期保存し、ネイティブの外観も上書きする

## 日付

2026-10-01

## ステータス

採用（SS-86）。[ADR-M-005](./ADR-M-005-styling-without-unistyles.md) の `ThemeProvider` の範囲を追補する（本文の決定は覆さない）。

## コンテキスト

テーマは端末の外観設定に従うだけだった（`ThemeMode` / `resolveTheme` / `ThemeContext.setMode` は既にあるが、`setMode` の利用は開発用ギャラリーのみで、永続化されず再起動で `system` に戻る）。
SS-86 で、ライト / ダーク / 端末の設定をアプリの設定として持てるようにする。足りなかったのは次の3つ。

1. 永続化と起動時の復元
2. ネイティブ側の外観（ステータスバー・キーボード・iOS の地図など）との一致
3. 設定画面の UI

制約として、ゲスト（トークン非保持。ADR-002 決定6）とオフラインでも動かす必要があり、起動時に別の配色がちらつかないこと。

## 決定

1. **選択値の唯一の情報源は `ThemeContext` の `mode`**。Zustand に複製しない。
2. **外観の上書きはハイブリッド**にする。JS 側は `resolveTheme(mode, useColorScheme())`、ネイティブ側は `Appearance.setColorScheme(toNativeColorScheme(mode))`（system → `"unspecified"`）、ステータスバーは `ThemedStatusBar` でテーマから明示指定する。
3. **永続化は `expo-file-system` の同期 API** で `Paths.document/app-preferences.json`（`src/services/preferences`）。最初の描画の前（`app/_layout.tsx` のモジュール評価時）に読む。保存形式は `{ version, themeMode, themeModeUpdatedAt }`。読込・保存の失敗は throw せず診断ログのみ（起動は止めない）。
4. **端末単位の設定**とする。サインアウト・アカウント削除で消さない（`registerSessionCleanup` に登録しない）。
5. **サーバー同期は行わない**（別課題）。保存形式に `themeModeUpdatedAt`（ユーザーが明示的に選んだ時刻）を持たせて備える。
6. **フィーチャーフラグで包まない**。
7. **`services/preferences` は real/mock の環境変数を持たない**（[ADR-M-001](./ADR-M-001-folder-structure.md) 決定4 の例外）。E2E は real のまま再現できる（`clearState` で消える）。単体テストはストレージの DI（`createAppPreferencesService` + メモリ実装）で足りる。ファイル名は `tokenStore.secure.ts` / `tokenStore.memory.ts` の前例に倣い `preferenceStorage.file.ts` / `preferenceStorage.memory.ts` とした。
8. **保存は read-modify-write**。元のファイルが JSON オブジェクトとして読めるときは未知キーを残して既知フィールドだけ上書きし、読めない（壊れている）ときは既知フィールドのみ書く。新しい版のアプリが書いたキーを旧版の保存で消さないため。ストレージ（`File`）の生成は初回利用時まで遅らせ、失敗しても起動を止めない。

## 検討した選択肢

上書き方式:

| 方式 | 内容 | 不採用/採用の理由 |
|---|---|---|
| A. Context のみ | 永続化だけ足す | ステータスバー・キーボード・iOS の地図が OS の設定のまま残り、JS の配色と食い違う |
| B. `Appearance.setColorScheme` のみ | `useColorScheme()` だけを見る | `system` と明示指定を区別できない。iOS 13+ / Android 10+ でしか効かず、効かない端末で設定が無視される |
| **C. ハイブリッド（採用）** | mode は Context、JS は mode から直接、ネイティブは上書きで揃える | JS の配色は古い OS でも常に正しい。ネイティブ部品も対応 OS では揃う |

保存先:

| 保存先 | 結果 |
|---|---|
| **expo-file-system（採用）** | 同期で読める（`File.textSync()`）。導入済みの明示依存で development build の作り直しが不要。アンインストール・データ消去で消える |
| expo-secure-store | 同期版はあるが秘密情報用。iOS では再インストール後も Keychain に残りうる |
| AsyncStorage | 非同期のみ。新しいネイティブ依存で、ちらつきか起動遅延が出る |
| backend のみ | ゲスト・オフラインで動かず、取得完了までちらつく |

フィーチャーフラグ: `/app-config` は非同期取得で失敗時 OFF に倒れるため、保存値の適用をフラグで制御すると毎回ちらつき、オフラインで明示設定が無視される。UI だけを隠しても既に選んだユーザーには効き続けるので緊急停止にならない。既定値（system）は従来の挙動と同じで、backend の変更も無く、ストア公開前でもある。

## 決定理由

- 要件（Light/Dark/System の切替、既定は System）はローカル保存だけで満たせ、ゲスト・オフライン対応のためどの案でもローカル保存は必須になる。
- 外観は OS 自体も端末ごとの設定であり、端末単位で違和感がない。
- 同期を入れると「サインイン直後にサーバー値で配色が切り替わる」「どちらを優先するか」という仕様判断が増えるため、分割して別課題で決める。

## 影響

- `system` に戻した直後、1フレームだけ前の上書き値で描画されうる（ネイティブからの `appearanceChanged` で収束する。許容）。
- `Appearance.setColorScheme` は iOS 13+ / Android 10+ のみ有効。古い OS ではネイティブ部品が揃わないが、JS の配色とステータスバーは正しい。
- Android の Google Maps のタイルはもともとライト固定で、今回も変えない。
- `DesignSystemGallery` の Switch も永続化されるようになる（開発用画面。許容）。
- 開発中の JS リロードではネイティブに前回の上書きが残るため、保存値が `system` だと初回フレームが前回の配色になりうる（開発時のみ）。
- `Tabs` に `itemTestIDPrefix` を追加した（E2E 用）。
- サーバー同期（フェーズB）は別課題。保存形式の移行は不要。ただしフェーズB では、`load()`（設定全体の読み出し）と `themeModeUpdatedAt` の更新を制御できる書き込み I/F をサービスに足す必要がある（現状は `loadThemeMode` / `saveThemeMode` のみで、保存のたびに updatedAt が更新される）。今は YAGNI として I/F を広げない。
- **Android で「端末の設定」のとき OS のダーク切替に追従しない疑い**（[ADR-M-008](./ADR-M-008-active-walk-state-and-route-cache.md) の未確認事項）は、SS-86 の PR 作成後に Android エミュレータ（Pixel_6_Pro_API_35 / development build）で確認し、**再現しなかった**。「ライト」「ダーク」を選んでから「端末の設定」へ戻した状態で `adb shell "cmd uimode night yes|no"` を切り替えると、アプリはその場で追従した。保存値が `system` のまま起動した直後の追従は、この確認には含まれない。

## サーバー同期（フェーズB・別課題）への申し送り

SS-86 の計画時に洗い出した要件と方針の案。フェーズB で採用するかはその課題で決める（決定5を差し替えるときに、ここも更新する）。

- **既存 API は流用しない**。`/auth/session` / `/auth/refresh` の `SessionRead.user` は identity snapshot として [ADR-M-009](./ADR-M-009-auth-session-state-and-route-gate.md) で例外的に許容された値なので、設定値を混ぜると情報源が二重になる。`/app-config` はユーザー非依存。
- **API の案**（どちらも認証必須。未認証は 401。ワイヤは snake_case）:
  - `GET /users/me/preferences` → 200 `{ "theme_mode": "system" | "light" | "dark", "updated_at": string(date-time) | null }`。一度も保存していないユーザーにも 404 にせず、既定値（`system` / `null`）を返す。
  - `PATCH /users/me/preferences`（全フィールド任意の部分更新）→ 200 で更新後の全体を返す（`updated_at` はサーバー時刻）。同じ値を繰り返し送ってもよい（冪等）。
  - OpenAPI の enum 名は `ThemeMode` を避ける（Orval 生成物の型名が mobile の `@/theme` の `ThemeMode` と重なる）。例: `ThemeModePreference`。
  - 保存先（新テーブルか `users` のカラムか）は backend で決めてよい。要件は「アカウント削除で一緒に消えること（ON DELETE CASCADE。SS-12 / SS-62 の削除契約）」と「`updated_at` を返せること」。
- **同期方針の推奨案: サーバーは新しい端末への初期値の供給源**とする。端末時計の比較（LWW）はしない。
  - `authenticated` になった時点（セッション復元成功、またはゲストからのサインイン）で `GET` を1回呼ぶ。この端末で一度も選んでいない（`themeModeUpdatedAt === null`）かつサーバーに値がある（`updated_at !== null`）ならサーバー値を適用し、ローカルにも保存する（`themeModeUpdatedAt` はサーバー値を写し、「今」を刻まない）。
  - ローカルで選択済みなら、ローカル値を `PATCH` で送る（ローカル優先）。設定画面で変更したときも、`authenticated` なら `PATCH` を送る（失敗は無視し、次回の同期で再送される）。
  - ゲスト・オフライン・401 のときはローカルのみで動く。サインアウトしてもローカル値は残す（決定4）。
  - 対案: `updated_at` の新しい方を採る LWW（端末の時計ずれが課題）、サーバー常に優先（ゲスト中に選んだ値がサインインで上書きされる）。
- **mobile 側で必要になる変更**:
  - サービスに、設定全体を読む `load()` と、`themeModeUpdatedAt` を指定して書ける I/F を足す（「影響」を参照）。
  - 同期の判定は純粋関数に切り出す（例: `decideThemeModeSync({ localUpdatedAt, server })` → サーバー値を適用 / ローカル値を送る / 何もしない）。
  - backend と mobile の両方に変更が要るので、mobile の同期処理はクライアント向けフィーチャーフラグで包む（API 自体はフラグなしで公開してよい）。

## 関連情報

- [ADR-M-005](./ADR-M-005-styling-without-unistyles.md) / [ADR-M-008](./ADR-M-008-active-walk-state-and-route-cache.md) / ADR-002 決定6（ゲスト = トークン非保持）
- [release-runbook](../../../docs/release-runbook.md)（フィーチャーフラグの要否の目安）
