import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

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
  if (!onPress) {
    return (
      <View style={styles.root({ elevation, padding, pressed: false })} testID={testID}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => styles.root({ elevation, padding, pressed })}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: (args: { elevation: CardElevation; padding: CardPadding; pressed: boolean }) => {
    const appearance = resolveCardAppearance(theme, args);
    return {
      backgroundColor: appearance.backgroundColor,
      borderRadius: appearance.borderRadius,
      padding: appearance.padding,
      boxShadow: appearance.boxShadow,
      transform: [{ scale: appearance.scale }],
    };
  },
}));
