# Memory Index

- [backend auth / mode fail-safe checklist](sanposcape-auth-architecture-notes.md) — 正本ADR-002。dev迂回の4層・許可リスト方式の検証・refreshローテーション。staging穴/本文サイズは解消済み、/auth/*のレート制限のみ未対応
- [backend security conventions](sanposcape-backend-security-conventions.md) — IDOR(user_id必須・404)、無署名カーソルは認可後にデコード、本文サイズ制限のprefix、ログに出さないもの、受容済みのレート制限Low
- [SS-141 test-DB reset review](project_ss141_test_db_reset_review.md) — reviewed 2026-09-28, no Crit/High/Med; test_database_url never touches prod DSN, CI TEST_DB_NAME==DB_NAME is a per-job ephemeral container
