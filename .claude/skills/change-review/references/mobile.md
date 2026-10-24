# mobile の確認観点

`packages/mobile/` に差分があるときに読む（`app/` のルート・`src/features`・`src/services`・`src/api`・`src/lib`・テスト・`.maestro/`）。
規約の正本: `packages/mobile/AGENTS.md`（ADR 一覧の表）、`packages/mobile/docs/architecture-guideline.md`・`folder-structure.md`・`pages-components-guideline.md`・`naming-conventions.md`、`packages/mobile/adr/`（ADR-M-*）、`docs/adr/`（特に ADR-002・ADR-008）

ここに挙げるのは、oxlint・oxfmt・tsc・vitest が通っても残り、レビューでしか見つからないもの。どれも機能テストでは落ちず「意図した動作が黙って効かない」形で残りやすい。

## 前提の裏取り

- API の型・挙動を根拠に判断する前に、Orval の生成物を作り直して（`pnpm --filter mobile orval`）現物を読む。`src/api/generated/` は gitignore 対象で、worktree には無いか古い。backend の `router.py`/`schemas.py` も現物を読む。
- プランの条件付きの記述（「〜までは〜する」）は、条件が今も真か確かめる。SS-19 では「`data: void` なので narrowing」が既に解消済みだった。
- スタブ値・既定値が別のデータと食い違って見えたら、`docs/mock/*.dc.html` を grep する。元モックの時点で同じなら既存仕様（SS-9 の `DEFAULT_WALK_GOAL`）。
- 変更した関数・状態・遷移を参照している、プランの編集対象外のファイルを grep し、JSDoc・コメントの主張が新しい実装と合っているか。「呼び出し元を A から B へ移す」リファクタでは、呼ばれる側の基盤（`src/lib/sessionCleanup.ts` など）の JSDoc に旧呼び出し元が残る（SS-13）。
- 地図・カメラ・センサーなどネイティブ依存の UI が中核の変更では、プラン・PR の「未実施の手動確認」を読み、中核フローの実機検証が未了なら実装の正しさとは別に報告する（SS-118 ではマーカータップ → 詳細が未検証のまま E2E からも外れていた）。プランの「実機で確認すべきこと」「既知の制約」が、コードのコメントか ADR に残っているかも見る（プランはチケット完了時に消える）。
- 地図のタップで座標を選ぶ実装では、Marker の真上をタップしたとき（Android は MapView に伝わらない。ADR-M-011）を Android 実機で確かめたか。
- ネイティブのセンサー・購読（expo-location の方位など）の値を読む実装では、「取れない」の印を負の値で一律に判定していないか。
  Android の真北は `(磁北 + 偏角) % 360` で求められ、Kotlin の `%` が符号を残すので正当な負の値になる（印はちょうど -1。SS-169）。
  また、ネイティブがプロセスで1本しか購読を持てないか（Android の方位は後勝ち）、解除と再購読がほぼ同時に起きる経路（タブの切り替え）でネイティブへの到着順が入れ替わらないかを、node_modules のネイティブ実装で確かめる（ADR-M-023）。
- 位置のサンプルから距離・軌跡を作る規則（間引き・飛びの除外など。`features/walk/lib/walkTrack.ts`）を変える差分では、次の入力を当てたかを見る。
  - 静止中: OS の 10m の間引きで点が届かず、経過時間だけが伸びる。
  - 大まかな位置: km 単位で位置が動く（ADR-M-022）。
  - fallback 中の背面の欠け: A→B の直線になる。
  - mock の軌跡: 約 38m を 1 秒ごとに進む。
  - あわせて、`app-startup-guide.md` の `geo fix` を使う手動確認の期待値が新しい規則と合っているかも見る（SS-91。ADR-M-018 決定16）。

## 層の境界と依存の向き

- `app/` は薄く、判定は `lib/` の純粋関数、サーバー状態は TanStack Query、`features/<feature>/api/` は素の fetcher のラップ、services は `index.ts` の interface 経由。正本: folder-structure.md「各ディレクトリの役割と配置ルール」「状態管理の使い分け」
- feature 間の直接 import（walk ⇔ pin ⇔ history など）は禁止だが lint は見ていない（`.oxlintrc.json` の override は認証系と `@/config/devTools` だけ）。
- `features/walk|history|pin` に認証由来の値が要るとき、`app/` のルートがプリミティブを返す selector で読んで props で注入しているか。store やユーザーオブジェクトごと渡していないか。横断 hook（例 `useSessionDisplayName`）で lint を形式的に通す形は SS-29 で却下済み。同じ selector が `app/` に2箇所以上あるときの `src/hooks/` への切り出しは可。`features/settings` は override の対象外で store を直接読める（意図的）。正本: architecture-guideline.md「認証の扱い」、ADR-M-009 決定8
- `src/api/` 直下のドメイン形状のラッパは `appConfigApi.ts` だけ。2本目がフラットに置かれたら `src/api/endpoints/` へ分ける（folder-structure.md の `src/api/` 節）。
- feature をまたいで地図に要素を重ねるとき、`app/` が render slot で合成しているか（地図コンポーネントは `mapLayers?: ReactNode` を描くだけ）。全画面の地図オーバーレイに RN `Modal` を使っていないか（ADR-M-011 D7）。
- ビルドの種類（`Updates.channel`・`extra.appVariant`・`PRODUCTION_UPDATES_CHANNEL` との比較）で表示や挙動を変える分岐を足していないか。
  規則は「開発ツールの表示可否だけに使う」（ADR-M-007 SS-148 追補 決定6）で、例外にするなら理由（機能の可否・挙動を変えない、など）を ADR に記録しているか。
  SS-230 ではバージョンの行のチャネル名の付記が、記録の無いまま規則に反していた。
- `api/` 層から到達する位置にネイティブ依存を足したら `vitest.config.ts` の `resolve.alias` にモックを足しているか。`lib/` から `@/components/ui/*` を値 import していないか（`import type` だけにする）。どちらも、足した本人のテストではなく推移的に import する別の `*.test.ts` が落ちる形で現れる。正本: architecture-guideline.md「テストの方針」

## 配布済みアプリ・稼働中の backend との互換

mobile の新しい版は、ストアの審査と利用者の更新を待つ間、古い版と並んで動く。backend も main より古い版が本番で動いていることがある。
正本: `docs/release-runbook.md` §1・§3・§7、ADR-008 決定1・6・7 と SS-233 追補、`docs/compat-ledger.md`。

- 新しいエンドポイント・フィールドを使う機能が、フラグで包まれているか。包まないなら、backend の prod へのデプロイの後に配布する順序がプラン・PR に書かれているか
  （backend より先に届くと存在しない API を叩く。OTA は審査を経ず即時に届くので特に）。
- `FEATURE_FLAG_KEYS` から本番で ON にしたキーを消す差分で、backend が同じ PR でそのキーを固定値に移しているか（mobile 側だけ見ると正しく見えるが、
  backend が登録簿から消すと配布済みのアプリから機能が消える。ADR-008 SS-233 追補 D40）。互換性台帳の行が更新されているか。
- backend の応答の列挙値・`code` で分岐する箇所が、未知の値で落ちたり誤った分岐に入ったりしないか（この版も、次の backend から見れば「古いアプリ」になる）。

## 画面遷移・戻る導線・フラグガード

- 画面ごとフラグで隠すルートが「画面ガードレシピ」どおりか。`pending` で `<Redirect>` しない（フラグ ON でも起動直後に必ず弾かれる）、ナビタブ経由でしか到達しない画面の戻り先は `"/(tabs)"`、タブは `AppTabBar` の項目から外す（`href: null` は効かない）。フラグ値を Zustand に複製していないか。正本: architecture-guideline.md「フィーチャーフラグ」「画面ガードレシピ」、ADR-008
- 戻る操作と、その画面から出る他の遷移が同じ `runOnce` を共有しているか（共有しないと連打で push が二重に積まれる）。正本: pages-components-guideline.md「画面の『戻る』導線の規約」
- `useNavigateOnce` のラッチはフォーカスでしか解除されない。`replace`/`back` が blur を起こさない異常系（ガードのリダイレクト失敗など）で、その画面の離脱操作が永久に無反応にならないか。
- サインイン画面へ push で入る導線は `canGoBack()` の前提を崩しうる（SS-57 で `SettingsView` の push が `/walk-start` の前提を崩した。ゲスト向けサインイン案内は今も push）。認証まわりでは「push と replace のどちらで入ったか」と成功後の遷移を突き合わせ、新しい導線には `replace` か `canDismiss()` → `dismissAll()` を提案する。
- `useSegments()`（今いる画面）とストアの状態の組で表示を決めていないか。セグメントはナビゲーションの状態より1コミット遅れて更新されるので、同じイベントでストアを変えて push すると、古い画面と新しいストアの組で1回コミットされる（SS-101 で全画面の案内の `Modal` が一瞬開いた）。
- 「〜の間は出さない・遷移させない」のような保留の条件が、利用者の操作で必ず解けるか。永続化されない状態（散歩のドラフトなど）は、画面を離れた後も消えずに残ることがある（SS-101 で、保存できなかったドラフトが残ると再起動まで案内が出なかった）。

## React と TanStack Query の静かな不具合

- `useQueries` の戻り配列は毎レンダー新しい参照。`useMemo(() => derive(queries), [queries])` は毎回再計算され、結果を渡した `React.memo` の子が無効化される（SS-118。ADR-M-012 D15）。`combine` にモジュールレベルの純粋関数を渡しているか（インラインのクロージャは不可）、再試行も `combine` の戻り値から呼んでいるか。`useQuery` 単体の `.data` 依存は問題ない。
- `React.memo` のコンポーネントが複数箇所から使われていたら、全呼び出し元でコールバックが安定しているかを横並びで比べる（片方だけ `useCallback` で memo が効かなかった）。`exhaustive-deps` を外して配列を閉じ込めた `useCallback` は、配列の長さが後から変わりうるなら stale closure を疑う。
- 1件ずつ処理するキュー・ポーリングの hook で、effect の依存配列に自分が dispatch する state があり、その dispatch が `await` より前に同期で呼ばれるなら、自分の cleanup で結果を握りつぶす（SS-88 `usePinPhotos.ts`）。無効化が「本当に不要になった条件」だけで行われているか。
- `useMutation` の `isPending` は settle と同時に false になる。成功後の遷移が非同期チェーン（`signOut()` → store → `AuthGate` の effect）だと、その間ボタンが押せる見た目に戻る（SS-62 のアカウント削除で2回目が 401 になりうる）。破壊的操作の disabled が成功状態も busy に含めているか。成功時に同期で遷移するなら問題ない。
- 差分 PATCH + 多段保存（PATCH → 写真削除 → 写真追加）で途中失敗しても画面に留まれるとき、成功した段の応答で基準値を作り直しているか。作り直さないと「A→B を保存→A に戻す」編集が差分ゼロになりサーバーに届かない（SS-119。ADR-M-017 D11）。基準値の確定で fetching 中のキャッシュを掴んでいないか、「A→B→A」のテストがあるか。
- `queryKey` のドメイン接頭辞・カーソルに `null` を渡さない・復旧は `resetQueries`。正本: folder-structure.md「状態管理の使い分け」
- `useQueries` は key が変わるとオブザーバを作り直すので、`placeholderData: keepPreviousData` は効かない（`useQuery` とは違う）。「条件を変えても前のデータが出続ける／読み込み中にならない」という記述や指摘は、`useQuery` か `useQueries` かを確かめてから書く（SS-174 で実装の JSDoc・ADR とレビューの指摘が同じ誤解をした。確かめ方は agent-memory の hooks-and-query）。
- `pinSaveRunner` の DI テストは `dispatch()` のたびに `items` を同期で書き換えるが、`usePinPhotos.ts` は `useReducer` + render 時に同期する `itemsRef`。`await` を挟まない連続 dispatch の直後は古い配列を見うる（未確認の既知ギャップ。冪等なので実害は追加リクエスト程度）。両ファイルを触る差分で確かめる。
- React Compiler が有効（`app.json` の `reactCompiler: true`）なので、render 中の `[...path]` のような派生値は入力の参照ごとにメモ化される。「毎レンダー新しい配列になる」と指摘する前に、そのコンポーネントが `"use no memo"` で外されていないか、Compiler が諦める書き方（render 中の ref の読み書きなど）になっていないかを確かめる（SS-168 で `RoutePolyline` の `[...path]` を誤って負荷として挙げた）。
- render 中の ref への代入（`pausedRef.current = paused`、`useScreenBack` の `interceptRef`）と、render 中の条件付き setState（派生 state）は規約どおり（architecture-guideline.md「1回だけの状態確定」）。前者は依存配列から外す理由が書かれているか、後者は無限ループ・二重発火しないかだけを見る。
- 地図（`react-native-maps`）に、描いた後で座標が変わる `Polyline` / `Polygon` を足す差分では、画面を離れて戻ったとき（タブ切り替え・スタックへの push）に古い座標に戻らないかを見る。Android は付き直すときに、最初に地図へ足した時点の座標で線を作り直す。`onMapReady` の回数を `key` に含めて作り直しているかを確かめる（SS-211。ADR-M-008 決定10。`WalkRouteMapView` が実例）。フォーカス中だけ描く図形と、座標が変わらない線は当たらない。

## エラー処理と後始末

- 複数の後始末を順に実行するメソッドでは、各ステップの try/catch の有無を横並びで比べる。SS-10 の `signOut()` は `tokenStore.clear()` だけ無防備で、reject すると古いユーザーが残った。差があれば「このステップだけ扱いが違う理由」を確認する。
- 「片方の操作でもう片方の状態を消す」には `src/lib/` の後始末レジストリ（`sessionCleanup`・`walkDeletionCleanup`・`backgroundLocationCleanup`）が既存の答え。使っている実装に「なぜ直接 import しないか」と指摘しない。
- `src/services/*` の mock / dev は常に成功するので、呼び出し側 hook の `.catch` 欠如が開発中に見えない。real（Google サインイン → `POST /auth/session` など）は reject しうる。services を呼ぶ hook に `.catch` かエラー state があるか。
- 能動的に `AbortController.abort()` する経路（削除・画面離脱）があるなら、分類の前に意図した中断を除いているか（`isAbortError()`）。AbortError が診断ログに「失敗」として紛れる（SS-88）。JSDoc の「呼び出し側で弾く」を鵜呑みにせず catch ブロックを読む。
- 操作ごとに別の `xxxError.ts` は意図的（ADR-M-001 決定6）なので統合を提案しない。逆に、別の操作の分類を再利用していたら要注意。
- `${a}:${b}` の連結キーで重複判定していたら、区切り文字が値に含まれて衝突し処理が黙ってスキップされうる。値の生成元（`randomUuidV4()` など）を grep し、今起こりうるかで重大度を決める（起こりえなければ Low）。

## 画面の高さと幅

- 縦に要素を足す・大きくする差分では、その画面が ScrollView か確かめる。散歩中画面（`WalkActiveView`）は地図の高さが固定でスクロールしないので、
  下部カードが伸びた分だけ下端のボタンがタブバーの裏へ押し出される（地図は縮まない）。360×640dp・360×780dp で下端のボタンが見えるかを、実画面のスクリーンショットで確かめたか（SS-64）。
- 数値を横に並べる表示は、列の幅が値で変わらない（`flex: 1` の等幅列）か、最も長い値（`100:00:00`・`100,000歩`）と文字サイズ 1.3倍で切れないかを見る。
  `numberOfLines={1}` は折り返しを止めるだけで、はみ出しは防がない（SS-64。`WalkStatGrid`・`StatBlock` の安全策）。

## アクセシビリティ

- 規則（a11y props を必ず設定）の正本は pages-components-guideline.md。以下は見た目では問題なく、スクリーンリーダーで情報が欠ける・操作できないもの。
- 明示した `accessibilityLabel` は子 Text の自動集約を上書きする（`WalkHistoryCard.tsx` の距離・時間が読まれない）。リスト行や「エラー + アクション」系のラベルに補助情報（数値・時刻・説明）が入っているか。安全な先例は `SpotCard.tsx`（明示せず子に任せる）。
- コンテナに label / `role="alert"` を付けて中に独立した Button を入れる形は、子が操作対象から外れうる（SS-19 `WalkSaveStatus.tsx`）。メッセージ行だけを alert で囲むよう求める。断定できなければ「要検証」とする。
- `pointerEvents="none"` は a11y ツリーから消さない。行全体を Pressable にして中を `<View pointerEvents="none"><Checkbox/></View>` にする形（`CategorySheet.tsx`）は二重に読まれうる。`accessibilityElementsHidden`（iOS）と `importantForAccessibility="no-hide-descendants"`（Android）があるか。
- kind / status で出し分けるコンポーネントでは、全分岐の `accessibilityRole`・`accessibilityLabel`・`testID` を横並びで比べる。新しい分岐だけ対応され、移植した古い分岐が取り残されやすい（SS-35 `WalkRouteNotice.tsx`）。
- 地図のタップ・長押しが唯一の入力経路になっていないか（`PinMapFullScreen` は ADR-M-011 に既知の限界として記録。`SanpoMapSelector.tsx` はカードという代替経路を持つ）。新しくそうなるなら `accessibilityHint` や代替入力のフォローアップ化を提案する。

## テストの有効性

- hooks / components にテストが無いことは指摘しない（Vitest は node 環境でレンダリングできない）。テストしたいロジックが `lib/` に出て `.test.ts` があるかを見る。正本: architecture-guideline.md「テストの方針」
- 既知の定数（ハッシュ等）を、実装と同じ定数を import して比べるだけのテストは指摘する。別ルートで計算した値と比べさせる（SS-70: 空文字列の SHA-256 の typo を検出できない形だった）。
- 不変条件を持つレスポンスを Orval の faker モック（引数なしの `get...ResponseMock()`）の乱数に任せていないか。単体テストが services のバレル（`index.ts`）を import していないか（ネイティブ依存に到達しうる）。
- Maestro の yaml のコメントの主張（「戻ると◯◯になる」「`canGoBack()` が true」）は、対象の `router.push`/`replace` を grep してスタックを手でたどって確かめる。`openLink` を使うフローは `app/_layout.tsx` と `app/` のグループ構造も見る。`waitForAnimationToEnd` を時間稼ぎに使っていたら非自明な依存として指摘する。
- 「存在だけを assert する」testID（凡例・コンテナなど）の表示条件を広げる差分では、その testID を `.maestro/` で grep し、フローが確かめたい中身を今も保証しているかを見る。保証しなくなったら、中身に当たる子の testID を待つ形にさせる（SS-168: 凡例が歩いた軌跡だけでも出るようになり、`walk-active-route-legend` の待ちが周回ルートの取得失敗を見逃すようになった）。
- E2E が共有 dev ユーザーを壊す破壊的操作を実行していないか（自分で作った一意なデータの削除は可）。地図一覧を並び順（`item-N`）で選んでいないか。正本: architecture-guideline.md「テストの方針」、ADR-M-004
- 追加・書き換えた `it()` の説明文から、前提・操作と期待結果が読めるか（「正しく動く」「ケース2」のような説明文でないか）。読めなければ Low で書き直しを提案する。触っていない既存テストは指摘しない（SS-142）。正本: architecture-guideline.md「テストの方針」
- 誤指摘しない慣習: `*Copy.test.ts` の非空チェックは既存の慣習なので単発で Medium にしない。プランが模範に名指しした形式（`src/lib/backNavigation.test.ts` の `it.each` テーブル）に倣っていなくても Low に留める。
