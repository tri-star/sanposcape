# backend-planner memory index

- [認証アーキテクチャ (ADR-002) と M3 の分担](project_auth_architecture_ss10.md) — Google 直結 + 自前セッショントークン。SS-10/SS-12 の線引き
- [確定済み設計の扱いと API 命名規約](feedback_settled_design_and_api_conventions.md) — 確定 ADR は再検討しない / フィールド名は snake_case 統一
- [M5「散歩記録・履歴」の分担と ADR-003 追補運用](project_m5_walk_history.md) — SS-18〜21 の順序 / walks の設計は ADR-003 に一本化し追補し続ける（残タスクもそこに載る）
- [CloudFront OAC は Authorization を上書きする](feedback_cloudfront_oac_authorization_header.md) — Lambda Function URL 構成では認証ヘッダー名の設計を必ず立てる。/health では露見しない
- [SS-33 周回ルート再チャレンジの落とし穴](project_ss33_loop_route_pitfalls.md) — 前回PR#62の指標冗長性 / fake 200m候補がE2E生命線 / 旧ブランチADR-005番号衝突
- [AWS AppConfig フィーチャーフラグ 4 つの罠](feedback_appconfig_feature_flag_gotchas.md) — OFF フラグの属性は配信されない / トークン1回限り24h / 空ボディ / IAM は appconfig 名前空間
- [infra 未 apply の SSM resolve は deploy を止める](feedback_template_ssm_resolve_blocks_deploy.md) — アプリは Unconfigured で先行、template 結線は infra apply 後の別チケット
- [SS-88 ピン命名と写真の上限（ユーザー決定）](project_ss88_pin_naming_and_photo_limits.md) — Pin/SanpoMap、スポット=ゴール候補、写真無制限・10MiB・1GiB・サムネイル必須
