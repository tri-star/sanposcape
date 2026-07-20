# フォルダ構造ガイドライン (mobile)

ReactNative(Expo) アプリのフォルダ構造の方針をまとめる。
背景・選定理由は [ADR-001](../adr/ADR-001-folder-structure.md) を参照。

## 前提

- ルーティング: **Expo Router**（ファイルベースルーティング）
- アーキテクチャ: **ハイブリッド構成**（横断的な土台 + 機能単位の凝集）
- 命名規則の詳細は [命名規則](./naming-conventions.md) を参照

## 全体構造

```
packages/mobile/
├── app/                       # Expo Router: 画面とルーティングのみ
│   ├── _layout.tsx            #   ルートレイアウト（Provider配線・認証ガード）
│   ├── (tabs)/                #   タブグループ
│   │   ├── _layout.tsx
│   │   └── index.tsx          #   画面は薄く保ち、src/features を呼ぶだけにする
│   └── +not-found.tsx
│
├── src/
│   ├── components/            # 横断的に再利用するUI（機能に依存しない）
│   │   ├── ui/                #   Primitive: Button, Text, Card, Input ...
│   │   └── layout/            #   横断的な複合UI（必要に応じカテゴリを追加）
│   │
│   ├── features/             # 機能固有のまとまり（凝集の単位）
│   │   └── <feature>/         #   例: walk, profile
│   │       ├── components/    #     その機能でしか使わないUI
│   │       ├── hooks/         #     その機能のロジック（Vitestでテスト）
│   │       ├── api/           #     その機能のAPI呼び出しラッパ
│   │       └── types.ts
│   │
│   ├── services/            # スタブ差し替えの層（認証・実機依存機能）
│   │   └── <service>/
│   │       ├── index.ts       #   環境に応じて real/stub を選択して export
│   │       ├── types.ts       #   インターフェース定義
│   │       ├── xxx.real.ts    #   本番実装
│   │       └── xxx.stub.ts    #   テスト用スタブ
│   │
│   ├── api/                  # Orval生成物 & 共通APIクライアント設定
│   │   ├── generated/         #   自動生成物（手編集禁止）
│   │   └── client.ts
│   │
│   ├── hooks/                # 横断的な汎用hook（機能非依存）
│   ├── lib/                  # 汎用ユーティリティ（純粋関数中心＝テスト容易）
│   ├── config/              # 環境変数の読み取り・定数
│   ├── store/               # Zustand ストア（横断的なクライアント状態）
│   ├── theme/               # Unistyles のデザイントークン・テーマ定義
│   └── types/               # 横断的な型定義
│
├── assets/                   # 画像・フォント等の静的アセット
├── .maestro/                 # E2Eテストフロー（Maestro）
├── docs/                     # 設計ドキュメント
├── adr/                      # ADR（設計判断の記録）
├── app.json / app.config.ts  # Expo設定
├── tsconfig.json             # パスエイリアス @/ → src/
├── vitest.config.ts
└── package.json
```

## 各ディレクトリの役割と配置ルール

### `app/` — 画面とルーティングのみ
- Expo Router の規約により、**ファイル配置がそのままURL/画面構造になる**。
- 画面ファイルには UI/ロジックを直接書かず、`src/features/<feature>/` のコンポーネントや hook を import して**薄く**保つ。
  - 目的: 「UIとロジックの分離」を成立させ、ロジックを Vitest でテスト可能にするため。
- `app/` 配下には**画面（ルート）以外を置かない**。再利用するコンポーネントは必ず `src/` に置く。
- 予約ファイル: `_layout.tsx`（レイアウト）、`+not-found.tsx`、`(group)/`（URLに出ないグループ）、`[param].tsx`（動的ルート）。
- **`app/` 配下で `react-native-unistyles` の `StyleSheet.create` を使わない**。
  `babel.config.js` の Unistyles プラグインは `root: "src"` のみを処理するため、`app/` に置くと
  テーマ依存の検出が効かずテーマ切替時に再レンダされない。スタイルを持つ実体は必ず
  `src/features/<feature>/components/` に置き、`app/` の画面ファイルはそれを import するだけにする
  （詳細は [design-tokens.md](./design-tokens.md) 参照）。

### `src/components/` — 機能に依存しない再利用UI
- `ui/`: Primitive（Button, Input, Card など）。どの機能にも依存しない最小単位。
- `layout/` など: 横断的な複合UI。**最初から細分化せず、増えてきたらカテゴリ（サブフォルダ）を追加**する。

### `src/features/<feature>/` — 機能固有のまとまり
- 1つの機能に属する `components` / `hooks` / `api` / `types` をこの配下に凝集させる。
- **その機能の外から import されるものは置かない**（横断利用が必要になったら昇格させる。下記ルール参照）。

### コンポーネントの配置判断ルール（肥大化対策）
> **「2つ以上の機能から使うか？」**
> - Yes → `src/components/`（`ui/` もしくは適切なカテゴリ）
> - No → `src/features/<feature>/components/`
>
> 迷ったら **まず `features/` に置く**。再利用が実際に発生した時点で `components/` へ昇格させる。
> `components/` 直下にファイルを並べて肥大化させない。カテゴリのサブフォルダに分ける。

### `src/services/` — スタブ差し替えの層
- 認証(OAuth/OIDC)や実機依存機能（カメラ・位置情報など）を抽象化する層。
- 呼び出し側は `index.ts` が公開する**インターフェースのみ**を参照し、real/stub の実体を知らない。
- 実装の選択は環境変数で切り替える（例: `EXPO_PUBLIC_*`）。
- テスト方針との対応:
  - **ユニットテスト**: 常に stub を利用。
  - **E2Eテスト(Maestro)**: 実機に近い動作を優先。**Maestroで再現可能な機能は real のまま**利用し、再現できない機能のみ stub にフォールバックする。
- 詳細な設計背景は [architecture-guideline](./architecture-guideline.md) を参照。

### `src/api/` — バックエンドAPIクライアント
- `generated/`: Orval による自動生成物。**手編集しない**。
- `client.ts`: 共通のクライアント設定（ベースURL、インターセプタ等）。

### その他
- `src/hooks/`: 機能に依存しない汎用hook。
- `src/lib/`: 純粋関数中心の汎用ユーティリティ（Vitestでテストしやすい形を保つ）。
- `src/config/`: 環境変数の読み取りと定数。
- `src/store/`: Zustand による横断的なクライアント状態。**サーバー由来のデータは置かない**（それは TanStack Query が持つ）。UI状態や一時的なアプリ状態のみ。
- `src/theme/`: Unistyles のデザイントークン（primitive / semantic）とテーマ定義。スタイルは各コンポーネントで `StyleSheet`（Unistyles）を通してテーマトークンを参照する。
- `src/types/`: 複数箇所で共有する横断的な型。

## 状態管理の使い分け

- **サーバー状態（API由来）= TanStack Query**。取得・キャッシュ・再検証はすべて Query に任せ、`src/store/` に複製しない。
  - ドメインのデータ取得hookは `src/features/<feature>/hooks/`（例: `useWalkHistory`）に置き、内部で Orval生成物 + TanStack Query を使う。
- **クライアント状態（UI・一時状態）= Zustand**。横断的なものだけ `src/store/`、機能限定のものは `src/features/<feature>/` 内に閉じる。
- **認証・位置情報などの実機依存**は状態管理ではなく `src/services/` のスタブ差し替え層で扱う。

## パスエイリアス

- `@/` を `src/` に割り当てる（`tsconfig.json` の `paths`）。
  - 例: `import { Button } from "@/components/ui/button/Button"`
- `app/` から `src/` を参照する際も `@/` を使い、相対パスの深いネストを避ける。

## テストファイルの配置

- **テスト対象と同じ場所に併置（co-location）** する。
  - 例: `Button.tsx` と同じフォルダに `Button.test.tsx`。
- E2E（Maestro）のフローのみ、ルートの `.maestro/` に集約する。

## 環境固有の注意（WSL2 / Linux）

- 開発環境は WSL2/Linux で**大文字小文字を区別する**ファイルシステム。
- macOS（区別しない）と混在すると `import` のcase不一致が Linux でのみ壊れる事故が起きる。
- **import パスは実ファイル名と大文字小文字まで完全一致**させること。
