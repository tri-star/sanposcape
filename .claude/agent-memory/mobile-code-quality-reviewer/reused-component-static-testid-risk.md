---
name: reused-component-static-testid-risk
description: 内部要素に固定 testID を持つ共有コンポーネント（例 LocationPermissionNotice）を複数画面から使うと、両画面が同時マウントされた場合に testID 重複が起き得る。SS-16レビューで発見
metadata:
  type: project
---

`packages/mobile/src/features/walk/components/LocationPermissionNotice.tsx` は root の `testID`
は呼び出し側から上書き可能だが、内部の「再試行」ボタン（`testID="location-permission-notice-retry"`）
と「設定を開く」ボタンは固定 testID で、呼び出し側から変更できない。

SS-16 でこのコンポーネントが `WalkStartView`（`/walk-start` ルート）に加えて `WalkActiveView`
（`(tabs)/index.tsx`）からも使われるようになり、1コンポーネントを2画面が共有する状態になった。

**Why:** Expo Router のタブナビゲータや将来のルーティング変更で両画面が同時にマウントされたままに
なるケースが生まれると、同じ testID を持つ要素が2つ存在してしまい、Maestro/RTL の `id:` クエリが
曖昧になる。現時点（`router.replace` で片方をアンマウントする設計）では実害が出ていないため
Critical/Warning ではなく記録のみの扱いとした。

**How to apply:** 複数画面から使い回される共有コンポーネントをレビューするときは、
「root の testID だけでなく内部のインタラクティブ要素の testID も呼び出し側から注入可能か」を
確認する。固定 testID が複数箇所から使われる設計を見つけたら、実際に同時マウントされ得るか
（タブ/スタックの keep-mounted 挙動、ルーティング構成）を確認してから重大度を判断すること。
