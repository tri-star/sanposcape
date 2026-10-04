---
name: mobile-structure
description: packages/mobile の確定した規約・既存UI資産・Expo Router/Orval/地図/ネイティブ設定の落とし穴（テストは mobile-testing、HTTP 出口は project-cloudfront-client-contract）
metadata:
  type: project
  scope: durable
  adr: packages/mobile/adr/ADR-M-001-folder-structure.md
---

# packages/mobile の要点（plan作成の前提）

**スタイル**: react-native-unistyles は撤去済み（ADR-M-005）。RN標準 `StyleSheet` を `@/theme/makeStyles((theme)=>...)` でラップ + `@/theme/useTheme()`。色/余白/角丸/影/文字は `src/theme/tokens.ts` のトークンから取得（ハードコード禁止）。**Unistyles 前提の記述は書かない**。

**Text プリミティブは存在しない** → RN の `Text` を直接 import し theme トークンでスタイルする（`DesignSystemGallery.tsx` が手本）。

**既存UIプリミティブ（`src/components/ui/<kebab>/<Pascal>.tsx`）**: Badge/BottomSheet/Button/Card/Checkbox/Dialog/Icon/IconButton/Input/MapPin/ProgressBar/RoutePolyline/Slider/StatBlock/Switch/TabBar/Tabs/Tag/Toast（2026-10 時点。追加前に `ls src/components/ui` で確認）。操作ハンドラ(onPress/onChange)は基本**必須**設計（押せて何もしないを禁止、無効化は disabled 明示）。Tag のみ静的表示で onPress 省略可。アイコンは `Icon` 経由のみ、名前は `src/components/ui/icon/iconRegistry.ts` の kebab-case キー（無ければ1行追加）。

**Expo Router v57 / `typedRoutes:true` / scheme "sanposcape-dev"**（packages/mobile/app.json。開発用の値で、本番は `app.config.ts` が `APP_VARIANT=production` のときだけ `sanposcape` に上書きする。SS-79）。development client の起動 URL `exp+sanposcape://` は scheme ではなく slug 由来なので変わらない。ルート文字列は型検査される。`app/index.tsx`（スプラッシュ）は `/`、`"/(tabs)"` は `app/(tabs)/index.tsx`（ナビタブ）に解決され、両者は共存している（詳細は [[project-navigation-model]]）。ルート `app/_layout.tsx` が Provider（QueryClient→Theme→SafeArea→Stack）と `GestureHandlerRootView` を配線済み。

**パスエイリアス**: `@/` → `src/`、`@/assets/` → `assets/`（tsconfig）。WSL2/Linux は case 区別 → import は実ファイル名と大文字小文字まで一致。

**services 層の seam パターン**: `src/services/<svc>/{types.ts,index.ts,<svc>.<mode>.ts}`。index が `process.env.EXPO_PUBLIC_*` でモードを選び、呼び出し側は index/types のみ参照。モードはサービスごとに違う: `auth` は real/dev/mock（ADR-002、[[auth]]）、`location` は real/mock（ADR-M-006）、`photo` は real/mock、`preferences` はモード無し（ストレージ DI）。単体テストは具体ファクトリを直接 import する（[[mobile-testing]]）。

**API**: Orval 生成物は `src/api/generated/`（**gitignore 済み**。手編集禁止、`pnpm --filter mobile orval` で再生成＝プラン作成前に一度実行して現物を確認する。**作業ツリーの生成物は古いことが多い**。worktree には生成物自体が無いことも多く、Bash の無い実行環境では再生成できない → `packages/backend/openapi.yaml` の schema / parameters を直接読んで型を推定し、プランに「再生成後に確認するファイルと型」を列挙する）。クライアントは `src/api/client.ts`（customFetch。`{status, data, headers}` を返し、401→refresh→1回リトライ実装済み）+ `queryClient.ts`（既定 `retry:1` / `staleTime:30s`）。
**HTTP の出口は1つではない**（`customFetch` と `services/auth/authApi.ts` の生 fetch、さらに S3 直送）。送信ヘッダー・共通挙動を変えるプランは [[project-cloudfront-client-contract]] を必ず読む。`client.ts` にネイティブ依存を足すと推移的に import する api テストが全滅する点は [[project-rn-runtime-capabilities]]。
**Orval の落とし穴1（クエリの null）**: 生成される `getXxxUrl(params)` は `if (value !== undefined) append(key, value === null ? 'null' : String(value))`。→ **`{ cursor: null }` を渡すと `?cursor=null` というリテラル文字列が飛ぶ**（backend は 400）。省略したいキーは `undefined` にする＝params 組み立ての純粋関数（`buildXxxParams`）を lib に置き、そこでキーごと落とす。
**Orval の落とし穴2**: OpenAPI で content スキーマを書いていないレスポンスは `{ data: void; status: N }` になる。FastAPI が `responses={200: {"description": ...}}` だけ書いて実際は本文を返すケースで型が付かない → mobile 側で narrowing、backend へ `model` 追記を依頼する。
**素の fetcher 方式**: `features/<f>/api/*.ts` は生成 hook ではなく生成関数（`searchExplorePlaces(req, {signal})` 等）を直接呼ぶラッパにする。queryKey/enabled/retry を自前制御でき、`react-native` を値 import しないので vitest で msw テストできる。

**状態**: サーバ状態=TanStack Query、クライアント状態=Zustand（機能限定は features 内、横断は `src/store/`。`useAuthSessionStore` が実例。`src/store/useAppStore.ts` は 2026-10 時点でどこからも使われていない）。

**`data/` 層は API スタブの置き場ではない**: 残っているのは `walk/data/categories.ts`（`ExploreCategory` の表示メタ）・`walk/data/defaults.ts`（`/dev-screens` 用の代表値）・`history/data/stepGoal.ts`（目標歩数。backend に API が無い）だけ。type-only import のみで、各ファイルに不変条件テストが併置されている。

**feature 境界の抜け道**: `docs/folder-structure.md` は「その機能の外から import されるものは features に置かない」。
機能 A が機能 B の store を触りたくなったら、昇格（ADR 追補が要る）より **`src/lib/` の後始末レジストリ**
（`sessionCleanup.ts` / `walkDeletionCleanup.ts` = `register*` + `run*` + `reset*ForTest`、クリアされる側がモジュール末尾で自己登録）を
真似るのが既存方針に沿う（ADR-M-008 決定6・決定8）。登録がモジュールロード依存な点は「未ロード＝そのメモリ状態も存在しない」で許容されている。

**Dialog + `useScreenBack` の同居は要注意**: RN `Modal` の `onRequestClose` と `BackHandler` 購読が
両方生きる。`useScreenBack({ onIntercept })` でダイアログを閉じる（送信中は何もしない）に一本化すること（`pages-components-guideline.md`）。
確認ダイアログの手本は `features/settings/components/SettingsView.tsx`（`dismissDisabled` + ボタン disabled +
ラベル差し替え、マウント条件は `open` の boolean だけ）。

**既存ユーティリティ**: `@/lib/formatDuration`(分→「◯時間◯分」), `@/lib/toPercent`, `@/lib/hitSlop`(hitSlopFor), `@/lib/dateLabel`, `@/lib/uuid`(randomUuidV4)。

**react-native-maps の地図操作**: `MapView.onPress` は Marker と POI のタップでは**発火しない**（POI は `onPoiClick`、Google のみ）。「タップした地点を選ぶ」UI は `onPoiClick` も同じハンドラにつなぐ。`showsUserLocation` は使わない（mock モードで OS の点と2つ出る。`WalkRouteMapView` の JSDoc）。worktree には node_modules が無いことが多く、ライブラリの型は手元で読めない → main チェックアウト（`/home/tristar/projects/sanposcape/node_modules`）か、公式 docs（react-native-maps の GitHub リポジトリの `docs/mapview.md` / `docs/marker.md`）で確認する。ただし main チェックアウトの node_modules は lockfile より古いことがある（2026-10-04 時点で lucide-react-native は lockfile 1.50.0 に対し main の手元は 1.39.0）。アイコンの有無は `pnpm-lock.yaml` のバージョンを確かめてから `lucide-react-native/dist/esm/icons/<name>.mjs` で見る。1.50.0 では `building-2` / `trash-2` などがリネームされ、バンドルが失敗する（SS-190。typecheck・Vitest では検出できない）。
**Marker の基準点は iOS と Android で別 prop**: `anchor` は Google Maps 専用で、iOS（provider 未指定 = Apple Maps/MapKit）は無視して View の中心を座標に置く。MapKit は `centerOffset`（point 単位）。全 Marker が `anchor` しか渡しておらず iOS で先端がずれていたため、SS-172 で `components/ui/map-pin` の `mapPinMarkerPlacement(size)` が両方を返すようにした（ADR-M-019）。新しい Marker もこれを spread する。マーカーの見た目・位置の話では両プラットフォームを分けて考える。

**ネイティブ設定**: `/ios` `/android` は gitignore（CNG 前提）→ ネイティブ設定は app config で行う。`react-native-maps`（2026-10 時点 1.29.8）は散歩・ピン画面で使用中。Android の Maps キーは `expo.android.config.googleMaps.apiKey` に `app.config.ts` 経由で env から注入する（ADR-M-007）。react-native-maps 同梱の config plugin は**プロパティ未指定だと manifest からキーを削除する**ので併用しない。iOS は既定 Apple Maps でキー不要。ネイティブモジュール追加は development build の作り直しが要る（ADR-M-003）。

**画面デザインの一次資料**は `packages/mobile/docs/mock/` の `.dc.html`（[[reference_mock_and_prop_divergence]]）。`.pen` のデザインファイルはリポジトリに無い。プリミティブの実質の見本は `src/features/design-system/components/DesignSystemGallery.tsx`。
