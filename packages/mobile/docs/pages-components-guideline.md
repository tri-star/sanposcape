# ページ、コンポーネント実装ガイドライン

## 全般
現時点ではユーザーにReactNative開発の経験が少なく、大まかな方針を示す。
必要に応じ更新しながら改善を目指す。

- UIパーツはなるべくコンポーネント化し、再利用性を高める。
- componentsフォルダ直下にコンポーネントを集めると簡単に肥大化するため、
  カテゴリ毎にサブフォルダを作成する。
- ボタンなどの「共通的」なコンポーネントと、特定機能のために作成する「機能別コンポーネント」もフォルダを分けて管理する。

## スタイルの書き方

スタイルは React Native 標準の `StyleSheet` を `makeStyles` でラップして書く（背景は [ADR-005](../adr/ADR-005-styling-without-unistyles.md)）。

```tsx
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export function SpotCard() {
  const styles = useStyles();
  return <View style={styles.root} />;
}

// コンポーネントの下に置く。テーマ（light/dark）ごとにキャッシュされる。
const useStyles = makeStyles((theme) => ({
  root: {
    backgroundColor: theme.colors.surfaceCard,
    borderRadius: theme.radius.lg,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
}));
```

- **色・余白・角丸・影・文字サイズはハードコードせず `theme` から取る**。値の一覧は `src/theme/tokens.ts`。
- 押下状態など、レンダリング中に値が決まるものは `useTheme()` で `theme` を直接読み、インラインスタイルで合成する。
- `theme.colors` は用途名（`surfaceCard` / `textSecondary` など）。`theme.palette` は生のカラーランプで、
  用途名で表現できないときの最後の手段。
- **色付きの面に載せる文字・アイコンの色は2種類あるので取り違えないこと**。
  - `onPrimary` … `primary` の面の上（ダークでは primary が明るい青になるため near-black になる）
  - `onColor` … `danger` / `success` / 地図カテゴリ色など、primary 以外の彩度の高い面の上（両テーマとも白）
- 地図のカテゴリ色は `theme.map`（`park` / `cafe` / `culture` / `station` …）を使う。
- `lineHeight` / `letterSpacing` は `theme.typography.leading` / `tracking`（倍率・em）を
  `lineHeight()` / `letterSpacing()` で px に換算して指定する。

## 共通UIコンポーネント

デザインシステム由来の primitive は `src/components/ui/<kebab-case>/<PascalCase>.tsx` に置いている
（Button / IconButton / Card / Badge / Tag / Input / Checkbox / Switch / Tabs / TabBar / StatBlock /
ProgressBar / Dialog / BottomSheet / Toast / MapPin / Icon）。
まずはこれらを組み合わせて画面を作り、足りないものが出たら追加する。

- 一覧は暫定ホーム画面（`app/index.tsx` → `DesignSystemGallery`）で実機確認できる。

### 共通UIコンポーネントを追加・変更するときのルール

1. **色・フォントサイズをハードコードしない**。必ず `theme` 経由（例外はスクリムなど `theme.colors.scrim`
   でも表現できないケースのみ）。
2. **タップ領域は最低 44×44 を確保する**。見た目が 44px 未満のコントロールは
   `hitSlopFor(見た目のサイズ)`（`src/lib/hitSlop.ts`）で不足分を補う。
   適用済み: Button(sm=34) / IconButton(sm=32) / Switch(26) / Checkbox(22) / Tag(36) / Tabs(34)。
3. **押下フィードバックは `scale: 0.97` + 色変化**で表現する。Web 由来のフォーカスリングは持ち込まない。
4. **角丸の規律**: コントロール `radius.md`(14) / カード `radius.lg`(20) / ヒーロー・シート `radius.xl`(28) /
   ボタン・タグ・バッジは常に `radius.pill`。**4px 未満の角丸は作らない**（`radius.xs`=6 が下限）。
5. **アイコンは必ず `Icon` コンポーネント経由**。`lucide-react-native` を直接 import しない
   （バンドルサイズを1箇所で棚卸しするため）。名前はデザインと同じ kebab-case（例: `chevron-right`）で、
   使いたいアイコンが無ければ `src/components/ui/icon/iconRegistry.ts` に1行追加する。**絵文字は使わない**。
6. **`accessibilityRole` / `accessibilityLabel` / `accessibilityState` を必ず設定する**。
7. **`testID` を prop で受け取れるようにする**（Maestro の E2E 用）。

### テストの書き方（RN の render テストは書けない）

`vitest.config.ts` は `environment: "node"` / `include: ["src/**/*.test.ts"]`（`.tsx` は対象外）で、
`resolve.alias` が `react-native` を最小スタブ（`src/test/mocks/react-native.ts`）に差し替えている。
そのため**コンポーネントをレンダリングするテストは現状書けない**。

代わりに、**判定ロジックを `react-native` を値として import しない純粋関数に切り出して `.test.ts` でテストする**
（`src/lib/hitSlop.ts` / `src/lib/toPercent.ts` / `src/theme/tokens.ts` の `resolveTheme` がこの形）。
`docs/architecture-guideline.md` の「UIとロジックの分離」方針と同じ考え方。

