import { useRef } from "react";
import { View } from "react-native";
import MapView, { Marker } from "react-native-maps";

import { IconButton } from "@/components/ui/icon-button/IconButton";
import { mapPinMarkerPlacement } from "@/components/ui/map-pin/mapPinGeometry";
import { SanpoMapPin } from "@/features/pin/components/SanpoMapPin";
import {
  pinLocationMapKey,
  pinLocationPreviewRegion,
  resolvePinLocationPreviewConfig,
  type PinLocationPreviewVariant,
} from "@/features/pin/lib/pinLocationPreview";
import { DEFAULT_SANPO_MAP_ICON } from "@/features/pin/lib/sanpoMapIcon";
import type { SanpoMapIconKey } from "@/features/pin/types";
import { makeStyles } from "@/theme/makeStyles";
import type { GeoCoordinates } from "@/services/location/types";

const PREVIEW_HEIGHT = 140;
const PREVIEW_PIN_SIZE = 34;
/** 「ピンの位置に戻す」のアニメーション時間（PinMapCanvas の FOCUS_ANIMATION_MS と同じ）。 */
const RECENTER_ANIMATION_MS = 400;
const INTERACTIVE_HINT = "ドラッグで移動、2本指で拡大・縮小できます";

export type PinLocationPreviewProps = {
  location: GeoCoordinates;
  /**
   * true のあいだは MapView を外し、同じ大きさの枠だけを残す。
   * Android ではネイティブの地図サーフェスどうしの重なり順が RN の View の順序に従わず、
   * 上に重ねた全画面地図（`PinLocationAdjustOverlay`）をこのプレビューが突き抜けて描画されるため（SS-124）。
   */
  mapHidden?: boolean;
  /** 読み上げラベルの上書き（既定「ピンを置く位置の地図」。詳細画面は「ピンの位置の地図」を渡す。SS-118）。 */
  accessibilityLabel?: string;
  /** ピンの見た目（保存先・所属の地図のアイコン）。既定は pin。 */
  markerIcon?: SanpoMapIconKey;
  /**
   * compact（既定）= 登録フォーム。高さ 140 の横長・操作不可・左右の余白を自分で持つ。
   * interactive = ピン詳細（SS-149）。幅に合わせた正方形・ドラッグとピンチで操作可・「ピンの位置に戻す」ボタン付き。
   *   左右の余白は親（PinDetailView の本文の paddingHorizontal）が持つ前提で、自分では持たない。
   */
  variant?: PinLocationPreviewVariant;
  testID?: string;
};

/**
 * PinLocationPreview — ピンの位置の地図。
 * compact は登録フォームの操作不可のプレビュー（調整は PinLocationField の「位置を調整」から）。
 * interactive はピン詳細の操作できる地図（SS-149）。
 *
 * interactive の ScrollView との干渉は、ライブラリと OS の既定の挙動で防ぐ（JS で scrollEnabled は切り替えない）。
 * Android は react-native-maps が地図のタッチダウンで親の intercept を止める（移動が有効なときのみ）。
 * iOS は MapKit のジェスチャーが先に認識され、外側の ScrollView は動かない。
 */
export function PinLocationPreview({
  location,
  mapHidden = false,
  accessibilityLabel = "ピンを置く位置の地図",
  markerIcon = DEFAULT_SANPO_MAP_ICON,
  variant = "compact",
  testID,
}: PinLocationPreviewProps) {
  const styles = useStyles();
  const mapRef = useRef<MapView>(null);
  const config = resolvePinLocationPreviewConfig(variant);
  const region = pinLocationPreviewRegion(location, variant);
  const isInitialMode = config.regionMode === "initial";

  return (
    <View style={[styles.frame, config.shape === "square" ? styles.frameSquare : styles.frameWide]}>
      {/* accessible な View の子は iOS で個別に操作できないので、「戻す」ボタンは兄弟に置く。 */}
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={config.panEnabled ? INTERACTIVE_HINT : undefined}
        style={styles.fill}
      >
        {mapHidden ? null : (
          <MapView
            key={isInitialMode ? pinLocationMapKey(location) : undefined}
            ref={mapRef}
            testID={testID}
            style={styles.fill}
            // initialRegion と region は同時に渡さない（region が勝って操作が戻る）。
            {...(isInitialMode ? { initialRegion: region } : { region })}
            scrollEnabled={config.panEnabled}
            zoomEnabled={config.zoomEnabled}
            rotateEnabled={false}
            pitchEnabled={false}
            toolbarEnabled={false}
            showsUserLocation={false}
            moveOnMarkerPress={false}
          >
            <Marker
              // tracksViewChanges={false} では子の変化が反映されないので、アイコンが変わったら作り直す。
              key={markerIcon}
              coordinate={location}
              tracksViewChanges={false}
              {...mapPinMarkerPlacement(PREVIEW_PIN_SIZE)}
            >
              <SanpoMapPin icon={markerIcon} size={PREVIEW_PIN_SIZE} />
            </Marker>
          </MapView>
        )}
      </View>
      {config.showRecenter && !mapHidden ? (
        <View pointerEvents="box-none" style={styles.tools}>
          <IconButton
            icon="map-pin"
            label="ピンの位置に戻す"
            variant="surface"
            size="sm"
            onPress={() => mapRef.current?.animateToRegion(region, RECENTER_ANIMATION_MS)}
            testID={testID !== undefined ? `${testID}-recenter` : undefined}
          />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  frame: {
    borderRadius: theme.radius.lg,
    borderWidth: theme.layout.hairline,
    borderColor: theme.colors.borderSubtle,
    overflow: "hidden",
  },
  frameWide: {
    height: PREVIEW_HEIGHT,
    // 登録フォームの本文は左右の余白を持たないので、自分で持つ。
    marginHorizontal: theme.layout.pageGutter,
  },
  frameSquare: {
    width: "100%",
    // 親の幅（PinDetailView の本文 = 画面幅 − pageGutter×2）に合わせた正方形。
    aspectRatio: 1,
  },
  fill: {
    flex: 1,
  },
  tools: {
    position: "absolute",
    top: theme.spacing[2],
    right: theme.spacing[2],
  },
}));
