import type { SanpoMapIcon } from "@/api/generated/model";
import type { IconName } from "@/components/ui/icon/iconRegistry";
import type { MapPinCategory } from "@/components/ui/map-pin/MapPin";
import type { PinSummary, RegisteredPin, SanpoMap } from "@/features/pin/types";

/**
 * 地図のアイコンの定義と解決（SS-171 / SS-172。ADR-M-019）。
 * 純粋関数のみ。import はすべて型のみ（値 import すると vitest で lucide → react-native-svg に届いて落ちる）。
 */

/** 画面で扱う地図アイコンの値（= backend の enum）。 */
export type SanpoMapIconKey = SanpoMapIcon;
export type SanpoMapIconTone = Exclude<MapPinCategory, "goal" | "current">;
export type SanpoMapIconMeta = { glyph: IconName; tone: SanpoMapIconTone; label: string };

export const DEFAULT_SANPO_MAP_ICON: SanpoMapIconKey = "pin";

/**
 * Record のキーを生成型にすることで、backend が値を足したのに mobile の対応表が無い状態を
 * typecheck で検出する（Orval の再生成で気づける）。色は MapPin の既存カテゴリ色に限る。
 */
export const SANPO_MAP_ICON_META: Record<SanpoMapIconKey, SanpoMapIconMeta> = {
  pin: { glyph: "map-pin", tone: "park", label: "ピン" },
  tree: { glyph: "tree-pine", tone: "park", label: "公園・緑" },
  flower: { glyph: "flower-2", tone: "park", label: "花" },
  coffee: { glyph: "coffee", tone: "cafe", label: "カフェ" },
  food: { glyph: "utensils", tone: "cafe", label: "ごはん" },
  bakery: { glyph: "croissant", tone: "cafe", label: "パン" },
  landmark: { glyph: "landmark", tone: "culture", label: "名所・史跡" },
  camera: { glyph: "camera", tone: "culture", label: "撮影スポット" },
  book: { glyph: "book-open", tone: "culture", label: "本・学び" },
  heart: { glyph: "heart", tone: "station", label: "お気に入り" },
  shopping: { glyph: "shopping-bag", tone: "station", label: "買い物" },
  dog: { glyph: "dog", tone: "station", label: "犬の散歩" },
};

/** ピッカーの表示順（色ごとに3つずつ、6列 × 2行）。 */
export const SANPO_MAP_ICON_ORDER: readonly SanpoMapIconKey[] = [
  "pin",
  "tree",
  "flower",
  "coffee",
  "food",
  "bakery",
  "landmark",
  "camera",
  "book",
  "heart",
  "shopping",
  "dog",
];

export function isSanpoMapIconKey(value: unknown): value is SanpoMapIconKey {
  return typeof value === "string" && Object.hasOwn(SANPO_MAP_ICON_META, value);
}

/** API の値を検証して返す。undefined（古い backend）・null・未知の値（新しい backend）は既定の pin。 */
export function toSanpoMapIconKey(value: unknown): SanpoMapIconKey {
  return isSanpoMapIconKey(value) ? value : DEFAULT_SANPO_MAP_ICON;
}

/** MapPin に spread する見た目。 */
export function sanpoMapPinAppearance(key: SanpoMapIconKey): {
  category: MapPinCategory;
  icon: IconName;
} {
  const meta = SANPO_MAP_ICON_META[key];
  return { category: meta.tone, icon: meta.glyph };
}

/** 地図一覧から地図のアイコンを引く。一覧に無い（未取得・削除済み）なら既定の pin。 */
export function sanpoMapIconFor(
  maps: readonly Pick<SanpoMap, "id" | "icon">[],
  sanpoMapId: string,
): SanpoMapIconKey {
  return maps.find((map) => map.id === sanpoMapId)?.icon ?? DEFAULT_SANPO_MAP_ICON;
}

/**
 * 地図ごとに取得した登録済みピンに、そのピンの地図のアイコンを付ける（順序は保つ）。
 * 一覧を Map(id → icon) にしてから引く（ピン数 × 地図数のループにしない）。
 */
export function attachSanpoMapIcons(
  pins: readonly PinSummary[],
  maps: readonly Pick<SanpoMap, "id" | "icon">[],
): RegisteredPin[] {
  const iconById = new Map<string, SanpoMapIconKey>(maps.map((map) => [map.id, map.icon]));
  return pins.map((pin) => ({
    ...pin,
    sanpoMapIcon: iconById.get(pin.sanpoMapId) ?? DEFAULT_SANPO_MAP_ICON,
  }));
}
