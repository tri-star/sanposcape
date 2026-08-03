---
name: rn-flex-layout-pitfall
description: FlatList/ScrollView collapse to zero height unless given an explicit flex:1 style when nested as a sibling in a flex column View
metadata:
  type: feedback
---

When a screen root `View` is a flex column (e.g. `{ flex: 1, backgroundColor: ... }`, with a
non-flex header as the first child), a `FlatList` or `ScrollView` placed as the second child
needs its own `style={{ flex: 1 }}` (separate from `contentContainerStyle`). Without it, RN does
not give the list a bounded height to grow into and it can render collapsed/empty-looking even
though `data`/children are non-empty.

**Why:** caught this while building `WalkHistoryListView` (`FlatList`) and `WalkDetailView`
(`ScrollView`) in SS-20 — both had a header `View` (auto height) followed by the
list/scroll view with only `contentContainerStyle` set, no `style`. Added a `flatList`/
`scrollView` style key with `flex: 1` to fix.

**How to apply:** whenever composing `<View style={{flex:1}}><Header/><FlatList .../></View>` or
the `ScrollView` equivalent, always add an explicit `flex: 1` `style` to the FlatList/ScrollView
itself, not just `contentContainerStyle`.
