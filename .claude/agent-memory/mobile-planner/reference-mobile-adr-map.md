---
name: mobile-adr-map
description: 設計判断の根拠がどの ADR にあるか（mobile adr/ と横断 docs/adr/ の使い分け・番号の採り方・追補の書式）
metadata:
  type: reference
---

設計を変えるプランを書く前に該当 ADR を読む（`packages/mobile/AGENTS.md` の指示）。
ADR を覆す/追補する場合は `.claude/skills/adr-writing/SKILL.md` スキルを使う。

- **mobile 固有**: `packages/mobile/adr/ADR-00X-*.md`。2026-08-08 時点で **001〜009 まで使用済み**。
  新規は次番を採る。
  - 008 = 進行中の散歩の Zustand とルートの Query キャッシュ共有 / サインアウト時の `sessionCleanup` レジストリ
  - 009 = 認証セッション状態の集約（`useAuthSessionStore`）と認証ゲート（`AuthGate` / `canEnterProtectedRoutes`）。SS-13 で ADR-008 決定6 を追補している
- **frontend/backend 横断・ドメイン知識**: リポジトリルートの `docs/adr/`。
  認証の全体方針は `docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md`
  （決定3 = real/dev/mock の3モード、決定5 = signIn/signUp を区別しない、
  決定6 = ゲストは「トークン非保持の状態」でありメソッドではない → SS-13 で実装済み）。
- ADR を追加したら **`packages/mobile/AGENTS.md` の ADR 一覧表**にも行を足す（忘れやすい）。
  ルートの `README.md` / `docs/project-overview.md` にも ADR 一覧があるので併せて確認する。
- ADR の章立ては既存に揃える: 日付 / ステータス / コンテキスト / 決定 / 検討した選択肢 /
  決定理由 / 影響（ポジティブ・ネガティブ・移行が必要な事項）/ 関連情報。
  追補は日付行に「YYYY-MM-DD 追補（SS-XX）」を足し、本文の該当箇所に `（SS-XX 追補）` を付ける。
  「移行・対応が必要な事項」で解決済みになった項目は、消さずに**取り消し線＋`→ SS-xx で決着`** で残す
  （ADR-003 / ADR-008 がこの書式の実例）。

Related: [[reference-planning-inputs]], [[auth-architecture]]
