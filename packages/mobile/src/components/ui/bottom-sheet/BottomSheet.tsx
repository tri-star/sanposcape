import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  type LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type BottomSheetProps = {
  open: boolean;
  title?: string;
  children?: ReactNode;
  onClose: () => void;
  testID?: string;
};

/**
 * DS の `--ease-out`。DS はシートの入りに `--ease-spring` を指定しているが、行き過ぎで下端から持ち上がり、
 * パネルの下にスクリムの隙間が見えるため使わない。
 */
const EASE_OUT = Easing.bezier(0.22, 0.61, 0.36, 1);

/**
 * BottomSheet — 画面下からせり上がるパネル（表示スポットの絞り込み、ピン登録など）。
 * デザイン: Sanpo Design System / components/overlays/BottomSheet
 *
 * スクリムは fade、パネルだけが slide する。`Modal` の `animationType="slide"` はスクリムごと動かし、
 * スクリムの上辺が境界線として上下するので、`Modal` は動かさずに中身を `Animated` で動かす。
 * 閉じるときは動き終えてから `Modal` を消す。
 */
export function BottomSheet({ open, title, children, onClose, testID }: BottomSheetProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  // 閉じるアニメーションの間も Modal を出しておくため、`open` とは別に持つ。
  const [mounted, setMounted] = useState(open);
  // パネルを画面外へ送る移動量。測る前は画面の高さで画面外に置く。閉じても捨てない
  // （iOS の Modal は閉じ終えても onDismiss まで中身を残すので、すぐ開き直すと onLayout が来ない）。
  // 中身の高さが変われば onLayout で追う。
  const [panelHeight, setPanelHeight] = useState<number | null>(null);

  // 開くときは描画中に Modal を出し、中身が付いた後の effect でアニメーションを始める。
  if (open && !mounted) setMounted(true);

  // 初めて開くときは高さを測ってから動かし始める。測る前に始めると、測った時点で移動量が変わりパネルが跳ねる
  // （Modal は visible になるまで中身を描かない）。
  const waitingForLayout = open && panelHeight === null;

  useEffect(() => {
    if (waitingForLayout) return;
    const animation = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: theme.motion.slow,
      easing: EASE_OUT,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      // 閉じている途中に開き直したときは finished=false で来るので、Modal を消さない。
      if (finished && !open) setMounted(false);
    });
    return () => animation.stop();
  }, [open, waitingForLayout, progress, theme.motion.slow]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [panelHeight ?? windowHeight, 0],
  });

  const handlePanelLayout = (event: LayoutChangeEvent) => {
    setPanelHeight(event.nativeEvent.layout.height);
  };

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* 閉じている途中はパネルの操作を受けない（閉じた後に親の状態を変えない）。 */}
      <View style={styles.root} pointerEvents={open ? "auto" : "none"}>
        <Animated.View style={[styles.scrim, { opacity: progress }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="閉じる"
            style={styles.scrimPressable}
            onPress={onClose}
          />
        </Animated.View>
        <Animated.View
          testID={testID}
          onLayout={handlePanelLayout}
          style={[styles.panel, { paddingBottom: insets.bottom + 24, transform: [{ translateY }] }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="閉じる"
            onPress={onClose}
            style={styles.handleHitArea}
          >
            <View style={styles.handle} />
          </Pressable>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
            bounces={false}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  scrim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: theme.colors.scrim,
  },
  scrimPressable: {
    flex: 1,
  },
  panel: {
    maxHeight: "85%",
    backgroundColor: theme.colors.surfaceCard,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    paddingTop: theme.spacing[3] - 2,
    paddingHorizontal: theme.spacing[5],
    ...theme.shadows.sheet,
  },
  handleHitArea: {
    alignSelf: "center",
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[6],
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.trackStrong,
  },
  title: {
    fontSize: theme.typography.size.lg,
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[3],
  },
  content: {
    gap: theme.spacing[3],
  },
}));
