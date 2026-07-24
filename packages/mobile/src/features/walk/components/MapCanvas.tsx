import type { ReactNode } from "react";
import { Pressable, type StyleProp, View, type ViewStyle } from "react-native";

import type { IconName } from "@/components/ui/icon/Icon";
import { MapPin, type MapPinCategory } from "@/components/ui/map-pin/MapPin";
import { hitSlopFor } from "@/lib/hitSlop";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";
import { withAlpha } from "@/theme/withAlpha";

/** ピンの見た目サイズが 44px 未満でもタップ領域を確保するための既定サイズ。 */
const DEFAULT_PIN_TAP_SIZE = 40;

export type MapCanvasPin = {
  id: string;
  category: MapPinCategory;
  icon?: IconName;
  /** ピン下に表示する視覚ラベル（mock通り、スポット選択ピンなどでは省略する）。 */
  label?: string;
  /**
   * スクリーンリーダー用のラベル。`label`（視覚表示）とは独立して指定できる
   * （例: ピン下にテキストを出さない意匠を保ちつつ、読み上げではスポット名を伝える）。
   * 省略時は `label` にフォールバックする。
   */
  accessibilityLabel?: string;
  /** 相対位置（%）。 */
  x: number;
  y: number;
  size?: number;
  /** 重なり順。選択中のピンなどを手前に出すために使う。 */
  zIndex?: number;
  onPress?: () => void;
};

export type MapCanvasProps = {
  pins?: readonly MapCanvasPin[];
  /** 現在地ドットを表示するか。 */
  showCurrent?: boolean;
  height?: number;
  style?: StyleProp<ViewStyle>;
  /** 地図の上に重ねる追加コンテンツ（ツールボタンなど）。 */
  children?: ReactNode;
  testID?: string;
};

/**
 * MapCanvas — 装飾的な地図プレースホルダ（実地図・GPSは非スコープ）。
 * mock の道路グリッド・緑地・水域・現在地・スポットピンの見た目を静的に再現する。
 * デザイン: mock `isStart` / `isMain` の MAP ブロック。
 */
export function MapCanvas({
  pins = [],
  showCurrent = true,
  height = 296,
  style,
  children,
  testID,
}: MapCanvasProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <View
      testID={testID}
      style={[styles.root, { height, backgroundColor: theme.map.canvas }, style]}
    >
      <View style={styles.roadGridRow}>
        {Array.from({ length: 6 }).map((_, index) => (
          <View
            key={`road-h-${index}`}
            style={[
              styles.roadLineHorizontal,
              { top: `${(index + 1) * 16}%`, backgroundColor: theme.map.road },
            ]}
          />
        ))}
        {Array.from({ length: 7 }).map((_, index) => (
          <View
            key={`road-v-${index}`}
            style={[
              styles.roadLineVertical,
              { left: `${(index + 1) * 13}%`, backgroundColor: theme.map.road },
            ]}
          />
        ))}
      </View>
      <View style={[styles.greenspace, { backgroundColor: theme.map.greenspace }]} />
      <View style={[styles.water, { backgroundColor: theme.map.water }]} />

      {showCurrent ? (
        <View style={styles.currentWrap}>
          <View
            style={[styles.currentHalo, { backgroundColor: withAlpha(theme.colors.primary, 0.22) }]}
          >
            <View
              style={[
                styles.currentDot,
                { backgroundColor: theme.colors.primary, borderColor: theme.colors.surfaceCard },
              ]}
            />
          </View>
        </View>
      ) : null}

      {pins.map((pin) => {
        const pinStyle = [
          styles.pinWrap,
          { left: `${pin.x}%` as const, top: `${pin.y}%` as const, zIndex: pin.zIndex ?? 10 },
        ];
        const content = (
          <MapPin category={pin.category} icon={pin.icon} label={pin.label} size={pin.size} />
        );
        if (!pin.onPress) {
          return (
            <View key={pin.id} style={pinStyle}>
              {content}
            </View>
          );
        }
        return (
          <Pressable
            key={pin.id}
            accessibilityRole="button"
            accessibilityLabel={pin.accessibilityLabel ?? pin.label}
            onPress={pin.onPress}
            hitSlop={hitSlopFor(pin.size ?? DEFAULT_PIN_TAP_SIZE)}
            style={pinStyle}
          >
            {content}
          </Pressable>
        );
      })}

      {children}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  root: {
    position: "relative",
    width: "100%",
    overflow: "hidden",
  },
  roadGridRow: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    opacity: 0.8,
  },
  roadLineHorizontal: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
  },
  roadLineVertical: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
  },
  greenspace: {
    position: "absolute",
    left: 0,
    top: 0,
    width: "36%",
    height: "42%",
    borderBottomRightRadius: 999,
  },
  water: {
    position: "absolute",
    left: "-8%",
    bottom: "-12%",
    width: "44%",
    height: "56%",
    borderRadius: 999,
  },
  currentWrap: {
    position: "absolute",
    left: "50%",
    top: "55%",
    marginLeft: -13,
    marginTop: -13,
  },
  currentHalo: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  currentDot: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2.5,
  },
  pinWrap: {
    position: "absolute",
    transform: [{ translateX: -17 }, { translateY: -40 }],
  },
}));
