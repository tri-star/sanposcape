"""FastAPI アプリから OpenAPI 定義を openapi.json / openapi.yaml に出力する。

mobile 側の Orval がこの定義からクライアント・MSW モックを生成する。
コンテナ内で実行する:
    docker compose exec api uv run python scripts/export_openapi.py
"""

import json
from pathlib import Path

import yaml

from sanposcape.main import app

OUTPUT_DIR = Path(__file__).resolve().parent.parent


def main() -> None:
    schema = app.openapi()

    json_path = OUTPUT_DIR / "openapi.json"
    json_path.write_text(json.dumps(schema, ensure_ascii=False, indent=2) + "\n")

    yaml_path = OUTPUT_DIR / "openapi.yaml"
    yaml_path.write_text(yaml.safe_dump(schema, allow_unicode=True, sort_keys=False))

    print(f"Wrote {json_path}")
    print(f"Wrote {yaml_path}")


if __name__ == "__main__":
    main()
