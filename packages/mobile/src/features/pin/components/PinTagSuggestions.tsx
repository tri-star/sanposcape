import { Text, View } from "react-native";

import { Tag } from "@/components/ui/tag/Tag";
import type { TagSuggestion } from "@/features/pin/types";
import { makeStyles } from "@/theme/makeStyles";

export type PinTagSuggestionsProps = {
  /** 表示する候補（絞り込み済み）。空なら何も描画しない。 */
  suggestions: readonly TagSuggestion[];
  /** 見出し（`tagSuggestionHeading` の結果）。 */
  heading: string;
  onSelect: (label: string) => void;
  testID: string;
};

/**
 * PinTagSuggestions — タグ候補のチップ群（SS-136）。`PinTagEditor` からだけ使う。
 * ドロップダウンにせず、フォームの流れの中に並べる（ScrollView + KeyboardAvoidingView 内の
 * 浮いたリストは重なり順・キーボード・読み上げ順が難しいため。mobile ADR-013）。
 */
export function PinTagSuggestions({
  suggestions,
  heading,
  onSelect,
  testID,
}: PinTagSuggestionsProps) {
  const styles = useStyles();

  if (suggestions.length === 0) return null;

  return (
    <View testID={testID} style={styles.root}>
      <Text style={styles.heading}>{heading}</Text>
      <View style={styles.chips}>
        {suggestions.map((suggestion, index) => (
          <Tag
            key={suggestion.label}
            icon="plus"
            category="neutral"
            onPress={() => onSelect(suggestion.label)}
            accessibilityLabel={`タグ「${suggestion.label}」を追加`}
            testID={`${testID}-${index}`}
          >
            {suggestion.label}
          </Tag>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    gap: theme.spacing[2],
  },
  heading: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textTertiary,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
}));
