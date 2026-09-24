# 命名規則 (mobile)

ReactNative(Expo) アプリのファイル名・フォルダ名の命名規則をまとめる。
フォルダ構造そのものは [フォルダ構造](./folder-structure.md) を参照。

## 基本方針

- **`src/`（実装の実体）と `app/`（Expo Router のルート）で規則が異なる**点に注意する。
  - `src/` のコンポーネント実体は PascalCase。
  - `app/` のルートはファイル名がURLになるため kebab-case・小文字。

## case style 一覧

| 対象 | 規則 | 例（複数単語のとき） |
|---|---|---|
| フォルダ全般 | **kebab-case** | `walk-history/`, `oauth-callback/` |
| Reactコンポーネントのファイル | **PascalCase** `.tsx` | `WalkHistoryList.tsx` |
| hook ファイル | **camelCase**（`use` 始まり） | `useWalkHistory.ts` |
| その他 `.ts`（util/型/API 等） | **camelCase** | `formatDistance.ts`, `types.ts` |
| 定数の「値」 | **SCREAMING_SNAKE_CASE** | `const MAX_RETRY = 3` |
| `app/` のルートファイル/フォルダ | **kebab-case・小文字** | `user-profile.tsx`, `(tabs)/` |
| `app/` の動的ルート | 角括弧 + camelCase | `[walkId].tsx` |
| `app/` の予約ファイル | 框架規約に従う | `_layout.tsx`, `+not-found.tsx` |

## フォルダは常に kebab-case（例外なし）

- コンポーネントを複数ファイルでフォルダにまとめる場合も**フォルダは kebab-case**、中のファイルは通常どおり PascalCase とする。
- 「フォルダは常に kebab」という規則を1つに保ち、覚えることを減らす。

```
components/ui/button/
  Button.tsx
  Button.test.tsx
```

> コンポーネント名とフォルダ名を揃える PascalCase フォルダ（`Button/index.tsx`）は**採用しない**。
> フォルダ規則に例外を作らないことを優先する。

## `app/`（Expo Router）の命名がなぜ別なのか

- Expo Router では**ファイル名がそのままURLセグメントになる**ため。
  - `app/user-profile.tsx` → `/user-profile`（URL慣習の小文字・ハイフンに一致）
  - `app/UserProfile.tsx` にすると URL が `/UserProfile` になってしまい不適切。
- 画面の中身は `src/features/<feature>/components/WalkHistoryList.tsx`（PascalCase）に実装し、
  `app/` からはそれを import して薄く配置する。

## Zustand ストア

- ストアはフック形式で公開するため、hook 規則に従い `use` 始まりの camelCase とする。
  - 例: `useWalkStore.ts`（横断的なら `src/store/`、機能限定なら `src/features/<feature>/`）。
- サーバー由来のデータはストアに置かない（TanStack Query が保持する）。
  - ただし**識別子1つに限った例外**を認める場合がある（現状は `useFinishedWalkStore.savedWalkId` のみ）。
    許容条件と例外の範囲は [フォルダ構造](./folder-structure.md) の `store/` の節を正とし、
    背景は [ADR-008](../adr/ADR-008-active-walk-state-and-route-cache.md) を参照する。

## 「散歩ルート」に関する命名の注意

- **散歩の道のり（歩いたルート／提示ルート）** を表す語は `walkingRoute` / `walkRoute` などと表記し、
  Expo Router / React Router の route（画面/URL）と混同しない。
  - 例: 型 `WalkRoute`、hook `useWalkRoute.ts`、純粋関数 `walkRoutePolylineSegments`（`lib/walkRouteLegs.ts`）。
  - backend 側の命名規則とも揃える（`packages/backend/docs/naming-convention.md` 参照）。
- **`roundTrip*` と `loop*` は意味が異なるので使い分ける**（SS-33）。
  - `roundTrip*`（例: `SpotCandidate.roundTripMinutes`/`roundTripKm`）は `/explore/places` 由来の
    **片道×2の近似スナップショット**。候補一覧の表示にのみ使う。
  - `loop*`（例: `ActiveWalk.loopMinutes`/`loopKm`）は `/explore/routes/loop` から取得した
    **周回ルートの実値**。散歩開始後（`ActiveWalk` 以降）はこちらを使う。
  - 由来（近似 vs 実値）が異なる値を同じ変数名で読み違えないよう、rename ではなく最初から
    別の語幹を選ぶこと。背景は [ADR-008](../adr/ADR-008-active-walk-state-and-route-cache.md)
    決定1「SS-33 追補」を参照。
- **周回ルートの leg（区間）の kind** は API 層の値をそのまま `outbound` / `return` として扱う
  （`WalkingRouteLegKind`）。UI 表示の文言は「行き」/「帰り」（「往路」/「復路」ではない）で統一する
  （`lib/walkRouteLegs.ts` の `walkRouteLegendItems` を参照）。

## 「同じ道フォールバック」に関する命名の注意（SS-33）

- 周回ルートを作れず、往路と同じ道を復路として返すケースは API の `returnIsSamePath`
  （backend 側は `return_is_same_path`）というフィールド名で表現する。UI では凡例が1項目
  （「行き・帰り（同じ道）」）にまとまる。
- 「往復」という言葉は候補一覧の `roundTrip*` の文脈でのみ使い、周回ルート確定後の文脈
  （`loop*`／`legs`）では使わない（両者は数値の出所が異なり、僅かにずれうるため）。

## テストファイル

- テスト対象と同じ basename + `.test`。
  - `Button.tsx` → `Button.test.tsx`
  - `useWalkHistory.ts` → `useWalkHistory.test.ts`

## import の case 一致（WSL2 / Linux）

- 開発環境は大文字小文字を区別するため、**import パスは実ファイル名と case まで完全一致**させる。
  - OK: `import { Button } from "@/components/ui/button/Button"`
  - NG: `import { Button } from "@/components/ui/button/button"`（Linux で解決できず壊れる）
