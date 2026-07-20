import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

export type CatalogSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

/** 見出し + 区切り線 + 子要素を並べるだけの薄いレイアウト(Storybook の代替であるカタログ画面用) */
export function CatalogSection({ title, description, children }: CatalogSectionProps) {
  const { theme } = useUnistyles();

  return (
    <View style={{ gap: theme.spacing[12], paddingVertical: theme.spacing[16] }}>
      <View style={{ gap: theme.spacing[4] }}>
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.fontFamily.heading,
            ...theme.typography.headingSm,
          }}
        >
          {title}
        </Text>
        {description ? (
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.fontFamily.body,
              ...theme.typography.bodySm,
            }}
          >
            {description}
          </Text>
        ) : null}
      </View>
      <View style={{ height: theme.sizing.hairline, backgroundColor: theme.colors.border }} />
      <View style={{ gap: theme.spacing[16] }}>{children}</View>
    </View>
  );
}
