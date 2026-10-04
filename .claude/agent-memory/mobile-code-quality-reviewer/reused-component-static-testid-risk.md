---
name: reused-component-static-testid-risk
description: 複数画面で共有するコンポーネントは、root だけでなく内部のインタラクティブ要素の testID も呼び出し側から注入・派生できるか確認する（LocationPermissionNotice の実例は解消済み）
metadata:
  type: feedback
  scope: durable
---

SS-16 で、`LocationPermissionNotice` の内部ボタン（再試行・設定を開く）の testID が固定値のまま、
複数画面から使われていることを見つけた。両画面が同時にマウントされると testID が重複し、
Maestro/RTL の `id:` クエリが曖昧になる。

**解消済み（2026-10 確認）:** コンポーネントは `src/components/location/LocationPermissionNotice.tsx` へ昇格し、
内部の testID は `retryTestID ?? \`${rootTestID}-retry\`` のように、呼び出し側から注入するか
root の testID から派生させる形になった。現在は `WalkStartView`、`WalkActiveView`、`WalkSaveStatus`、
`PinTabView` で使われている。

**How to apply:** 共有コンポーネントをレビューするときは、内部のインタラクティブ要素の testID が
呼び出し側から注入・派生できるか確認する（上の実装が先例）。固定 testID が残っていたら、
実際に同時マウントされうるか（タブやスタックの keep-mounted 挙動）を確かめてから重大度を決める。
