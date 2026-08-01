---
name: project_ss19_walk_finish_save
description: SS-19（散歩終了処理・散歩ルート保存、POST /walks）セキュリティレビューの要点
type: project
---

SS-19（`feat/ss-19-walk-finish`、2026-08-02 レビュー）で `useFinishedWalkStore` /
`useWalkSave`（TanStack Query mutation） / `walkTrackPayload.ts`（軌跡の丸め・間引き）/
`src/lib/uuid.ts`（`Math.random` ベースの UUID v4）を新設し、`POST /walks` への保存を実装。
Critical/High 指摘なし。詳細は `tmp/SS-19/review-security.md`（このレビュー時点のスナップショット、
将来的に削除・移動される可能性あり）。

**Why**: 散歩記録保存という location-sensitive な書き込み系フローの最初の実装であり、
今後の SS-20（履歴画面・読み取り系）や記録編集系タスクでも踏襲されるべき設計判断・
継続課題がここに集約されているため。

**How to apply**:
- 指摘（直したほうがよい・Medium）: `signOut()`（`createSessionAuthService.ts`）が
  `useFinishedWalkStore` / `useActiveWalkStore`（Zustand、メモリ保持）をクリアしない。
  共有端末でのアカウント切り替え時に、ログアウト前ユーザーの未保存の散歩ドラフト（軌跡含む）が
  次のログインユーザーのトークンで送信され得る、または黙って上書き消失し得る。
  `useActiveWalkStore` は SS-16 時点から同じギャップが存在（未指摘のまま持ち越されていた）。
  次回、ログイン/ログアウト周りの実装・レビュー時に「ログアウト時クリア対象store一覧」を
  一箇所にまとめる対応を推奨（`queryClient.clear()` も合わせて検討）。
- `client_walk_id`（冪等キー）は `Math.random` ベースの UUID v4 で妥当と判定した根拠:
  backend の一意制約が `UNIQUE(user_id, client_walk_id)`（`walks/models.py:48`）と
  **ユーザースコープ**であることをコードで確認済み。他ユーザーとの衝突では悪用不可
  （`WalkRepository` は全メソッドが `user_id` 必須引数で IDOR 対策済み）。
  同一ユーザー内衝突は UUID v4 122bit のランダム性から実運用上無視できる確率。
  今後同種の「冪等キーの暗号強度は不要」という主張が出てきた場合は、
  **一意制約のスコープ（グローバル or ユーザー単位）を必ず実コードで確認**してから判定すること
  （スコープがグローバルなら判定は変わる）。
- 衝突時の backend 挙動（`WalkRepository.create()`）は新規データを破棄して既存行を返す
  （サイレントな上書き）。今回は Low 判定で対応不要としたが、`client_walk_id` の採番方式を
  変える場合（サーバー採番への移行等）は再評価が必要。
- 位置情報の送信整形（`walkTrackPayload.ts`）: 丸め（小数6桁）→ 連続重複除去 → 上限
  （`MAX_TRACK_POINTS=10_000`）超過時のみ先頭・末尾保持の等間隔ダウンサンプリング、という三段構成。
  backend の `schemas.py` の定数と完全一致していることを確認済み。新規に軌跡送信箇所を追加する際は
  この定数同期が崩れていないか確認する。
- ログ出力（`console.*`）への座標・トークン混入は無し。エラー文言（`walkSaveError.ts`）も
  ステータスコードのみで分類しユーザーに内部情報を出さない、既存 `exploreError.ts` と同じ規律。
- `saveWalk()`（`features/walk/api/walkApi.ts`）は意図的に `signal` を渡さず、画面離脱でも
  保存リクエストを中断しない設計（ADR-008 的なトレードオフとしてプランに明記済み）。
  この「中断しない」設計と上記のログアウト時store未クリアが組み合わさっている点が
  今回のクロスアカウント懸念の直接原因。
- グローバル認証ルートガード不在は [[project_dev_only_routes_no_guard]] と同一の継続課題
  （SS-19 で新規悪化なし。`/walk-summary` 自体は認証必須ルートとして別途ガードされているかは
  今回のスコープ外のため未確認）。
- 開発用ショートカット（`ScreenCatalog` の「散歩サマリ」ボタンが実際に `POST /walks` を発火）は
  `app/dev-screens.tsx` の `__DEV__` ガードで本番到達不能を確認済み
  （[[project_auth_stub_switch]] と同じ fail-safe パターン）。
