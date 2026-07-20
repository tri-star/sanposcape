# Claude Design — コンポーネント視覚仕様(移植用リファレンス)

出典: Claude Design プロジェクト `ea6ab024-4c09-45b2-94f5-0a6a0315a88d`「Sanpo Design System」
`components/**/*.jsx` の実装から、**React Native への移植に必要な視覚仕様だけを抽出**したもの。

## この文書の位置づけ

- **これは DS の生ソースではなく蒸留版**。Web 固有の関心事(`hover` の状態管理、`<label>`/`<input>` の組み立て、
  `appearance: none` 等)は落とし、色・寸法・角丸・影・タイポグラフィ・アイコン名だけを残している。
- `design/tokens/*.css` と違い **drift check の対象外**。DS が更新されたら手動で追随すること。
- 値は全て DS のトークン名で書いてある。実装では `src/theme/tokens.ts` のセマンティック名に読み替える。
- **迷ったらこの表が正**。ここに無い寸法を発明する前に、DS を再確認すること
  (`DesignSync` の `get_file` で `components/<group>/<Name>.jsx` を読める)。

---

## core

### Button

| 項目 | 値 |
| --- | --- |
| 角丸 | `radius-pill`(既定) / `radius-md`(`shape="md"` 指定時) |
| 高さ | sm `control-sm` / md `control-md` / lg `control-lg` |
| 水平パディング | sm **16** / md **22** / lg **28** |
| フォント | `font-label`、`weight-bold`、サイズ sm `text-sm` / md `text-md` / lg `text-lg` |
| アイコンサイズ | sm **16** / md **18** / lg **20**、ラベルとの間隔 **8** |
| 押下 | `scale(0.97)` |
| 影 | **`primary` かつ非 disabled のときのみ `shadow-sm`**。他 variant は影なし |
| disabled | 背景 `ink-200` / 文字 `text-disabled` |

variant は**5種**:

| variant | 背景 | 文字 | 枠線 | hover | press |
| --- | --- | --- | --- | --- | --- |
| `primary` | `primary` | `on-primary` | なし | `primary-hover` | `primary-press` |
| `secondary` | `primary-tint` | `primary` | なし | `blue-200` | `blue-300` |
| `outline` | 透明 | `text-primary` | **1.5px `border-strong`** | `surface-sunken` | `ink-100` |
| `ghost` | 透明 | `primary` | なし | `primary-tint` | `blue-200` |
| `danger` | `danger` | `#fff` | なし | `red-600` | `red-600` |

> **押下は必ず「暗くする」方向**。淡色に反転させない(readme の hover/press 原則)。

### IconButton

| 項目 | 値 |
| --- | --- |
| サイズ(正方) | sm **32** / md **44** / lg **54** |
| アイコン | sm **16** / md **20** / lg **22** |
| 角丸 | `radius-pill` |
| 影 | `surface` variant のみ `shadow-sm` |
| `active` 時 | 背景 `primary` / アイコン `on-primary` |
| disabled | アイコン `text-disabled` |

| variant | 背景 | アイコン |
| --- | --- | --- |
| `filled` | `primary` | `on-primary` |
| `tinted` | `primary-tint` | `primary` |
| `surface`(既定) | `surface-card` | `text-primary` |
| `ghost` | 透明 | `text-secondary` |

### Icon

Lucide。`strokeWidth` は既定 2、用途により 2.4(MapPin)/ 3(Checkbox のチェック)。

---

## data

### Card

| 項目 | 値 |
| --- | --- |
| 背景 | `surface-card` |
| 角丸 | `radius-lg` |
| パディング | `space-4`(16) |
| elevated(既定) | `shadow-sm`、**枠線なし** |
| **非 elevated** | **影なし + 1px `border-subtle` の枠線** |

> 非 elevated で枠線を落とすと `surface-app` と同化して境界が消える。

### Avatar

| 項目 | 値 |
| --- | --- |
| サイズ | sm **32** / md **44** / lg **64** |
| 形 | 円 |
| 背景(画像なし) | `primary-tint` |
| 文字色 | `primary`、`font-label`、`weight-bold` |
| 文字サイズ | **サイズ × 0.4** |
| フォールバック | `name` の頭1文字。無ければアイコン `user`(サイズ × 0.5) |

### StatBlock

| 項目 | 値 |
| --- | --- |
| 数値 | `font-data`、`weight-heavy`、`tracking-tight`、**tabular-nums 必須**、`text-primary` |
| 数値サイズ | md **`text-4xl`** / sm **`text-2xl`** |
| 単位 | `font-data`、`text-sm`、**`weight-medium`**、`text-secondary`、数値との間隔 3、ベースライン揃え |
| ラベル | `font-body`、`text-xs`、`text-tertiary` |

### ProgressBar

| 項目 | 値 |
| --- | --- |
| トラック高さ | **10**(単一値。4px グリッドに乗らない) |
| トラック色 | **`ink-100`** |
| 角丸 | `radius-pill`(トラック・フィルとも) |
| フィル色 | `primary`(既定) / `accent` / `success` |
| ラベル行 | `text-xs`、`text-secondary`。左にラベル、右にパーセント。トラックとの間隔 6 |

---

## feedback

### Badge

| 項目 | 値 |
| --- | --- |
| パディング | 5px 12px |
| 角丸 | `radius-pill` |
| フォント | `font-label`、`text-xs`、`weight-bold`、`tracking-wide` |
| ドット | 6px 円、`currentColor`、文字との間隔 6 |

| tone | 背景 | 文字 |
| --- | --- | --- |
| `info`(既定) | `info-tint` | `info` |
| `success` | `success-tint` | `success` |
| `warning` | `warning-tint` | `warning` |
| `danger` | `danger-tint` | `danger` |
| `neutral` | `ink-100` | `text-secondary` |

### Tag

| 項目 | 値 |
| --- | --- |
| パディング | 8px 14px |
| 角丸 | `radius-pill` |
| 枠線 | **常に 1.5px** |
| フォント | `font-label`、`text-sm`、`weight-medium`、アイコンとの間隔 6 |
| アイコンサイズ | 14 |

| 状態 | 背景 | 文字 | 枠線 | アイコン |
| --- | --- | --- | --- | --- |
| **非選択** | **`surface-card`** | **`text-primary`** | **`border-subtle`** | カテゴリ色 |
| 選択 | カテゴリ色 | `#fff` | 透明 | `#fff` |

カテゴリ: `park`=`map-park` / `cafe`=`map-cafe` / `culture`=`map-culture` / `station`=`map-station` / `neutral`=`text-secondary`

> 非選択に tint 背景は**使わない**。白 + 枠線が DS の答え。

### Toast

| 項目 | 値 |
| --- | --- |
| パディング | 12px 18px |
| 角丸 | `radius-pill` |
| 影 | `shadow-lg` |
| フォント | `font-body`、`text-sm`、`weight-medium`、アイコンとの間隔 10 |
| アイコンサイズ | 17 |
| 出現 | opacity 0→1 + translateY 8→0、`dur-base` / `ease-out` |

| tone | 背景 | 文字/アイコン | アイコン名 |
| --- | --- | --- | --- |
| `default` | `surface-inverse` | `surface-card` | `info` |
| `success` | `success` | `#fff` | `check-circle-2` |
| `danger` | `danger` | `#fff` | `alert-circle` |

---

## forms

共通: ラベルは `font-label` / `text-sm` / `weight-medium` / `text-secondary`、コントロールとの間隔 6。
チェック系のラベルは `font-body` / `text-md` / `text-primary`、コントロールとの間隔 10。disabled は opacity 0.5。

### Input

| 項目 | 値 |
| --- | --- |
| 高さ | sm `control-sm` / md `control-md` |
| 水平パディング | 14 |
| 角丸 | `radius-md` |
| 背景 | `surface-card`(disabled は `ink-100`) |
| **枠線幅** | **常に 1.5px 固定**(状態で変えない — 変えるとレイアウトが揺れる) |
| 枠線色 | error `danger` > focused `border-focus` > 通常 `border-subtle` |
| 入力文字 | `font-body`、`text-md`、`text-primary` |
| helper / error | `text-xs`、error は `danger`、通常は `text-tertiary` |
| 先頭アイコン | `text-tertiary`、入力との間隔 8 |

### Select

`Input` のフィールドと同一。加えて:

| 項目 | 値 |
| --- | --- |
| 右パディング | 40(シェブロン用) |
| シェブロン | `chevron-down` 16、右から 14、垂直中央、`text-tertiary` |

> Web は native dropdown。**モバイルでは BottomSheet ベースに作り替える**(承認済み方針)。
> ただしフィールド部分の見た目は上記どおり Input に揃える。

### Switch

| 項目 | 値 |
| --- | --- |
| トラック | **44 × 26**(単一サイズ。**DS にサイズバリアントは無い**) |
| トラック角丸 | `radius-pill` |
| トラック色 | on `primary` / off `ink-200` |
| ノブ | **20 × 20** 円、`#fff`、`shadow-xs` |
| ノブ位置 | 上 **3**、左 off **3** → on **21** |
| モーション | 背景 `dur-base`/`ease-out`、位置 `dur-base`/**`ease-spring`** |

### Checkbox

| 項目 | 値 |
| --- | --- |
| ボックス | **22 × 22** |
| 角丸 | `radius-xs` |
| 非選択 | 背景 `surface-card` + **1.5px `border-strong`** |
| 選択 | 背景 `primary`、**枠線なし** |
| チェック | アイコン `check`、サイズ **14**、`on-primary`、`strokeWidth` **3** |

### Radio

| 項目 | 値 |
| --- | --- |
| ボックス | **22 × 22** 円 |
| 非選択 | **1.5px `border-strong`** + 背景 `surface-card` |
| **選択** | **6px solid `primary` の枠線**(太い枠線が中央のドットを作る)+ 背景 `surface-card` |

> 選択状態は「細い枠の色を変える」ではなく **枠線を 6px に太らせる**。`box-sizing: border-box` 相当。

---

## overlays

### Dialog

| 項目 | 値 |
| --- | --- |
| スクリム | `rgba(27, 36, 48, 0.45)` |
| パネル幅 | 320(最大 88%) |
| 背景 / 角丸 / 影 | `surface-card` / `radius-xl` / `shadow-lg` |
| パディング | 24、要素間 14 |
| タイトル | `text-xl`、`font-heading`、`text-primary` |
| 閉じるアイコン | `x` 20、`text-tertiary` |
| 本文 | `text-md`、`text-secondary`、`leading-normal` |
| アクション行 | 間隔 10、上マージン 6 |

### BottomSheet

| 項目 | 値 |
| --- | --- |
| 背景 / 影 | `surface-card` / `shadow-sheet` |
| 角丸 | `radius-xl`(**上2角のみ**) |
| パディング | 上 10 / 左右 20 / 下 24 |
| ハンドル | **36 × 5**、`radius-pill`、`ink-200`、中央、下マージン 14 |
| タイトル | `text-lg`、`font-heading`、`text-primary`、下マージン 12 |
| モーション | transform `dur-slow` / **`ease-spring`** |

---

## map

### MapPin

| 項目 | 値 |
| --- | --- |
| サイズ | 既定 40 |
| 形 | 雫型(角丸 50%/50%/50%/0 を -45° 回転)。RN では SVG で描く |
| 枠線 | **2.5px `surface-card`** |
| 影 | `shadow-pin` |
| アイコン | **サイズ × 0.42**、`#fff`、`strokeWidth` **2.4**(雫の回転を打ち消して正立させる) |

| カテゴリ | 色 | アイコン名 |
| --- | --- | --- |
| `park` | `map-park` | **`tree-pine`** |
| `cafe` | `map-cafe` | `coffee` |
| `culture` | `map-culture` | **`book-open`** |
| `station` | `map-station` | **`train-front`** |
| `goal` | `map-station` | `flag` |
| `current` | `map-route` | `navigation` |

ラベル(任意): 上マージン 4、パディング 3px 8px、`radius-sm`、背景 `surface-card`、
文字はカテゴリ色、`text-2xs`、`weight-bold`、`font-label`、`shadow-xs`。

---

## 移植しないもの

| コンポーネント | 理由 |
| --- | --- |
| `Tooltip` | モバイルに hover が無い |
| `TabBar` | `expo-router` の `Tabs` に委譲 |
| `Tabs` | 画面内セグメント。必要になった機能の `features/` 側に置く |
