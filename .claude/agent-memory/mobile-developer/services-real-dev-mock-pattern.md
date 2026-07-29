---
name: services-real-dev-mock-pattern
description: sanposcape の src/services/ は real/stub の2値ではなく real/dev/mock の3モード。tokenStore.clear() 等の永続化失敗は catch で握りつぶす。
metadata:
  type: project
---

## 3モードパターン（real/dev/mock）

`src/services/<service>/` は `xxx.real.ts` / `xxx.stub.ts` の2値ではなく、
`xxx.real.ts` / `xxx.dev.ts` / `xxx.mock.ts` の3モード（`EXPO_PUBLIC_AUTH_MODE` 等の
`EXPO_PUBLIC_*` 環境変数で選択、既定 `real`）が正典（`packages/mobile/docs/folder-structure.md`
`packages/mobile/docs/toolsets-libraries.md`）。

- `dev`: 本物に近いが実機/外部IdPに依存しない実装（例: `services/auth/auth.dev.ts` は
  backend の `/auth/dev-session` を使い Google に触れない）。
- `mock`: ユニットテスト向けの最小スタブ（メモリ上のダミー実装）。
- ユニットテストでは `services/<service>` のバレル（`index.ts`）を import しない。
  バレルはモード判定の結果ネイティブ依存（例: `react-native-nitro-google-signin`）に
  到達しうるため、個別モジュール／ファクトリ関数を直接 import してフェイクを注入する。

参照実装: `packages/mobile/src/services/auth/`。エージェント定義（`.claude/agents/*.md`
`.codex/agents/*.toml`）にはまだ旧 real/stub 前提の記述が残っている箇所があるので注意
（doc-maintainer への申し送り事項。mobile-developer 側で書き換える対象ではない）。

### 例外: 2モード（real/mock）で正当な場合もある

`src/services/location/`（SS-15, 2026-07-30）は `dev` を持たず `real`/`mock` の2モードのみ。
理由は JSDoc に明記した設計判断で、「本物に近いが実機/外部IdPに依存しない中間実装」に相当する
ものが位置情報には無いため（Android エミュレータ/実機の位置設定・`adb emu geo fix` で
`real` のまま十分に再現できる）。3モードは既定形だが唯一の正解ではなく、
「`dev` に対応する中間実装が存在するか」で判断してよい。

## 起動時クラッシュ連鎖を避ける（configure 系関数）

`app/_layout.tsx` のようにモジュールスコープ（React外・エラーバウンダリ不可）で呼ばれる
初期化関数（`initAuth()` 等）の中で、設定不備を同期 throw させると
production ビルドで環境変数注入を忘れただけで**UIが1フレームも描画される前に全ユーザーが
クラッシュ**する。設定不備は内部に記録するだけにして、実際にその機能が使われた時点
（例: `signInWithGoogle()` 呼び出し時）でエラーを投げる設計にする
（`src/services/auth/googleSignIn.ts` の `configError` パターンを参照）。

## persistence 系の失敗は re-throw ではなく catch で握りつぶす

`tokenStore.clear()` は SecureStore 側の削除失敗時に例外を re-throw する契約
（`tokenStore.test.ts` で固定）だが、呼び出し側（`createSessionAuthService.ts` の
`signOut()` / `doRefresh()` の 401 経路）では **`try/finally` ではなく `try/catch` で
握りつぶす**必要がある。`finally` は例外を再 throw するため、
「`refreshAccessToken()` は throw しない」といった上位の契約を壊してしまう。
`clear()` 自身の `finally` で既にメモリ上の状態は破棄済み＝ローカルなセッション破棄は
成立しており、永続化層の削除失敗は次回 401 で自己修復するため catch して握りつぶしてよい。
同様の「メモリはクリア済みだが永続化層だけ失敗した」ケースは他のサービス（location等）を
実装する際にも起こりうるので、同じ設計判断を踏襲する。
