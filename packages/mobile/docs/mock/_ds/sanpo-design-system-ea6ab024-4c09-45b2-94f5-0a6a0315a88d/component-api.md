# Sanpo デザインシステム — コンポーネントAPI早見表

`.dc.html` で使われている UI プリミティブ（namespace `SanpoDesignSystem_ea6ab0`）の
受け付けProps一覧。元プロジェクトの adherence リンタ設定（`_adherence.oxlintrc.json`）から
抽出したもの。実装時にProps名・列挙値の齟齬を防ぐ用途で使う。

> 表記: `prop(a|b|c)` は列挙値、太字は必須寄りの主要Prop。すべてのコンポーネントは `style` を受ける。

## core

| コンポーネント | Props |
| --- | --- |
| `Icon` | `name`, `size`, `strokeWidth`, `color`, `className`, `style` |
| `Button` | `children`, `variant`, `size`, `icon`, `iconPosition(left\|right)`, `fullWidth`, `disabled`, `shape(pill\|rounded)`, `onClick`, `style` |
| `IconButton` | `icon`, `label`, `variant`, `size(sm\|md\|lg)`, `active`, `disabled`, `onClick`, `style` |

`.dc.html` で確認できた値:
- `Button.variant`: `primary` / `secondary` / `outline` / `danger`
- `IconButton.variant`: `tinted` / `ghost` / `surface`
- アイコン名は [Lucide](https://lucide.dev) の名前（例: `crosshair`, `footprints`, `chevron-left`, `settings-2`, `flag`, `square`, `map-pin`, `search`, `x`, `x-circle`, `trash-2`, `image-plus`, `sliders-horizontal`）

## data

| コンポーネント | Props |
| --- | --- |
| `Card` | `children`, `padding`, `elevated`, `style` |
| `Avatar` | `src`, `name`, `size(sm\|md\|lg)`, `style` |
| `StatBlock` | `value`, `unit`, `label`, `align(center\|left)`, `size(md\|sm)`, `style` |
| `ProgressBar` | `value`, `max`, `tone(primary\|accent\|success)`, `label`, `style` |

## feedback

| コンポーネント | Props |
| --- | --- |
| `Badge` | `children`, `tone`, `dot`, `style` |
| `Tag` | `children`, `icon`, `category`, `selected`, `onClick`, `style` |
| `Toast` | `message`, `tone`, `visible`, `style` |
| `Tooltip` | `children`, `label`, `position(top\|bottom\|left\|right)` |

`.dc.html` で確認できた値: `Badge.tone` に `success` など。`Tag.category` に `neutral` など。

## forms

| コンポーネント | Props |
| --- | --- |
| `Input` | `label`, `placeholder`, `helper`, `error`, `icon`, `size(sm\|md)`, `disabled`, `value`, `onChange`, `style` |
| `Select` | `SelectOption` を子に持つ（`SelectOption`: `label`, `value`） |
| `Checkbox` | `label`, `checked`, `onChange`, `disabled`, `style` |
| `Radio` | `label`, `checked`, `name`, `onChange`, `disabled`, `style` |
| `Switch` | `checked`, `label`, `onChange`, `disabled`, `style` |

## navigation

| コンポーネント | Props |
| --- | --- |
| `Tabs` | `value`, `onChange`, `items`（`TabItem`: `label`, `value`） |
| `TabBar` | `value`, `onChange`, `items`（`TabBarItem`: `label`, `value`, `icon`） |

## overlays

| コンポーネント | Props |
| --- | --- |
| `Dialog` | `open`, `title`, `children`, `onClose`, `actions`, `style` |
| `BottomSheet` | `open`, `title`, `children`, `onClose`, `style` |

## map

| コンポーネント | Props |
| --- | --- |
| `MapPin` | `category`, `label`, `icon`, `size`, `style` |

`MapPin.category`: `park` / `cafe` / `culture` / `station` / `goal`
（トークン `--map-park` `--map-cafe` `--map-culture` `--map-station` に対応）

## 実装上の原則（adherence リンタが強制していた内容）

- 生の16進カラーや `px` 値を直書きせず、必ずデザイントークン（`var(--...)`）を使う。
- フォントは `Noto Sans` / `Noto Sans JP`（UI全般）、`M PLUS Rounded 1c`（ロゴ/ワードマークのみ）に限定。
- コンポーネントは `index` 経由で import し、内部実装を直接参照しない。
