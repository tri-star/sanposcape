# mobile メモリ索引

規約の正本は `packages/mobile/AGENTS.md` から辿る docs・ADR。ここには正本に無い落とし穴と手順だけを置く。

- [計画時の確認事項](planning-pitfalls.md) — 「別課題で削除」の予告を拾う・新しいドメイン語の衝突・未使用の既存 Expo 依存は安い・サーバー制約をユーザー操作で回避させない・リリース順序
- [テストと E2E で踏む点](testing-and-e2e.md) — エミュレータで 360dp・font_scale を試す手順・副作用登録のテストで reset しない・disabled を押しても Maestro は失敗しない・config.yaml を書かない・地図の中心はピンに当たる・既存 testID のリネーム禁止・appId のハードコード・全画面の案内の確かめ方
- [API 層と HTTP 出口](api-and-http.md) — customFetch の {status,data,headers} 契約・ApiError.body で原因分岐・Orval の void・redirect は RN で効かない・CloudFront 起因の症状の切り分け・404 読み替え関数で 422
- [hook と TanStack Query の落とし穴](hooks-and-query.md) — 自分の dispatch でキャンセルされるキュー（kick 駆動へ）・間隔制御は errorUpdatedAt も見る・useMutation の雛形・削除直後の 404・useQueries では keepPreviousData が効かない・Rules of Hooks・手動メモ化
- [TS・RN・UI 実装の落とし穴](ts-rn-pitfalls.md) — __DEV__ の代入・丸め値からの派生・軌跡の spread・FlatList の flex:1・入れ子の Pressable・renderBody・ReactNode の ??・Text プリミティブ無し・lucide の版差
- [react-native-maps の実装メモ](maps.md) — 向きは Polygon で描く（Marker の rotation は iOS で効かない）・エミュレータで方位を与える手順・Marker の tracksViewChanges と key・onPress は Marker/POI で発火しない（onPoiClick）・自前の MapRegion 型・キー注入の確認・Polyline の zIndex は iOS で効かない
- [スタックと戻る導線](navigation.md) — replace の連鎖で canGoBack=false・index.tsx と (tabs)/index.tsx・BackHandler は useFocusEffect で購読・Redirect はフォーカス時のみ・useSegments は1コミット遅れる・flash の消費先・戻る処理でストアを触らない
- [認証セッションと後始末](auth-and-session.md) — store からバレルを import しない・AuthGate の依存と children・bootstrap のラッチ・初期化は遅延 throw・永続化の失敗は catch
- [Sign in with Apple（mobile）の事実](sign-in-with-apple.md) — SDK57 は ~57.0.2・プラグインは無条件で entitlement・公式ボタンは Android で自ら null・CodedError のコード・422 は code を消費しない
- [ネイティブ・Expo 設定の事実](native-config.md) — 位置記録プラグインの既定と FGS アイコン・Appearance.setColorScheme の値・expo-file-system の同期 API・app.config.ts の型と expo config
- [ピンと写真の落とし穴](pins-and-photos.md) — 検証失敗は 422 で包む・応答の ID で再開・模型サーバーでテスト・必須フィールド追加で壊れるテスト・EXIF は picker から・隠す状態はサーバーで除外
- [sandbox とツールの落とし穴](sandbox-and-tooling.md) — expo の HOME・EAS は sandbox 外・format:check のスコープ・git 書き込み不可・古い .expo の型・eslint-disable の位置・main の node_modules と lockfile の版差・依存追加直後の配置は CI と違う・eas --json の前置き行・actionlint の入手
- [位置情報の権限と審査の落とし穴](location-permission-review.md) — Androidの拒否はundeterminedに写る・前面復帰でrequestPermissionを呼ぶと繰り返し出る・精度APIはあるが一時要求は無い・pre-promptの審査実例
- [画面ヘッダーの重複は SS-40 で追跡中](screen-header-duplication-ss40.md) — task-local。レビューで新規指摘にせず SS-40 に言及する
