import { ActivityIndicator, Text, View } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Icon } from "@/components/ui/icon/Icon";
import { Tag } from "@/components/ui/tag/Tag";
import type { SanpoMapChoicesState } from "@/features/pin/lib/sanpoMapChoices";
import type { SanpoMapSelection } from "@/features/pin/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type SanpoMapSelectorProps = {
  state: SanpoMapChoicesState;
  onSelect: (selection: SanpoMapSelection) => void;
  onRetry: () => void;
  /** 保存中は選び直しを止める（PR #93 T12）。 */
  disabled?: boolean;
  testID: string;
};

/** SanpoMapSelector — 保存先の地図を選ぶチップ群。 */
export function SanpoMapSelector({
  state,
  onSelect,
  onRetry,
  disabled = false,
  testID,
}: SanpoMapSelectorProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <View testID={testID} style={styles.root}>
      <View style={styles.heading}>
        <Icon name="map" size={16} color={theme.colors.textSecondary} />
        <Text style={styles.headingText}>保存先の地図</Text>
      </View>

      {state.status === "loading" ? (
        <View style={styles.loadingRow} testID={`${testID}-loading`}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          {state.helper ? <Text style={styles.helper}>{state.helper}</Text> : null}
        </View>
      ) : (
        <View style={styles.chips}>
          {state.choices.map((choice) => (
            <Tag
              key={choice.key}
              icon={choice.isDraft ? "plus" : "map"}
              selected={choice.selected}
              // disabled 中は onPress を渡さない＝押せないタグとして描画する（Tag 自身の契約）。
              onPress={disabled ? undefined : () => onSelect(choice.selection)}
              accessibilityLabel={`地図「${choice.label}」を選択`}
              testID={`${testID}-${choice.key}`}
            >
              {choice.label}
            </Tag>
          ))}
        </View>
      )}

      {state.status === "error" ? (
        <View style={styles.errorRow}>
          {state.helper ? <Text style={styles.helperError}>{state.helper}</Text> : null}
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onPress={onRetry}
            testID={`${testID}-retry`}
          >
            再読み込み
          </Button>
        </View>
      ) : state.status === "ready" && state.helper ? (
        <Text style={styles.helper}>{state.helper}</Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    marginHorizontal: theme.layout.pageGutter,
    gap: theme.spacing[2],
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headingText: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textSecondary,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flexWrap: "wrap",
  },
  helper: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textTertiary,
  },
  helperError: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.danger,
  },
}));
