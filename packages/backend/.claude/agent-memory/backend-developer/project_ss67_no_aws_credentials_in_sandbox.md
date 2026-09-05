---
name: project-ss67-no-aws-credentials-in-sandbox
description: この開発環境には AWS 認証情報が一切無い。sam deploy / sam local invoke（実シークレット経由）等の実AWS検証は不可
metadata:
  type: project
---

SS-67（backend の AWS SAM デプロイ基盤）の作業で判明した環境の制約。

- `~/.aws` はこのユーザー（tristar）から見ると別ユーザー（hirok）の Windows 側パスへの
  シンボリックリンクで、リンク先の実体が存在しない（`ls` すると `No such file or directory`）。
- `aws configure list-profiles` は空、`AWS_PROFILE` 等の環境変数も未設定。
- `aws sts get-caller-identity` は `NoCredentials` エラーになる。
- IMDS（`169.254.169.254`）へのアクセスは sandbox のネットワークポリシーでも拒否される
  （`deny network-outbound 169.254.169.254:80`）ため、そもそも EC2 ロール経由の解決も無い。

**Why**: この環境は AWS へのデプロイ・実シークレット取得を伴う検証を行うための環境ではない
（少なくとも 2026-09-06 時点）。

**How to apply**:
- `sam deploy` / `sam local invoke`（`APP_SECRET_ARN` に実 ARN を入れて実際に Secrets
  Manager へ到達する経路）を伴うタスクを受けた場合、これらは実行できない前提で作業し、
  「AWS 認証情報が無いため未検証」と正直に報告すること。
- **SSO の再ログインや `aws configure` での新規設定など、認証情報を能動的に用意する行為は
  ユーザーの明示的な指示が無い限り行わない**（SS-67 のタスク指示で明確に禁止されていた。
  期限切れの SSO セッションを検出しても re-login しない）。
- `sam validate --lint` と `sam build --use-container`（Docker のみ必要、AWS 認証不要）は
  この制約の影響を受けず実行できる。[[reference-sam-cli-location]] も参照。
