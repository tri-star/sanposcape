# Backend Developer Memory Index

- [sandbox-network-docker-exec](feedback_sandbox_network_docker.md) — bashからhost/localhostのdockerポートに直接curlできない。疎通確認はdocker compose exec内から行う
- [backend-auth-mode-env-gotcha](project_backend_auth_mode_env_gotcha.md) — .envのAUTH_MODE既定はdev。ambientなmain.appに依存するauth_modeテストはローカル/CIで結果が変わりうるので明示Settings構築を使う
- [docker-exec-transient-permission-denied](feedback_docker_exec_transient_permission_denied.md) — サンドボックスで`docker compose exec`を短間隔で連続実行すると`~/.docker/config.json`のpermission deniedが散発する。1呼び出しずつ実行するか、コンテナ内でループさせる
- [auth-users-boundary-userservice](project_auth_users_boundary_userservice.md) — `auth`ドメインから`users`ドメインへのアクセスは常に`UserService`経由に統一する設計（SS-10ローカルレビューA-3で確定）。SS-12実装時の choke point
- [project-ss18-walks-backend-complete](project_ss18_walks_backend_complete.md) — SS-18 backend（walksドメイン: 記録保存/履歴/IDOR対策）は実装完了。次はmobile側SS-19/SS-20
- [reference-openapi-json-gitignored](reference_openapi_json_gitignored.md) — `packages/backend/openapi.json`は.gitignore対象。exportしてもgit diffに出ないのは正常
- [project-ss18-review-followup](project_ss18_review_followup.md) — SS-18ローカルレビューの承認4項目対応（tz-aware化・境界値テスト・middleware移動・docs更新）の実装場所と判断ログ
- [feedback-commit-splitting](feedback_commit_splitting.md) — 同一ファイルへの複数レビュー指摘は`git add -p`でhunk単位にコミット分割する
- [reference-stray-claude-dir](reference_stray_claude_dir.md) — エージェントメモリがpackages配下に誤生成される既知のバグ。正しい置き場所は常にリポジトリルート
- [ruff-cache-root-owned-permission-denied](feedback_ruff_cache_root_owned.md) — `.ruff_cache`/`.pytest_cache`がroot/nobody所有になりapp_userから書けない時は`docker compose exec -u root api sh -c 'chown -R app_user:app_user ...'`で復旧
- [project-ss44-fake-maps-provider-complete](project_ss44_fake_maps_provider_complete.md) — SS-44 backend（MAPS_MODE=fake・決定的provider）は実装完了。SS-21 E2Eブロッカー解消
