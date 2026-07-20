import type { ReactNode } from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import {
  resolveCardAppearance,
  type CardElevation,
  type CardPadding,
} from "@/components/ui/card/cardStyles";

export type CardProps = {
  children: ReactNode;
  /** 既定 "md" */
  elevation?: CardElevation;
  /** 既定 "md"(=16) */
  padding?: CardPadding;
  /** 指定時のみ Pressable になる */
  onPress?: () => void;
  testID?: string;
};

export function Card({ children, elevation = "md", padding = "md", onPress, testID }: CardProps) {
  const { theme } = useUnistyles();

  if (!onPress) {
    const appearance = resolveCardAppearance(theme, { elevation, padding, pressed: false });
    return (
      <View style={buildCardStyle(appearance)} testID={testID}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      style={({ pressed }) =>
        buildCardStyle(resolveCardAppearance(theme, { elevation, padding, pressed }))
      }
    >
      {children}
    </Pressable>
  );
}

function buildCardStyle(appearance: ReturnType<typeof resolveCardAppearance>): ViewStyle {
  return {
    backgroundColor: appearance.backgroundColor,
    borderRadius: appearance.borderRadius,
    padding: appearance.padding,
    boxShadow: appearance.boxShadow,
    transform: [{ scale: appearance.scale }],
  };
}
