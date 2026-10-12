---
name: mobile-architecture-boundaries
description: mobile レビューで確認する境界 — 認証は app/ からプリミティブ注入、feature 間 import は lint 非強制、src/api 直下の2本目、フラグガードと render slot、後始末の try/catch の非対称、戻る導線のラッチとサインインの push、ヘッダー重複（SS-40）
metadata:
  type: feedback
  scope: durable
---

ルールの正本は `packages/mobile/docs/folder-structure.md` / `architecture-guideline.md` / `pages-components-guideline.md` と ADR-M-008・M-009・M-011・M-012、ADR-008。
ここに挙げるのは lint や型で守られておらず、レビューでしか見つからないもの。該当領域の差分では他の観点より先に見る。

## 認証の注入（ADR-M-009 決定8・SS-29 追補）

- `features/walk|history|pin` に認証が要るときは、`app/` のルートが selector でプリミティブだけ読んで props で渡しているか。**store やユーザーオブジェクトごと渡していないか。**
- 横断 hook（例 `useSessionDisplayName`）で lint を形式的に通す実装は指摘する（SS-29 で却下済み）。同じ selector が `app/` に2箇所以上あるときの `src/hooks/` への切り出しは可。
- `features/settings` は override の対象外で store を直接読める（意図的）。

## lint で強制されていない境界

- feature 間の直接 import（walk ⇔ pin ⇔ history）は禁止されているが lint は見ていない（override は認証系と `@/config/devTools` だけ）。見つけたら指摘する。
- `src/api/` 直下のドメイン形状のラッパは `appConfigApi.ts` だけ。2本目がフラットに置かれたら `src/api/endpoints/` へ分けるよう指摘する。
- 画面のフラグガードが「画面ガードレシピ」どおりか（`pending` で `<Redirect>` しない・タブは `AppTabBar` の項目から外す）。フラグ値を Zustand に複製していないか。
- feature をまたいで地図に要素を重ねるときは `app/` が render slot で合成しているか（地図コンポーネントは `mapLayers?: ReactNode` を描くだけ）。全画面の地図オーバーレイは RN `Modal` を使わない（ADR-M-011 D7）。

## 後始末

- 「片方の操作でもう片方の状態を消したい」には `src/lib/` の後始末レジストリ（`sessionCleanup` / `walkDeletionCleanup` / `backgroundLocationCleanup`）が既存の答え。使っている実装に「なぜ直接 import しないか」と指摘しない。
- **複数の後始末を順に実行するメソッドでは、各ステップの try/catch の有無を横並びで比べる。** SS-10 の `signOut()` は `tokenStore.clear()` だけ無防備で、reject すると古いユーザーが残った。
  差があれば「このステップだけ扱いが違う理由はあるか」と確認する。

## 戻る導線

- 戻る操作と、その画面から出る他の遷移が同じ `runOnce` を共有しているか（共有しないと連打で push が二重に積まれる）。
- `useNavigateOnce` のラッチはフォーカスでしか解除されない。`replace` / `back` が blur を起こさない異常系（ガードのリダイレクト失敗など）で、その画面の離脱操作が永久に無反応になりうる。
- **サインイン画面へ push で入る導線は `canGoBack()` の前提を崩しうる**（SS-57 で `SettingsView` の push が `/walk-start` の前提を崩した。ゲスト向けサインイン案内は今も push）。
  認証まわりでは「push と replace のどちらで入ったか」と成功後の遷移を突き合わせ、新しい導線には `replace` か `canDismiss()` → `dismissAll()` を提案する。

## 未確認の既知ギャップ

- `pinSaveRunner` の DI テストは `dispatch()` のたびに `items` を同期で書き換えるが、`usePinPhotos.ts` は `useReducer` + render 時に同期する `itemsRef`。
  `await` を挟まない連続 dispatch の直後は古い配列を見うる（冪等なので実害は追加リクエスト程度）。両ファイルを触る差分で確認する。
- `isAllowedUploadUrl` はアップロードと閲覧 presigned GET の2用途。3つ目が出たら `isAllowedStorageUrl` のような一般名への改名を提案する。

## 画面ヘッダーの重複（task-local: SS-40。SS-40 が閉じたらこの節を消す）

「戻る IconButton（`chevron-left`）+ タイトル + スペーサー」のヘッダーが10画面で重複している（2026-10。共通の `ScreenHeader` は未作成）。
Plane の SS-40「mobile: 共通 ScreenHeader コンポーネントを切り出す」で追跡中。

**How to apply:** 新規指摘にせず SS-40 に言及する。新しい画面がまた同じヘッダーを複製していたら、SS-40 の優先度を上げる提案を添える。
