---
name: pressable-pointerevents-a11y-pitfall
description: RN の pointerEvents="none" はタッチだけ無効化し、アクセシビリティツリーからは要素を消さない（二重読み上げの原因になりうる）
metadata:
  type: project
---

`packages/mobile` では、行全体をタップ領域にしつつ内側に見た目だけのプリミティブ（例:
`Checkbox`）を置きたいとき、`<View pointerEvents="none"><Checkbox .../></View>` で
「タッチの奪い合い」を避けるパターンが使われている（例: `src/features/walk/components/CategorySheet.tsx`）。

**Why:** `pointerEvents="none"` はタッチ/ジェスチャーのヒットテストのみを無効化し、
`accessibilityRole`/`accessibilityState` を持つ内側の `Pressable`（`Checkbox` など、
他の primitive も同様に自前で `accessibilityRole` を持つ）はアクセシビリティツリーに
残り続ける。結果としてスクリーンリーダーは「外側の行」と「内側の Checkbox」を
両方読み上げてしまう可能性がある（実機/VoiceOver・TalkBack での実地検証はしていないが、
RN の仕様上そう動作するはず）。

**How to apply:** 同種のパターン（行全体 Pressable + 内側に元々アクセシブルな primitive を
`pointerEvents="none"` だけで無効化）を見つけたら、内側要素に
`accessibilityElementsHidden`（iOS）+ `importantForAccessibility="no-hide-descendants"`
（Android）も併せて付与されているか確認する。無ければ指摘する
（[[mobile-code-quality-checklist]] のアクセシビリティ観点）。
根本対応としては、内側は Pressable を使わない「見た目だけのbox+icon」を直接描画する方が
シンプルで安全なことが多い。
