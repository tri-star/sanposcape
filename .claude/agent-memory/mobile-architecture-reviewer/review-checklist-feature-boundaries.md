---
name: review-checklist-feature-boundaries
description: mobile レビューで毎回確認する境界のチェックリスト — 認証は app/ からプリミティブ注入・feature 間 import は lint 非強制・src/api 直下のラッパ閾値・画面フラグガード・地図の render slot 合成・未確認の既知ギャップ
metadata:
  type: feedback
  scope: durable
---

SS-29 / SS-88 / SS-100 / SS-118 / SS-124 のレビューで確立・発見した「次の差分で確認すること」を集約したもの。
決定の正本は各 ADR（`packages/mobile/adr/ADR-M-009` / `ADR-M-010` / `ADR-M-011` / `ADR-M-012`、ルート `docs/adr/ADR-008`）と
`packages/mobile/docs/folder-structure.md` / `architecture-guideline.md`。

**Why:** 以下はいずれも lint や型で機械的に守られておらず、レビューでしか検知できない（または一度ドキュメント化されたルールが
実差分で守られているかを確認する必要がある）。

**How to apply:** 該当領域に触る差分を見たら、他の観点より先に該当項目を確認する。解消された項目はこのメモから消す。

## 1. 認証情報は `app/` のルートからプリミティブで注入する（ADR-M-009 決定8・SS-29 追補）

- `features/walk/**` / `features/history/**` / `features/pin/**` は `.oxlintrc.json` の `no-restricted-imports` で
  `@/services/auth*` / `@/store/useAuthSessionStore` を禁止されている。認証が要るときは `app/` のルートが
  selector でプリミティブだけ読み、View → hook へ props で渡す（実例: `app/(tabs)/account.tsx` の `displayName`、
  `app/walk-summary.tsx` の `isSignedIn`、`app/pins/new.tsx`）。
- **ストアやユーザーオブジェクトごと渡していないか**を見る。
- **横断 hook（例 `useSessionDisplayName`）で lint を形式的に通す実装は指摘する**。ADR-M-009 SS-29 追補で却下済み。
- `features/settings` は override 対象外なので store を直接読める（意図的な非対称）。
- 同じ selector が `app/` の2箇所以上に重複したら `src/hooks/` へ切り出してよい（動機は重複排除に限る）。

## 2. feature 間 import（walk ⇔ pin ⇔ history）は lint で強制されていない

`.oxlintrc.json` の override が禁止しているのは認証系と `@/config/devTools` だけ（2026-10 確認）。
ADR-M-011 D6 のルート文字列での遷移や、ナビタブの render slot 合成（下記4）はこの非依存を前提にしている。
feature 間の直接 import を見たら指摘し、lint 強制の提案が出たら後押しする
（`features/pin/lib/pinLocationParams.test.ts` がテストで越境しているので除外設定の検討が要る）。

## 3. `src/api/` 直下のドメイン形状ラッパ

`appConfigApi.ts` が唯一の前例。`folder-structure.md` の `src/api/` 節に
「2本目の横断的エンドポイントラッパが増えたら `src/api/endpoints/` のようなサブフォルダへ分ける」とある。
2本目がフラットに積まれていたらルール違反として指摘する。

## 4. フィーチャーフラグの画面ガード・地図の合成

- 画面単位のフラグガードは `architecture-guideline.md` の「画面ガードレシピ」に従っているか
  （`pending` 中に `<Redirect>` しない、タブは `AppTabBar` 側の項目から外す）。
- フラグ値は TanStack Query（`["app-config"]`）一本で、Zustand に複製しない。`config_source` で分岐しない。
- feature をまたいで地図に要素を重ねるときは `app/` のルートが render slot で合成する
  （`WalkActiveView.renderMapLayers` を `app/(tabs)/index.tsx` が埋める。`folder-structure.md` に実例あり）。
  地図コンポーネントは `mapLayers?: ReactNode` を子として描くだけで中身を知らない形を保つ。
- 全画面の地図オーバーレイは RN `Modal` を避ける（ADR-M-011 D7。[[pattern_modal_backhandler_coexistence]]）。

## 5. 未確認のまま残っている既知ギャップ

- **`pinSaveRunner` の DI テストと実フックの同期性の乖離**（SS-88）: テストハーネスは `dispatch()` のたびに
  `items` を同期で書き換えるが、`usePinPhotos.ts` は `useReducer` + render 時に同期する `itemsRef` なので、
  `await` を挟まない連続 dispatch の直後の読み出しは古い配列を見うる（冪等なので実害は追加リクエスト程度）。
  `pinSaveRunner.ts` / `usePinPhotos.ts` を触る差分を見たら確認する。
- `isAllowedUploadUrl`（`features/pin/lib/presignedPostForm.ts`）はアップロード許可と閲覧 presigned GET の許可の
  2用途に使われている。3つ目の用途が出たら `isAllowedStorageUrl` のような一般名への改名を提案する。
