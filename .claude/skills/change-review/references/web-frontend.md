> この資料は React のアプリを前提に書かれた旧 frontend reviewer の観点を残したもの。現在の Web フロントエンド（`packages/lp`）は Astro の静的サイトで、前提が合わない項目がある。lp の正本は `packages/lp/AGENTS.md` と ADR-012 で、食い違えば正本に従う。
>
> 文中の `docs/components.md`・`docs/screens.md`・`docs/api-design.md`・`router.tsx`・`api/generated/` などは、旧 `packages/frontend`（React + Vite）を想定したパスで、このリポジトリには存在しない。セキュリティの観点は security の資料に分けた。

change-reviewer が Web フロントエンドの差分で読む確認観点。旧 frontend-architecture-reviewer（設計）と frontend-code-quality-reviewer（実装の品質）の観点を残している。変更箇所に関係しない観点は飛ばしてよい。

# 設計

## フォルダ構造・責務分離
- `docs/components.md` で定義されたフォルダ構造（`components/ui/`・`components/common/`・`components/{feature}/`・`components/routing/`）に従っているか。
- 同一機能のコンポーネント・hook・型が適切なフォルダに集約され、関心事が散らばっていないか。
- `pages/`（ルーティングの末端）/ `components/`（再利用可能な UI）/ `lib/`（純粋なユーティリティ）/ `api/`（API クライアント）/ `auth/`（認証）/ `mocks/`（MSW ハンドラ）の境界が守られているか。

## レイヤー設計
- Page → Component → Hook → API client の責務が分かれているか。ビジネスロジックを JSX 内に混ぜない。
- `api/generated/` の orval 生成クライアントを UI から直接呼ばず、ラッパー層（custom hook 等）を介しているか。
- データフェッチ・状態更新・副作用が hook 単位に切り出され、コンポーネントは表示に専念できているか。
- ロジック（フェッチ・変換）と表示（JSX）が分かれているか（Presentational / Container）。

## ルーティング（React Router 7）
- ルート定義が `router.tsx` で一元管理され、複数ファイルに分散していないか。
- リソース名は名詞・複数形か。パラメータ（`:id` 等）の位置・命名が既存ルートと揃っているか。
- 認証必須ルートが `ProtectedRoute` を経由したネスト構造で保護されているか（個別ページで独自実装しない）。
- ルートレベルのデータフェッチに loader を使う場合、TanStack Query と競合していないか。大きいページに `lazy()` を検討したか。

## 状態管理
- API から取得するデータは TanStack Query で管理し、`useState` + `useEffect` で再発明していないか。ローカル UI 状態（モーダル開閉・入力）は Jotai か local state。
- フィルタ・ページ番号・ソート順など、共有・ブックマークできる状態は URL クエリで持っているか。
- Jotai の atom が過大（1つで多くの状態を抱える）または過小（密結合な値が分散）になっていないか。スコープ（global / scoped）は適切か。
- サーバー状態が Query cache と atom の両方にあるなど、同じ状態を二重に持っていないか。

## データフェッチ・キャッシュ（TanStack Query）
- queryKey の命名・階層（`[リソース, id, フィルタ]` 等）がプロジェクト内で一貫しているか。
- mutation 後の invalidate の対象に過不足が無く、関係する一覧・詳細が更新されるか。
- 体験上必要な操作で楽観更新を検討したか。
- `isLoading` / `isError` / `data` の3状態が UI に反映されているか。

## API 契約との整合
- URL・パラメータ・レスポンス型が `docs/api-design.md` や backend の仕様と一致しているか。
- orval 生成の型があるのに独自の型を定義していないか。
- `mocks/handlers/` が実 API のレスポンス構造と乖離していないか。handler の追加時に実 API と同期しているか。

## コンポーネント設計
- `components/ui/`（shadcn / Radix ベース、ビジネスロジック無し）と `components/{feature}/`（ドメイン知識を持つ）の境界が守られているか。
- boolean の props が乱立せず、enum や discriminated union で variant を整理しているか。props が多すぎて肥大化していないか。
- children・slot で柔軟性を確保し、過剰なネスト・props drilling を避けているか。
- 3回以上使う見込みのない共通化・過剰な汎化をしていないか。

## デザインシステムとの整合
- `tailwind.config.ts` の design token（色・スペーシング等）を使い、任意値（`[42px]`・`#3b82f6` の直書き等）を散発させていないか。
- ボタン・バッジ等の variant を CVA / tailwind-variants で体系化しているか（クラス文字列の三項で書き散らさない）。
- 外部からクラスを受け取る props は `cn()` / `tailwind-merge` を介しているか。

## エラー・ローディング・空状態
- ErrorBoundary をルートレベル・機能レベルに置き、fetch の失敗が UI に伝わるか。
- Loading / Empty / Error を共通パターンで実装し、ページごとに独自実装していないか。
- 操作結果の通知（Toast 等）が中央化されているか（アドホックな `alert()` を使わない）。

## テスタビリティ（構造）
- フェッチ・変換・副作用がコンポーネントから分離され、hook 単体でテストできるか。
- 外部依存（API クライアント・日時・乱数等）を props や hook の差し替えでモックできるか。
- `mocks/handlers/` がリソース単位に整理されているか。

## パフォーマンス（設計）
- 大きいページでルートレベルの `lazy()` + `Suspense` を検討したか。
- スコープの広すぎる atom や context が多くのコンポーネントを再レンダーさせていないか。
- サイズの大きいライブラリが初期バンドルに入っていないか。

## 環境変数フラグの設計
- `VITE_USE_MSW`・`VITE_AUTH_STUB_ENABLED` 等の切り替えが、エントリーポイント付近など一貫した位置に集約されているか（本番ビルドへの混入は security の資料で見る）。

## 既存の文書・規約との整合
- `CLAUDE.md`・`AGENTS.md`・`docs/adr/` の方針、`docs/components.md`・`docs/screens.md` のコンポーネント分類・画面構成と一致しているか。

# 実装の品質

Biome / TypeScript strict（`tsc --noEmit`、React・a11y のルールを含む）で検出できるものは対象外: 未使用 import・変数、import 順・フォーマット、`console.log` の残骸、コメントアウトしたコード、Hooks のルール違反（条件付き hook・依存配列）、`key={index}`、`any`、`!`、三項のネスト（`noNestedTernary`）、`<div onClick>`、`alt` の欠落、`label` と input の未紐付け、`target="_blank"` の `rel` の欠落。

## TypeScript の型の意図
- props / 戻り値の型に過不足が無く、optional（`?`）を乱用していないか。
- orval 生成の型を再定義していないか。
- boolean が乱立する箇所を union / discriminated union にすべきではないか。
- 型アサーション（`as`）に根拠があるか。`unknown` を経由した安全な変換になっているか。

## React の使い方の罠（lint で検出されないもの）
- `useEffect` で派生 state を同期していないか（`useMemo` や計算値で足りる）。
- サーバー状態を `useState` + `useEffect` で再発明していないか。
- controlled / uncontrolled が意図せず混在していないか。
- リスト中で関数・オブジェクトを毎回生成し、不要な再レンダーを起こしていないか。
- `useMemo` / `useCallback` を参照同一性が不要な所で濫用、または必要な所で欠いていないか。

## コンポーネントの読みやすさ
- 1ファイルが肥大化・責務過多になっていないか。
- if 文・JSX の深いネストを早期 return・ガード節で整理できないか。
- props drilling が深すぎないか（context・composition で解消できるか）。
- JSX 中の複雑な式を変数やコンポーネントに切り出せないか。ループ・条件レンダリングの本体が長すぎないか。

## TailwindCSS の使い方
- クラス名を動的に組み立てていないか（`text-${color}-500` 等は JIT が拾えない。全クラス名を静的に書く）。
- `cn()` / `tailwind-merge` を介さない結合で utility が衝突していないか。
- 重複・冗長な utility（`flex flex-row` 等）が無いか。
- variant にすべき条件分岐をクラス文字列の三項で書いていないか（CVA 推奨）。
- 任意値（`w-[123px]`）を design token に置き換えられないか。`style={{...}}` と utility を混ぜていないか。

## hooks の品質
- カスタム hook が JSX の生成と処理のロジックを混ぜていないか。
- 毎 render で新しいオブジェクト・配列を返し、利用側を再レンダーさせていないか。
- データフェッチ・変換・表示のロジックが1つの hook に混ざっていないか。

## エラー処理
- try/catch で握りつぶしていないか（`catch (e) {}` 等）。
- TanStack Query の `error` / `isError` が UI に反映されているか（黙って失敗しない）。
- Loading / Empty / Error の3状態を網羅しているか。フォーム送信の失敗をユーザーに伝えているか。

## パフォーマンス（実装）
- context の粒度・props の同一性が過剰な再描画を起こしていないか。
- 巨大なリストに仮想化（TanStack Virtual 等）を検討したか。
- 画像に `loading="lazy"` とサイズ指定があるか。
- 重いライブラリを dynamic import / lazy で遅延読み込みできないか。

## アクセシビリティ（lint で取れない構造）
- モーダル・ダイアログの開閉時にフォーカストラップが効くか。
- Radix UI の primitive のアクセシビリティを活かし、自前で再実装していないか。
- キーボード操作（Tab の順序・Enter / Space による操作）が自然か。
- 動的に追加される要素に `aria-live` 等を設定しているか。

## テストコード
- Testing Library で `getByRole` / `getByLabelText` を優先し、`getByTestId` を濫用していないか。
- 非同期で `findBy*` / `waitFor` を正しく使っているか（`getBy*` の即時クエリで不安定にしない）。
- 内部 state・クラス名などの実装詳細ではなく、ユーザーから見た振る舞いをテストしているか。
- テスト内で上書きすべき MSW handler を `handlers/` に置いてグローバル化していないか。

## 文言・フォーマット
- 表示文言のハードコードがプロジェクトの方針に沿っているか。
- 日付・数値のフォーマットに同じユーティリティを使っているか。

## 命名・抽象化
- 関数・変数名が実装詳細ではなく、ユーザーから見た意図を表しているか。
- 2回しか使わないものを早まって共通化していないか。逆に、同一のロジックが複数箇所にないか。
