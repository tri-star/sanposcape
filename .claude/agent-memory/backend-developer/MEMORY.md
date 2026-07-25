# Backend Developer Memory Index

- [sandbox-network-docker-exec](feedback_sandbox_network_docker.md) — bashからhost/localhostのdockerポートに直接curlできない。疎通確認はdocker compose exec内から行う
- [backend-auth-mode-env-gotcha](project_backend_auth_mode_env_gotcha.md) — .envのAUTH_MODE既定はdev。ambientなmain.appに依存するauth_modeテストはローカル/CIで結果が変わりうるので明示Settings構築を使う
- [docker-exec-transient-permission-denied](feedback_docker_exec_transient_permission_denied.md) — サンドボックスで`docker compose exec`を短間隔で連続実行すると`~/.docker/config.json`のpermission deniedが散発する。1呼び出しずつ実行するか、コンテナ内でループさせる
- [auth-users-boundary-userservice](project_auth_users_boundary_userservice.md) — `auth`ドメインから`users`ドメインへのアクセスは常に`UserService`経由に統一する設計（SS-10ローカルレビューA-3で確定）。SS-12実装時の choke point
