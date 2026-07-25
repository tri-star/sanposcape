# Backend Developer Memory Index

- [docker-exec-transient-permission-denied](feedback_docker_exec_transient_permission_denied.md) — サンドボックスで`docker compose exec`を短間隔で連続実行すると`~/.docker/config.json`のpermission deniedが散発する。1呼び出しずつ実行するか、コンテナ内でループさせる
- [auth-users-boundary-userservice](project_auth_users_boundary_userservice.md) — `auth`ドメインから`users`ドメインへのアクセスは常に`UserService`経由に統一する設計（SS-10ローカルレビューA-3で確定）。SS-12実装時の choke point
