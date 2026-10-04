"""template.yaml を読むテスト用の共有ヘルパー（tracing / monitoring の設定テストが使う）。

`!Sub` / `!Ref` / `!If` などの CloudFormation の短縮タグは、タグ名を捨てて中身（文字列・リスト・
マップ）のまま返す。そのため `!If [IsProd, a, b]` は `["IsProd", a, b]`、`!Ref X` は `"X"`、
`!Sub "..."` は `"..."` になる。入れ子（`!Sub` の変数マップの `!If` など）も展開済みで返す。

パース結果は呼び出しをまたいでキャッシュする。**返された dict は変更しないこと**。
"""

from functools import cache
from pathlib import Path

import yaml

BACKEND_DIR = Path(__file__).resolve().parents[3]


class _CloudFormationLoader(yaml.SafeLoader):
    """`!Sub` / `!Ref` などの CloudFormation の短縮タグを、中身のまま読む。"""


def _construct_tag(loader: yaml.SafeLoader, tag_suffix: str, node: yaml.Node) -> object:
    # deep=True が要る。無いと入れ子のタグ（`!If` を含むマップなど）が未構築のまま返る。
    if isinstance(node, yaml.ScalarNode):
        return loader.construct_scalar(node)
    if isinstance(node, yaml.SequenceNode):
        return loader.construct_sequence(node, deep=True)
    return loader.construct_mapping(node, deep=True)


_CloudFormationLoader.add_multi_constructor("!", _construct_tag)


@cache
def load_template() -> dict:
    return yaml.load((BACKEND_DIR / "template.yaml").read_text(), _CloudFormationLoader)


def load_resources() -> dict:
    return load_template()["Resources"]
