import type { ReactNode } from "react";
import { useMemo } from "react";
import { scheduleOnUI } from "react-native-worklets";
import type { LayoutChangeEvent } from "react-native";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";

import {
  PHOTO_ZOOM_IDENTITY,
  applyPanChange,
  applyPinchChange,
  reclampPhotoZoomForFrame,
  resolvePhotoZoomLayout,
  type ZoomSize,
  type PhotoZoomState,
} from "@/features/pin/lib/photoZoom";
import { makeStyles } from "@/theme/makeStyles";

export type PinPhotoZoomViewProps = {
  /** 写真の実寸（`PinPhoto.width` / `height`）。contain で収めた見た目の大きさと移動範囲を決める。 */
  contentWidth: number;
  contentHeight: number;
  children: ReactNode;
  testID?: string;
};

/**
 * PinPhotoZoomView — 子をピンチで拡大・縮小し、拡大中はドラッグで動かす枠（SS-153）。
 *
 * 倍率・移動量は UI スレッドの shared value にだけ持ち、React の state・親への通知は持たない。
 * リセットは呼び出し側の `key` で行う（写真が変わったら作り直す＝倍率1に戻る）。
 *
 * - ジェスチャーは変形しない外側の View に付け、内側の Animated.View だけを変形する
 *   （focalX/Y を枠の座標としてそのまま使うため）。
 * - 枠は overflow: hidden。拡大した写真が上下のバーに重ならない。
 * - 計算は `photoZoom.ts` の worklet 純粋関数。React Compiler 有効のため shared value は
 *   `.get()` / `.set()` で読み書きし、レンダー中には読まない。
 */
export function PinPhotoZoomView({
  contentWidth,
  contentHeight,
  children,
  testID,
}: PinPhotoZoomViewProps) {
  const styles = useStyles();
  const zoom = useSharedValue<PhotoZoomState>({ ...PHOTO_ZOOM_IDENTITY });
  // 枠の大きさだけを持つ。レイアウト前は null で、ジェスチャーは null の間は何もしない。
  // 写真の実寸（content）は props から worklet 内で都度計算し、onLayout 時点の値で固定しない。
  const frame = useSharedValue<ZoomSize | null>(null);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    // 枠の更新と zoom の再クランプは UI スレッドで1回にまとめる（ジェスチャーの worklet と競合させない）。
    scheduleOnUI(
      (w: number, h: number, cw: number, ch: number) => {
        "worklet";
        const next = { width: w, height: h };
        frame.set(next);
        zoom.set(reclampPhotoZoomForFrame(zoom.get(), { width: cw, height: ch }, next));
      },
      width,
      height,
      contentWidth,
      contentHeight,
    );
  };

  const gesture = useMemo(() => {
    const photo = { width: contentWidth, height: contentHeight };
    const pinch = Gesture.Pinch().onChange((e) => {
      const f = frame.get();
      if (f === null) return;
      zoom.set(
        applyPinchChange(
          zoom.get(),
          { scaleChange: e.scaleChange, focalX: e.focalX, focalY: e.focalY },
          resolvePhotoZoomLayout(photo, f),
        ),
      );
    });
    // averageTouches: Android でも2本指の移動を指の平均で取る（iOS の既定と揃える）。
    const pan = Gesture.Pan()
      .averageTouches(true)
      .onChange((e) => {
        const f = frame.get();
        if (f === null) return;
        zoom.set(
          applyPanChange(
            zoom.get(),
            { changeX: e.changeX, changeY: e.changeY },
            resolvePhotoZoomLayout(photo, f),
          ),
        );
      });
    return Gesture.Simultaneous(pinch, pan);
  }, [contentWidth, contentHeight, frame, zoom]);

  const animatedStyle = useAnimatedStyle(() => {
    const z = zoom.get();
    return {
      transform: [{ translateX: z.translateX }, { translateY: z.translateY }, { scale: z.scale }],
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      {/* collapsable={false}: Android でネイティブ階層から省かれないようにする。 */}
      <View style={styles.frame} onLayout={handleLayout} collapsable={false} testID={testID}>
        <Animated.View style={[styles.fill, animatedStyle]}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}

const useStyles = makeStyles(() => ({
  frame: { width: "100%", height: "100%", overflow: "hidden" },
  fill: { width: "100%", height: "100%" },
}));
