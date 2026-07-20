import { useEffect, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles, StyleSheet } from "react-native-unistyles";
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
 *
 * `useUnistyles()` は Reanimated の `withTiming` に渡す duration/easing
 * (スタイルではなく JS 側のアニメーション設定値)を得るためだけに使う。
 * 静的な見た目(背景色・角丸等)は `StyleSheet.create` 側で解決する。
 *
 * children が固定高を超える場合に備え、本体を `ScrollView` で包む(C-3)。
 * ハンドル部分の `GestureDetector` は ScrollView の外に置き、ドラッグと
 * スクロールジェスチャが競合しないようにする。
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

  // `height`/`paddingBottom` はスナップ位置(`snapPoints` prop × 画面高)と safe area inset
  // という「実行時のレイアウト値」であり、Unistyles のテーマ値ではない。そのため
  // `StyleSheet.create` の動的関数スタイル(`styles.sheet({...})`)にはせず、ここで
  // プレーンなスタイルオブジェクトとして組み立てる。
  //
  // 理由: `Animated.View` は Unistyles v3 の babel プラグインの処理対象外
  // (RN コア以外のサードパーティコンポーネントのため)なので、`styles.xxx({...})` の
  // 呼び出し結果は空オブジェクトに解決され、Reanimated 側で
  // "empty object is not a valid style value" になる。一方この `sheetLayoutStyle` は
  // Unistyles を経由しないただの JS オブジェクトなので、Unistyles の静的スタイル
  // (`styles.sheet`)や Reanimated の `sheetStyle` と並べて配列で渡す分には問題ない
  // (Unistyles 公式「Separate Unistyles and Reanimated styles」に倣った形)。
  const sheetLayoutStyle = { height: containerHeightPx, paddingBottom: insets.bottom };

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
      // iOS: モーダルであることを支援技術に伝える。Android: importantForAccessibility で同等の効果
      // (Dialog と挙動を揃える。C-4)
      accessibilityViewIsModal
      importantForAccessibility="yes"
    >
      <View style={styles.container}>
        {/* 背面(スクリム)。シートとは兄弟要素にして、シート本体へのタップが背面へ伝播しないようにする */}
        <Pressable
          accessibilityLabel="閉じる"
          accessibilityRole="button"
          onPress={dismissOnBackdropPress ? onClose : undefined}
          style={styles.overlay}
        />
        <Animated.View style={[styles.sheet, sheetLayoutStyle, sheetStyle]}>
          <GestureDetector gesture={pan}>
            <View style={styles.handleRow}>
              <View style={styles.handle} />
            </View>
          </GestureDetector>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create((theme) => {
  const appearance = resolveBottomSheetAppearance(theme);
  return {
    container: { flex: 1 },
    overlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: appearance.overlayColor,
    },
    // `height`/`paddingBottom` は含めない(コンポーネント側の `sheetLayoutStyle` を参照。
    // 理由はそちらのコメント参照)。ここは Unistyles のテーマ値のみで決まる静的スタイルであり、
    // 関数ではなく直接のオブジェクトなので `Animated.View` にそのまま渡せる。
    sheet: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: appearance.backgroundColor,
      borderTopLeftRadius: appearance.borderRadius,
      borderTopRightRadius: appearance.borderRadius,
      boxShadow: appearance.boxShadow,
    },
    // DS: パディング 上10 / 左右20 / 下24、ハンドル 36×5(下マージン14)、
    // タイトル text-lg/font-heading(下マージン12)。design/components/DS-COMPONENT-SPECS.md
    handleRow: {
      alignItems: "center",
      paddingTop: 10,
      paddingBottom: 14,
    },
    handle: {
      width: 36,
      height: 5,
      borderRadius: theme.radius.pill,
      backgroundColor: appearance.handleColor,
    },
    title: {
      color: theme.colors.text,
      paddingHorizontal: 20,
      marginBottom: 12,
      fontFamily: theme.fontFamily.heading,
      ...theme.typography.title,
    },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 24,
    },
  };
});
