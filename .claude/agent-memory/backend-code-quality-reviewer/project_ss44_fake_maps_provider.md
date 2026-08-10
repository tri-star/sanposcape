---
name: project_ss44_fake_maps_provider
description: SS-44でMAPS_MODE=fake（FakeGoogleMapsProvider）が追加された経緯と、意図的にスコープ外にした申し送り事項。
metadata:
  type: project
---

SS-44（`feat/ss-44-fake-maps-provider`、2026-08時点でレビュー済み）で `Settings.maps_mode`（`real`|`fake`、既定`real`）と
`FakeGoogleMapsProvider`（`packages/backend/src/sanposcape/integrations/google_maps/fake.py`）が追加された。
`ENV=local`/`test` 限定の許可リスト方式（`AUTH_MODE` と同じ fail-safe）。目的はキー未所持環境・Maestro E2E で
`/explore/places` が常に候補を返せるようにすること（SS-21 の MVP フロー E2E のブロッカー解消）。

**Why:** `build_google_maps_provider()` はキー未設定時 `UnconfiguredGoogleMapsProvider` を返し `/explore/places` が
常に503になるため、SS-21のE2Eが実行不能だった。

**How to apply:**
- `.github/workflows/mobile-e2e.yml` の "Run Maestro flows on emulator" ステップにまだ残っている
  `--exclude-tags=maps-required` と `TODO(SS-44)` コメントは**意図的な申し送り事項**（SS-44の完了条件・スコープに
  含まれない）。SS-44のPRレビューでこれを「変更漏れ」として指摘しない。SS-21側または後続issueで対応される想定。
- fake provider は「Google が返す形の再現ではない」ことが `fake.py` モジュール docstring に明記されている契約。
  fake の存在を理由に `HttpGoogleMapsProvider` 側のテストを削る変更が来たら要注意（意図的に禁止されている）。
- `FakeGoogleMapsProvider.search_places` は候補数を `min(limit, 5)` で決めるため、`PlaceSearchRequest.limit`
  （`ge=1`）が3未満だと「候補は最低3件」という task 要件を満たさない。現状 mobile は常に `limit=20` を送るため
  実害はないが、このコード上の前提はコミットされたドキュメントに存在しない（[[antipattern_plan_decision_refs]] と
  同種の「計画ドキュメントにしか無い」ギャップ）。関連する後続PRで `limit` の扱いが変わる場合は要確認。
