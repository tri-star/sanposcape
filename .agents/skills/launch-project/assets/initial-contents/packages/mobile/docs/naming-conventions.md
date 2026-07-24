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

## テストファイル

- テスト対象と同じ basename + `.test`。
  - `Button.tsx` → `Button.test.tsx`
  - `useWalkHistory.ts` → `useWalkHistory.test.ts`

## import の case 一致（WSL2 / Linux）

- 開発環境は大文字小文字を区別するため、**import パスは実ファイル名と case まで完全一致**させる。
  - OK: `import { Button } from "@/components/ui/button/Button"`
  - NG: `import { Button } from "@/components/ui/button/button"`（Linux で解決できず壊れる）
