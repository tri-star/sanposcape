import { useEffect, useState, type ReactNode } from "react";
import { Modal, Pressable, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { resolveBottomSheetAppearance } from "@/components/ui/bottom-sheet/bottomSheetStyles";
import { resolveSnapTarget, toAbsoluteSnapPoints } from "@/components/ui/bottom-sheet/snapPoints";

export type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** 画面高に対する比率。既定 [0.5, 0.9] */
  snapPoints?: number[];
  /** 背面タップで閉じるか。既定 true */
  dismissOnBackdropPress?: boolean;
  title?: string;
  testID?: string;
};

const DEFAULT_SNAP_POINTS = [0.5, 0.9];

/**
 * `@gorhom/bottom-sheet` は追加せず、導入済みの `react-native-gesture-handler` +
 * `react-native-reanimated` で自前実装する(決定事項。ADR-005 参照)。
 *
 * RN の `Modal`(transparent, animationType="none")の内側に配置することで、
 * Android の戻るボタン(`onRequestClose`)を無料で得る。開閉アニメーションと
 * ドラッグ操作は Reanimated の共有値で駆動し、スナップ判定は `snapPoints.ts` の
 * 純粋関数(`resolveSnapTarget`)に委ねる。
 */
export function BottomSheet({
  visible,
  onClose,
  children,
  snapPoints = DEFAULT_SNAP_POINTS,
  dismissOnBackdropPress = true,
  title,
  testID,
}: BottomSheetProps) {
  const { theme } = useUnistyles();
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const appearance = resolveBottomSheetAppearance(theme);

  const snapPointsPx = toAbsoluteSnapPoints(snapPoints, screenHeight);
  const containerHeightPx = snapPointsPx[snapPointsPx.length - 1] as number;
  const initialSnapPx = snapPointsPx[0] as number;
  const dismissThresholdPx = (snapPointsPx[0] as number) * 0.5;
  const motionDuration = theme.motion.spring.durationMs;
  const motionEasing = Easing.bezier(...theme.motion.spring.bezier);

  // Modal は「閉じるアニメーションが終わるまで」マウントし続ける必要があるため、
  // `visible` prop とは別に内部状態として保持する。
  const [mounted, setMounted] = useState(visible);
  const visibleHeight = useSharedValue(0);
  const dragStartHeight = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      visibleHeight.value = withTiming(initialSnapPx, {
        duration: motionDuration,
        easing: motionEasing,
      });
    } else {
      visibleHeight.value = withTiming(
        0,
        { duration: motionDuration, easing: motionEasing },
        (finished) => {
          if (finished) {
            runOnJS(setMounted)(false);
          }
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialSnapPx, motionDuration]);

  // Hooks は早期 return より前で全て呼び出す(Rules of Hooks)。
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: containerHeightPx - visibleHeight.value }],
  }));

  if (!mounted) {
    return null;
  }

  function handlePanEnd(currentY: number, velocityY: number) {
    const target = resolveSnapTarget(currentY, velocityY, snapPointsPx, dismissThresholdPx);
    if (target.type === "dismiss") {
      onClose();
      return;
    }
    visibleHeight.value = withTiming(target.y, { duration: motionDuration, easing: motionEasing });
  }

  const pan = Gesture.Pan()
    .onStart(() => {
      dragStartHeight.value = visibleHeight.value;
    })
    .onUpdate((event) => {
      const next = dragStartHeight.value - event.translationY;
      visibleHeight.value = Math.max(0, Math.min(next, containerHeightPx));
    })
    .onEnd((event) => {
      runOnJS(handlePanEnd)(visibleHeight.value, event.velocityY);
    });

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={{ flex: 1 }}>
        {/* 背面(スクリム)。シートとは兄弟要素にして、シート本体へのタップが背面へ伝播しないようにする */}
        <Pressable
          accessibilityLabel="閉じる"
          accessibilityRole="button"
          onPress={dismissOnBackdropPress ? onClose : undefined}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: appearance.overlayColor,
          }}
        />
        <Animated.View
          style={[
            {
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: containerHeightPx,
              backgroundColor: appearance.backgroundColor,
              borderTopLeftRadius: appearance.borderRadius,
              borderTopRightRadius: appearance.borderRadius,
              boxShadow: appearance.boxShadow,
              paddingBottom: insets.bottom,
            },
            sheetStyle,
          ]}
        >
          <GestureDetector gesture={pan}>
            <View style={{ alignItems: "center", paddingVertical: theme.spacing[12] }}>
              <View
                style={{
                  width: 40,
                  height: 4,
                  borderRadius: theme.radius.pill,
                  backgroundColor: appearance.handleColor,
                }}
              />
            </View>
          </GestureDetector>
          {title ? (
            <Text
              style={{
                color: theme.colors.text,
                paddingHorizontal: theme.spacing[16],
                paddingBottom: theme.spacing[12],
                fontFamily: theme.fontFamily.heading,
                ...theme.typography.headingSm,
              }}
            >
              {title}
            </Text>
          ) : null}
          <View style={{ flex: 1, paddingHorizontal: theme.spacing[16] }}>{children}</View>
        </Animated.View>
      </View>
    </Modal>
  );
}
