---
name: nested-pressable-checkbox
description: 行全体をPressableにして中にCheckbox/Switchを置くと二重タッチ/二重読み上げのリスクがある。内側は pointerEvents="none" + accessibilityElementsHidden/importantForAccessibility="no-hide-descendants" で表示専用にする
metadata:
  type: project
---

## 行全体をタップ対象にする一覧行 + 内側の Checkbox/Switch

`CategorySheet`（表示するスポットの絞り込みシート）のように「行全体をタップしてもチェックが
切り替わってほしい」UIで、行を `Pressable`、中に `Checkbox`（それ自体も内部で `Pressable`）を
置くと、タップ位置によって行の `onPress` と `Checkbox` の `onChange` の両方が意図せず絡む
リスクがある（RN のタッチレスポンダは基本的に最も深いレスポンダが奪うため実害は出にくいが、
「チェックボックスの上をタップすると反応しない/二重に切り替わる」ように見える事故になりうる）。

**How to apply**: 行の `Pressable` に `onPress={() => onToggle(...)}` を持たせて
`accessibilityRole="checkbox"` + `accessibilityState={{ checked }}` を付け、
中の `Checkbox`/`Switch` は `<View pointerEvents="none"><Checkbox ... /></View>` で
**表示専用**にする（`onChange` は prop 必須なので同じハンドラを渡しておくが、実際に発火するのは
外側の行だけ）。これによりタップ判定の主導権を1箇所に固定できる。
