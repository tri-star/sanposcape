# ADR-M-001: mobile(ReactNative/Expo) のフォルダ構造と命名規則

## 現在有効な決定（要約）

> 最終更新: 2026-11-15（SS-260 追補: feature の中は層より先に領域で分ける）。本節は本文（追補を含む）を要約したもので、一次記録は本文。
> 本文と食い違う場合は本節の誤りとして本節を直す。

### 決定

- **ルーティングは Expo Router（ファイルベース）で、画面は `app/`、実装の実体は `src/` に物理分離する**。（本文: 決定1）
- **横断的な土台（`src/components/` `src/hooks/` `src/lib/` 等）と機能単位の `src/features/<feature>/` を併用するハイブリッド構成**。（本文: 決定2）
- **feature が大きくなったら、層（`components/` `hooks/` `lib/` …）より先に領域で分ける**。feature の直下に領域のフォルダを置き、その下に層を置く（層の下に領域のサブフォルダを切らない）。
  同じ feature の領域同士は互いに import してよい。領域をまたぐ共通物は `shared/` に置き、置いてよいのは持ち主の領域を1つに決められないものだけで、`shared/` は領域を import しない。
  mobile 全体の方針で、最初の例は `features/sanpo-map`（`map/`・`pin/`・`invitation/`・`shared/`）。（本文: 決定2 の SS-260 追補）
- **コンポーネントは「2つ以上の機能から使うか」で `src/components/`（Primitive は `ui/`）か `src/features/<feature>/components/` に置く**。
  迷ったら `features/` に置き、再利用が発生したら昇格させる。（本文: 決定3）
- **実機依存・認証の差し替え層は `src/services/<service>/` で、`index.ts` がインターフェースを公開し、環境変数でモードを選ぶ**。
  モードは `real` / `dev` / `mock` が基本形（既定 `real`）で、必要なモードだけ用意してよい（例: location・photo は real/mock）。
  詳細は [フォルダ構造](../docs/folder-structure.md)。（本文: 決定4、棚卸し追補）
- **命名はフォルダが常に kebab-case、React コンポーネントが PascalCase、hook/util/型が camelCase、`app/` のルートは kebab-case・小文字**。（本文: 決定5）
- **API 失敗の分類（`features/**/lib/xxxError.ts`）は API 操作ごとに別ファイルにし、共通化しない**。
  同じ HTTP ステータスでも操作によって意味が違うため。（本文: 決定6、棚卸し追補）

### 変更・撤回された決定

- 決定4 の「環境変数で real/stub を選択する」→ 3モード（`real` / `dev` / `mock`）が基本形
  （[ADR-002](../../../docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md) 決定3、[ADR-M-006](./ADR-M-006-location-service-real-mock.md)）。
  `services/preferences` はモード切替を持たない例外（[ADR-M-016](./ADR-M-016-theme-mode-preference.md)）
- 「移行・対応が必要な事項」のスタイル方針・Orval・パスエイリアス・環境変数の命名は、いずれも対応済み
  （スタイルは [ADR-M-005](./ADR-M-005-styling-without-unistyles.md)）

## 日付

2026-07-18（初版）、2026-10-04 追補（棚卸し: 決定6 の追加、決定4 の現状注記）、2026-11-15 追補（SS-260: 決定2 に「feature の中は層より先に領域で分ける」を挿入し、`features/pin` を `features/sanpo-map` に改めた）

## コンテキスト

`packages/mobile` に ReactNative(Expo) アプリを新規に立ち上げるにあたり、フォルダ構造と命名規則を決める必要がある。制約・要件は以下。

- チームは ReactNative/React の経験が浅く、**規約が明確で迷いにくい構造**が望ましい。
- **長期保守を重視**する。`components/` 直下にコンポーネントを平置きすると肥大化するため、最初から/必要に応じてフォルダを分けられる構造にしたい。
- コンポーネントには **Primitive なもの**と**アプリ機能固有のもの**が存在し、両者の配置方針を明確化したい。
- 認証(OAuth/OIDC)や実機依存機能は、E2E/ユニットテストのために**スタブ実装との差し替え**を可能にする。ただし**本物に近い動作を優先**し、Maestro で実機に近い動作をエミュレートできる場合はスタブではなくその動作を使う。
- `packages/mobile` をルートとし、`backend`/`frontend` など同一アプリの他スタックと**モノレポで同居**できること。
- 既存の技術選定: TypeScript / pnpm / Expo / Vitest / Maestro / oxlint / oxfmt（スタイルは未定）。
- 開発環境は WSL2/Linux（大文字小文字を区別するファイルシステム）。

## 決定

以下を採用する。詳細な運用ルールは [フォルダ構造](../docs/folder-structure.md) / [命名規則](../docs/naming-conventions.md) に記載する。

1. **ルーティング: Expo Router（ファイルベース）** を採用し、画面は `app/` に、実装の実体は `src/` に物理分離する。
2. **アーキテクチャ: ハイブリッド構成**。横断的な土台（`src/components/`, `src/hooks/`, `src/lib/` 等）と、機能単位で凝集する `src/features/<feature>/` を併用する。
   - **（SS-260 追補）feature が大きくなったら、層より先に領域で分ける。** feature の層のフォルダ（`components/` `hooks/` `lib/` …）が構造の検査（[ADR-016](../../../docs/adr/ADR-016-code-structure-ratchet-check.md)）の閾値を超え、
     中に別の名前で言えるまとまり（画面の群・API・backend のモジュールに対応する領域）があるときは、`features/<feature>/<domain>/{api,components,hooks,lib,data,store}/` の形にする。
     層の下に領域のサブフォルダ（`lib/sanpo-map/`・`components/invitation/`）は切らない。1つの領域が層ごとに散らばり、領域を足す・消すときに層の数だけフォルダを触るため（SS-250 の招待がそうなっていた）。
     領域の中がさらに大きくなったら、同じ考え方でその領域を分ける。walk / history など他の feature にも同じ形で当てはめる。
     - **feature の直下には、領域のフォルダと `shared/` だけを置く。** 層のフォルダと領域のフォルダを同じ階層に混ぜない。
     - **同じ feature の領域同士は互いに import してよい（双方向も）。** 双方向の依存があるから別の feature に分けず、1つの feature の中で分けている。feature 同士は import しない規約（[フォルダ構造](../docs/folder-structure.md)）は変えない。
       ファイルの単位の循環は `import/no-cycle` が止める。他の領域から使われても、持ち主が1つに決まるもの（地図のアイコン・地図の一覧の取得・ピンの状態バッジ・ピンの取得）は持ち主の領域に置き、使う側がそこから import する。
     - **`shared/` に置いてよいのは、2つ以上の領域から使い、持ち主の領域を1つに決められないものだけ。** 何でも置く場所にしないため、次の3種類に限る。
       1. 領域をまたぐ API の型（`shared/types.ts`）
       2. 領域をまたいで無効化する queryKey の階層（`shared/lib/pinQueryKeys.ts`。ピンの保存で地図詳細のピン一覧も無効化されるよう、地図単位のピン一覧の key を意図して `["pins", ...]` の下に置いている）
       3. どの領域の語も持たない画面の部品・判定（状態カード・名前の検索欄・pull-to-refresh・TanStack Query の読み込み状態）
       `shared/` は領域のフォルダを import しない（型だけの import も。親 → 子 → 親の行き来を作らない）。1つの領域からしか使われなくなったら、その領域へ戻す。2つ以上の feature から使うなら `src/` の横断の層へ昇格する（決定3）。
     - lib/ の制限（`.oxlintrc.json` の `no-restricted-imports`）の glob は、深さに依存しない `src/features/**/lib/**` で書く。1段の `*` は領域の下の lib/ に当たらず、制限が黙って外れる。
     - 最初の例は `features/pin` を改めた `features/sanpo-map`（`map/`: 地図の一覧・詳細・作成・メンバー・アイコン・削除、`invitation/`: 地図への招待、`pin/`: ピン本体、`shared/`）。
       backend の `sanpo_maps/{maps, pins, invitations, photos}` と同じく、地図の下にピンと招待がある。`pin/` の中の分割は SS-257。
3. **コンポーネント配置の判断基準**: 「2つ以上の機能から使うか？」で `src/components/`（Primitiveは `ui/`）か `src/features/<feature>/components/` かを決める。迷ったらまず `features/` に置き、再利用発生時に昇格させる。
4. **スタブ差し替え層: `src/services/<service>/`**。`index.ts` がインターフェースを公開し、環境変数で real/stub を選択する。E2Eでは Maestro で再現可能なものは real、不可能なもののみ stub にフォールバックする。（**棚卸し追補**: 現在のモードは real/stub の2値ではなく `real` / `dev` / `mock` が基本形。詳細は [フォルダ構造](../docs/folder-structure.md)）
5. **命名規則**: フォルダは常に kebab-case、Reactコンポーネントは PascalCase、hook/util/型は camelCase、`app/` のルートは kebab-case・小文字。import は case まで完全一致。
6. **API 失敗の分類は操作ごとに分ける（棚卸し追補）**: `features/*/lib/` の `xxxError.ts` は API 操作ごとに別ファイルにする
   （例: `walkHistoryError.ts`＝GET 一覧・詳細、`walkSaveError.ts`＝POST、`walkDeleteError.ts`＝DELETE、`walkStatsError.ts`＝集計 GET）。
   中身はどれも「`isApiError()` で status を見て、コード・文言・再試行の可否を返す」同じ形だが、DRY 違反として統合しない。
   - **理由**: 同じ HTTP ステータスでも操作によって意味が違う。404 は GET 詳細では「見つからない＝エラー」だが、
     DELETE では `deleteWalk()` が「既に削除済み＝成功」に読み替えるため、`walkDeleteError.ts` の分類には現れない。
     `invalid_cursor`（400）は一覧 GET に特有で、DELETE には無い。共通化すると「このコードは今の操作で本当に有効か」を
     毎回確かめる必要が生まれ、意味体系の異なる 404/400 を混同しやすくなる。
   - 既存の `xxxError.ts` を別の操作から import して再利用するのは、むしろ要注意（同じ理由）。
   - SS-19/SS-20 で `walkSaveError.ts` / `walkHistoryError.ts` を分けたのが始まりで、各ファイルの JSDoc 冒頭にも
     同じ判断が書かれている（例: `walkDeleteError.ts`）。2026-10 時点で walk / history / pin / settings に13ファイルある。

## 検討した選択肢

### ルーティング

#### 選択肢1: Expo Router（採用）

- **概要**: ファイルベースルーティング。`app/` 配下の配置がそのままURL/画面になる。
- **メリット**: Expo公式標準で規約が明確。画面(`app/`)と実装(`src/`)が自然に分離され、UI/ロジック分離やコンポーネント肥大化対策と噛み合う。ディープリンク・認証ガードを規約で書ける。
- **デメリット**: `app/` 配下の命名（URL規約）が `src/` と異なるため、2種の命名規則を覚える必要がある。

#### 選択肢2: React Navigation

- **概要**: コードベースで画面を Navigator に手動登録する。
- **メリット**: 構成が自由。
- **デメリット**: 配線が手動で、React 初学者には設計判断が増える。画面と実装の分離が自然には促されない。

### アーキテクチャの分割方針

#### 選択肢1: ハイブリッド構成（採用）

- **概要**: 横断的な土台を層で持ちつつ、機能固有は `features/<feature>/` に凝集。
- **メリット**: Primitive と機能固有の分離要件に直接対応。機能の追加・削除・移動が容易で肥大化しにくい。層とfeatureの使い分けが明快。
- **デメリット**: 「横断か機能固有か」の判断が都度発生する（判断基準をルール化して緩和）。

#### 選択肢2: 純粋な Feature 分割

- **概要**: ほぼ全てを `features/` 配下に置き、共有物のみ `shared/` に。
- **メリット**: 凝集が最大。
- **デメリット**: 何を `shared/` に上げるかの判断が増え、初学者には過剰。小さな横断UIまで feature に閉じ込めると重複しやすい。

#### 選択肢3: レイヤー分割

- **概要**: `components/` `hooks/` `services/` 等を横断的に配置。
- **メリット**: 小規模では単純。
- **デメリット**: 機能が増えると1機能の関連ファイルが各層に散らばり、保守が悪化。今回避けたい肥大化パターンそのもの。

### コンポーネントフォルダの命名

#### 選択肢1: フォルダは常に kebab-case（採用）

- **概要**: `components/ui/button/Button.tsx`。フォルダ規則を1つに統一。
- **メリット**: 覚える規則が少なく、例外がない。
- **デメリット**: フォルダ名とコンポーネント名の見た目が一致しない。

#### 選択肢2: コンポーネントフォルダは PascalCase

- **概要**: `components/ui/Button/index.tsx`。フォルダ名をコンポーネント名に揃える。
- **メリット**: 名前が視覚的に一致。
- **デメリット**: 「フォルダ命名」に例外が生まれ、規則が増える。

### feature の中の分け方（SS-260 追補）

`features/pin` に地図（`sanpoMap*`）と招待が集まり、`components`（47）・`lib`（48）・`hooks`（21）がフォルダ直下のファイル数の閾値 20 を超えていた。
地図とピンは双方向に依存する（地図の画面がピンの取得・状態の表示・queryKey を使い、ピンの登録・編集が地図の選択・アイコンを使う）。

#### 選択肢1: 地図・招待を別の feature に出す

- **デメリット**: 双方向の依存が feature の間の import になり、feature 同士は import しない規約に反する（SS-254 でも同じ理由で採らなかった）。

#### 選択肢2: 層の下に領域のサブフォルダを切る（`pin/lib/sanpo-map/`・`pin/components/invitation/`）

- **メリット**: 層ごとの規約（lib/ は純粋関数など）の glob がそのまま当たる。
- **デメリット**: 1つの領域が層の数だけのフォルダに散らばる。SS-250 の招待、SS-254 の skill の実例がこの形だった。

#### 選択肢3: 1つの feature のまま、層より先に領域で分ける（採用）

- **メリット**: 1つの領域が1つのフォルダに収まり、backend のモジュール（`sanpo_maps/{maps, pins, invitations}`）と対応が取れる。双方向の依存は feature の中に閉じる。
- **デメリット**: パスが1段深くなる。層の glob を深さに依存しない形に直す必要がある。

#### 選択肢4: 3 に加えて、領域同士の import を禁止する（backend の ADR-011 のような一方向の規則）

- **デメリット**: SS-260 の時点で地図からピンへの import が14本、ピンから地図へが27本あり、どちらの向きを禁じても、使われる側（ピンの取得・状態の表示・読み込みの失敗、または地図の一覧・アイコン）を
  `shared/` に移すことになって `shared/` が何でも置く場所になる。backend の `sanpo_maps` は向きを一方向（pins → maps）に決めているが、
  mobile は画面が領域をまたいで組み立てる（地図詳細がピンの一覧と状態を出し、ピンの登録画面が地図を選ぶ）ため、向きを1つに決められない。

## 決定理由

- チームの経験が浅いため、**規約が明確で例外の少ない**構成（Expo Router + フォルダは常に kebab）を優先した。
- **長期保守と肥大化回避**の要件に対し、機能単位で凝集するハイブリッド構成と「2機能ルール」による昇格方針が最も直接的に応える。
- **テスト容易性**の要件（Vitest でロジックを広くテスト、認証/実機機能のスタブ差し替え）に対し、`app/` を薄く保つ方針と `src/services/` の抽象化層が構造的に対応する。「本物優先・Maestro可なら real」という方針もこの層に閉じ込められる。
- WSL2/Linux 環境の case-sensitive による import 事故を、命名規則と「case完全一致」ルールで予防する。

## 影響

### ポジティブな影響

- 画面(`app/`)と実装(`src/`)が物理分離され、UI/ロジック分離とユニットテスト範囲拡大が実現しやすい。
- 機能追加時に触るディレクトリが `features/<feature>/` に閉じ、影響範囲が読みやすい。
- 認証・実機依存機能の差し替えが `services/` に集約され、テスト戦略が構造に表現される。
- `packages/mobile` を独立ルートとして扱うため、backend/frontend とモノレポで同居できる。

### ネガティブな影響・トレードオフ

- `app/`（kebab・URL規約）と `src/`（PascalCase等）で命名規則が2系統になり、初期の学習コストがある。
- 「横断UIか機能固有か」の判断が都度必要（判断基準で緩和するが、ゼロにはならない）。
- スタイルライブラリが未定のため、`src/theme/` は確定後に整備する暫定の器に留まる。

### 移行・対応が必要な事項

（**棚卸し追補**: 以下4件はいずれも対応済み。スタイルは [ADR-M-005](./ADR-M-005-styling-without-unistyles.md)、環境変数は `EXPO_PUBLIC_<SERVICE>_MODE` の形に確定した）

- スタイル方針（スタイルライブラリ）の選定は別途決定し、`src/theme/` を整備する。
- Orval によるAPIクライアント生成の設定（出力先 `src/api/generated/`）を初期セットアップ時に用意する。
- `tsconfig.json` にパスエイリアス `@/` → `src/` を設定する。
- `src/services/` の real/stub 切り替えに使う環境変数（`EXPO_PUBLIC_*`）の命名・受け渡し方法を初回実装時に確定する。

## 関連情報

- [フォルダ構造ガイドライン](../docs/folder-structure.md)
- [命名規則](../docs/naming-conventions.md)
- [アーキテクチャガイドライン](../docs/architecture-guideline.md)
- [ページ・コンポーネント実装ガイドライン](../docs/pages-components-guideline.md)
- [ツール・ライブラリ](../docs/toolsets-libraries.md)
- [ADR-M-016](./ADR-M-016-theme-mode-preference.md): `services/preferences` は決定4 の例外（real/mock の環境変数を持たない）
- [ADR-016](../../../docs/adr/ADR-016-code-structure-ratchet-check.md): 構造の検査（決定2 の SS-260 追補で、feature を分けるきっかけになる閾値）
- [structure-refactor skill](../../../.claude/skills/structure-refactor/SKILL.md): 分け方を決める手順（決定2 の SS-260 追補の形で分ける）
