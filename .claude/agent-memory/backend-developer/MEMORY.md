# Backend Developer Memory Index

- [sandbox-network-docker-exec](feedback_sandbox_network_docker.md) — bashからhost/localhostのdockerポートに直接curlできない。疎通確認はdocker compose exec内から行う
- [backend-auth-mode-env-gotcha](project_backend_auth_mode_env_gotcha.md) — .envのAUTH_MODE既定はdev。ambientなmain.appに依存するauth_modeテストはローカル/CIで結果が変わりうるので明示Settings構築を使う
