---
name: technique-github-actions-action-yml-diff
description: 複数メジャーバージョンをまたぐGitHub Actions（例 setup-uv）のdependabot更新調査で、release notesの読み合わせより action.yml の直接diffが速く確実
metadata:
  type: feedback
  scope: durable
---

複数メジャーバージョンを跨ぐ GitHub Actions の Dependabot 更新（例: astral-sh/setup-uv を v5→v10 のように5メジャー飛び）を調査する際は、各メジャーの release notes を個別に読むだけでなく、`gh api repos/<owner>/<repo>/contents/action.yml?ref=<old-sha-or-tag>` と `?ref=<new-sha-or-tag>` の内容を取得して `diff -u` する。

```bash
gh api repos/OWNER/REPO/contents/action.yml?ref=OLD_REF --jq '.content' | base64 -d > old.yml
gh api repos/OWNER/REPO/contents/action.yml?ref=NEW_REF --jq '.content' | base64 -d > new.yml
diff -u old.yml new.yml
```

**Why:** release notes は「〜がbreaking changeです」という記述はあっても、実際の input のデフォルト値が更新前後で変わったかどうかは書かれていないことが多い（例: setup-uv の `enable-cache` は v5.4.2 の時点で既にデフォルト `auto` であり、v6で新規に`auto`になったわけではなかった）。action.yml の diff を取れば、input の追加/削除/デフォルト値変更が一目で正確に分かり、release notes の解釈ミスを防げる。個別リリースの本文は `gh api repos/OWNER/REPO/releases/tags/TAG --jq '.body'` で取得できる（WebFetchより確実に生のmarkdownが取れる）。

**How to apply:** dependabot-update-workflow で ecosystem が github-actions かつメジャーバージョンが複数またぐ場合、release notes 調査に加えて必ずこの diff 手法を併用する。特に `enable-cache` / `cache-dependency-glob` / `working-directory` のようなキャッシュ・パス関連inputのデフォルト変遷を確認する時に有効。
