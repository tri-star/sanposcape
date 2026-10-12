# レビュー観点の索引

SS-203 で change-review の参照資料へ移すまでの置き場所。

## mobile

- [mobile レビューの進め方](mobile-review-method.md) — 一次情報で裏取りしてから指摘・一覧外ファイルの JSDoc の陳腐化・引き継ぎの未検証事項・Maestro のコメントの裏取り・誤指摘しないパターン・テストの見方
- [mobile の境界の確認](mobile-architecture-boundaries.md) — app/ からの注入・feature 間 import は lint 非強制・src/api 直下・フラグガードと render slot・後始末の try/catch・戻る導線のラッチとサインインの push
- [React と TanStack の静かな不具合](mobile-react-correctness.md) — useQueries の combine・memo の props・自己キャンセルする effect・成功後の busy・部分保存の基準値・AbortError のログ・連結キー・mock が隠す catch 漏れ
- [画面ヘッダーの重複は SS-40 で追跡中](mobile-screen-header-duplication.md) — task-local。新規指摘にせず SS-40 に言及する
- [RN の a11y の落とし穴](mobile-a11y.md) — accessibilityLabel の上書き・pointerEvents="none" の二重読み上げ・分岐ごとの差・地図だけの入力
- [mobile の認証まわりのセキュリティ観点](security-mobile-auth.md) — 認証ゲートとゲスト・mode 系 env の fail-closed・保存 CTA のゲート・破壊的操作の4点・/app-config
- [mobile の通信とデータのセキュリティ観点](security-mobile-network.md) — HTTP 出口と CloudFront ヘッダー・動的ルートの検証・写真の直送と閲覧・位置情報・散歩の保存

## backend

- [backend の並行性・ロック・時間予算](backend-concurrency-and-locking.md) — プランの並行性設計と実装分岐の突き合わせ / 同時2重 DELETE の SAWarning / 「ちょうど1つ」の0になる方向 / タイムアウトガードの非対称 / 締め切りの非対称
- [backend のコード品質・設計](backend-code-quality.md) — 偽 N+1（identity map）と add_all 後のループ refresh / commit 後のログの ORM 属性 / 閲覧 API の型 / クエリの AwareDatetime / 設計根拠の grep 裏取り / 計画書ラベル / 冪等 INSERT の再送内容
- [backend のセキュリティ](security-backend.md) — IDOR（user_id 必須・404）/ カーソルは認可の後 / 本文サイズの prefix（/auth・/users は対象外）/ ログに出さないもの（caplog で固定）/ 認証の4層とローテーション / テスト DB の到達経路 / 受容済みのレート制限
