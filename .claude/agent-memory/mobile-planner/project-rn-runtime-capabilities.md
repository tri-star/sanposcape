---
name: project-rn-runtime-capabilities
description: What the Expo 57 / RN 0.86 runtime in this repo does NOT provide (crypto, persistent storage) and the cost of adding it
metadata:
  type: project
  scope: durable
  adr: packages/mobile/adr/ADR-004-e2e-build-ci-strategy.md
  verify_by: 2026-12-31
---

プラン作成時に「当然あるだろう」と誤解しやすい実行時 API / 依存の実態（2026-08 に node_modules を grep して確認）。

## 無いもの

- **`crypto.randomUUID` / `crypto.getRandomValues`**: `node_modules/expo` にも `node_modules/react-native/Libraries` にも実装が無い。
  → UUID が要るなら `src/lib/uuid.ts` に `randomUuidV4(random = Math.random)` を自前実装するのが最小コスト（冪等キー用途なら暗号強度は不要）。
  ハッシュ（SHA-256 等）が要る場合は `expo-crypto` の `digestStringAsync`（既定 HEX。大文字小文字は仕様上保証されないので `.toLowerCase()` を通す）。
  導入状況は `packages/mobile/package.json` を都度確認すること（SS-70 で追加する計画があった）。
  **ネイティブモジュールを `src/api/client.ts` から到達する位置に足したら、`vitest.config.ts` の `resolve.alias` にモックを足す**
  （足さないと features の api テストが軒並み落ちる）。
- **永続ストレージ**: `@react-native-async-storage/async-storage` は未導入。`expo-secure-store` は導入済みだが値サイズ上限が約 2KB で軌跡のような配列は置けない。
  **`expo-file-system@57.0.1` は推移的依存として node_modules に存在する**（明示依存ではない）ので、永続化が要るときの第一候補になる。

## 依存追加のコスト

- `pnpm-workspace.yaml` に `minimumReleaseAge: 2880`（2日）。
- ~~ネイティブ追加で E2E APK キャッシュがミスする~~ → **ADR-004 の 2026-08-14 追補で撤回済み**（キャッシュキーは `packages/mobile` のソース全体ハッシュ）。`toolsets-libraries.md` も「論点にならない」と明記。
  実際のコストは development build の作り直し（ADR-003）と `minimumReleaseAge`。足す場合はプランに理由を書く。
- `expo-image`（表示用）は依存にあるが SS-88 時点まで未使用。`expo-image-picker` / `expo-image-manipulator` は未導入（SS-88 プランで追加予定）。

Related: [[mobile-structure]], [[project-e2e-ci-constraints]]
