---
name: map-core-flow-unverified-on-device
description: 地図操作（マーカータップ等）が中核要件のチケットでは、レビュー時に引き継ぎメモ（PR本文の申し送り）の「未実施の手動確認」欄を必ず確認する
metadata:
  type: feedback
  scope: durable
  source_issue: SS-118
---

SS-118（登録済みピンの地図表示・タップで詳細へ push）のレビューで、実装セッションの引き継ぎメモの
「未実施の手動確認」節に、まさにユーザーが最も気にする経路（散歩中の地図・`/pins/map` での
マーカータップ→詳細遷移）が挙がっていた。加えて `.maestro/pin-map.yaml` も「マーカーのタップ→
詳細は E2E しない（Google Maps の描画面上の Marker は testID で安定して触れない）」と明記して
意図的に外していた。つまりコードレビュー・自動テストのどちらでも担保されない経路だった。

**Why**: react-native-maps の `Marker` はネイティブ実装（Google Maps SDK / Apple MapKit）への
依存が強く、`tracksViewChanges` や Android 特有の press 伝播（[[rn-maps-marker-swallows-android-press]]）
など、TypeScript の型検査や単体テストでは検出できない実機依存の挙動を持つ。プランナー・実装者が
「E2E不可」と判断した理由が正当でも、それは「レビューで見なくてよい」ことを意味しない。

**How to apply**: 地図・カメラ・センサー等ネイティブ依存の強いUIが中核要件のチケットをレビューする
ときは、実装セッションの引き継ぎメモ（レビュー依頼で渡されたもの。マージ後はPR本文の
「申し送り事項」）の「未実施の手動確認」
「後続への申し送り」「既知の限界」を必ず確認し、そこに中核フローの実機検証が「未実施」と
書かれていたら、実装の正しさとは別に Warning級で「実機確認が完了していない」ことを明示的に
報告する。E2Eでカバーできない = レビュー担当が無条件に信頼してよい、ではない。
