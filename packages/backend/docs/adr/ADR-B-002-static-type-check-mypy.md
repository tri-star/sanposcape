# ADR-B-002: backend の型チェックに mypy を使い、テストを含めて CI で検査する

## 日付

2026-11-17（初版。SS-140）

## コンテキスト

- backend は `Protocol`（`integrations/aws/s3.py` の `ObjectStorage`、`integrations/google_maps/provider.py` の `GoogleMapsProvider`、
  `auth/providers/jwks.py` の `JWKSClientProtocol` など）を、本物の実装とテストの Fake の両方が構造的部分型で満たす作りになっている。
- それまでの CI（`.github/workflows/backend-ci.yml`）は ruff・alembic・pytest だけで、型を見ていなかった。
  そのため Fake と本物のシグネチャの食い違いは、実際の DI を通る結合テストで初めて分かり、単体テストでは検出できなかった。
- 導入の時点で、テストの Fake が Protocol を満たさない例が実際にあった。
  - `GoogleMapsProvider` の Fake が、そのテストで使わないメソッドを持っていなかった。
  - JWKS の Fake は、戻り値の型が None だった。
  - `FlakyStorage` は `get_bytes` しか持っていなかった。
  - 地図のサービスのテストの spy は、本物の `delete_best_effort` の `deadline_seconds` を持っていなかった。

## 決定

1. **型チェッカーは mypy にする。** dev 依存（`pyproject.toml` の `[dependency-groups] dev`）に入れ、Pydantic の公式プラグイン `pydantic.mypy` を使う。
   設定は `pyproject.toml` の `[tool.mypy]`・`[tool.pydantic-mypy]` に置く。
   - コンテナ内で `docker compose exec api uv run mypy` として実行する（ruff・pytest と同じ流儀）。
   - CI では、backend CI の lint ジョブで `uv run mypy` を流す。lint ジョブは `backend-deploy.yml` のゲートも兼ねるので、型のエラーがあるとデプロイも止まる。
2. **検査の範囲は `src` 全体で、テストも含める。** 目的がテストの Fake と本物の食い違いの検出なので、テストを外さない。
   - `check_untyped_defs = true` にして、注釈の無いテスト関数・fixture の本体も検査する。
   - tests 配下に `__init__.py` が無く、同じ名前のテストモジュールが並ぶ。そのため `mypy_path = "src"`・`explicit_package_bases = true` でパッケージの基点を固定する。
   - `scripts/`・`alembic/` は対象外にする。
3. **既存のエラーはベースラインにせず、導入の時点で 0 にする。** ファイル単位の `ignore_errors` のベースラインにすると、そのファイルの中の Fake の食い違いも黙るためである。
   本体の修正は、型の注釈・`cast`・`assert` に限り、挙動は変えない。
4. **テストの Fake は Protocol を満たす形で作る。**
   - 部分的にだけ使う Fake は、Protocol の全メソッドを持ち、呼ばれたら `AssertionError` にする土台を継承する。例: `maps/tests/provider_stub.py` の `GoogleMapsProviderStub`。Protocol にメソッドを足したら、土台にも足す。
   - 具象クラスの代わりに入れる spy は、その具象クラスを継承する（`cast` で包まない。`cast` は食い違いを隠す）。
5. **`# type: ignore` は、テストが意図して不正な値を渡す行にだけ、エラーコード付きで書く。** 例: 想定外の role、alg=none の JWT、Settings の不正な値、Lambda の context の None。
   `warn_unused_ignores = true` にして、不要になった ignore を残さない。
6. **型情報を同梱しないライブラリの扱い。**
   - boto3 / botocore はスタブ（types-boto3）を入れず、`ignore_missing_imports` にする。client は `Any` で受ける。
   - pyyaml は `types-PyYAML` を入れる。
   - Pydantic プラグインの `init_typed` は既定（False）のままにする。テストが dict や不正な値をモデルに渡して、検証を確かめるためである。

## 検討した選択肢

### 選択肢1: mypy（採用）

- **概要**: 純 Python の型チェッカー。uv の dev 依存と lock に入る。
- **メリット**:
  - Node が要らず、コンテナ内で ruff・pytest と同じ流儀で動く。
  - Pydantic v2 の公式プラグインがあり、`BaseModel`・`BaseSettings` の `__init__` を扱える。
  - SQLAlchemy 2.0 の `Mapped[]` はプラグイン無しで解ける。
- **デメリット**:
  - pyright より遅い（このコードベースでは数十秒で、問題にならない）。
  - 既定の設定では注釈の無い関数の本体を見ないので、`check_untyped_defs` を明示する必要がある。

### 選択肢2: pyright / basedpyright

- **概要**: Microsoft の型チェッカーと、その派生。
- **メリット**: 速い。エディタ（Pylance）と同じ判定になる。
- **デメリット**:
  - Node が要り、Python の dev 依存だけで完結しない（pip の配布は Node を取ってくる）。
  - Pydantic のプラグインの仕組みが無い。
  - 導入の時点の件数が多かった。既定の設定で mypy 388 件・basedpyright 607 件（どちらもテストを含む）。

### 選択肢3: 段階的に導入する（ベースライン化・対象を限定して始める）

- **概要**: 既存のエラーのあるファイルを `ignore_errors` で据え置く。または本体だけを検査して始める。
- **メリット**: 導入の差分が小さい。
- **デメリット**: 据え置いたファイルの中の Fake の食い違い（課題の本題）が検出されない。また、テストを外すと目的を満たさない。

## 決定理由

- 課題の完了条件は「CI で型チェックが実行され、Protocol に適合しない実装があれば失敗する」である。テストの Fake を含めて検査し、ベースラインを作らないことでこれを満たす。
- エラーの多くは機械的に直せた。Pydantic プラグインで消えるもの、router の `responses` の dict の型、role の Literal などである。このため、一括で直す費用はベースラインの運用より小さかった。
- 既存のツール（uv・ruff・pytest をコンテナ内で実行）と同じ流儀で動くことを優先した。

## 影響

### ポジティブな影響

- Fake と本物のシグネチャの食い違い、Literal（role など）への `str` の渡し忘れ、Optional の読み忘れを、CI で検出できる。
- `sanpo_map_members.role` を `Mapped[SanpoMapRole]` にしたので、権限判定の関数へ渡す role が型で照合される。列の型と CHECK 制約は変えていないので、マイグレーションは不要。

### ネガティブな影響・トレードオフ

- `app.dependency_overrides` に入れる Fake は照合されない。`dependency_overrides` は Callable の辞書なので、Fake の型が依存の戻り値の型と結びつかない。照合されるのは、Fake を型の付いた引数に直接渡す経路だけ。
- boto3 の呼び出しの引数の誤りは、型では見つからない（スタブを入れていないため）。
- 依存の版上げ（Pydantic・SQLAlchemy・pyjwt・OpenTelemetry など）で型が変わると、mypy が落ちて直しが要ることがある。

### 移行・対応が必要な事項

- `dependency_overrides` 経由の Fake を照合する仕組み。依存の戻り値の型に Fake を結びつける型付きの helper を conftest に置く案がある（案が有効かは未検証）。
- `scripts/` を検査の対象に入れる。`scripts/walkshare_migration` は SS-242 で外すので、その後に残るものを対象にするとよい。
- 自律実行の sandbox で書けなかった定義に、mypy を足す。対象は `.claude/agents/dependabot-update-resolver.md` の backend の確認と、`.claude/skills/structure-refactor/SKILL.md` の検証手順。

## 関連情報

- 課題: SS-140（PR #263）
- 設定: `packages/backend/pyproject.toml` の `[tool.mypy]`・`[tool.pydantic-mypy]`、`.github/workflows/backend-ci.yml` の lint ジョブ
- テストの土台: `packages/backend/src/sanposcape/maps/tests/provider_stub.py`
- 完了前の確認: `packages/backend/AGENTS.md`、ツール一覧: `packages/backend/docs/toolsets-libraries.md`
- 関数の単位の lint のルール（ruff）: [ADR-017](../../../../docs/adr/ADR-017-function-complexity-lint-rules.md)
