import { ActivityIndicator, Text, View } from "react-native";

import { IconButton } from "@/components/ui/icon-button/IconButton";
import { Input } from "@/components/ui/input/Input";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type LocationSearchFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  /** キーボードの検索キー。 */
  onSubmit: () => void;
  /** 入力・検索結果のピン・案内をまとめて消す。入力か案内があるときだけ × を出す。 */
  onClear: () => void;
  /** 結果のピンが出ている・案内があるときも × を出す（入力を消した後でもピンを消せるように）。 */
  hasResults: boolean;
  isSearching: boolean;
  message: string | null;
  isError: boolean;
  /** 入力欄の testID。× は `${testID}-clear`、案内は `${testID}-message`、検索中の表示は `${testID}-loading`。 */
  testID: string;
};

/**
 * LocationSearchField — ピンタブの上部の検索欄（SS-267。ADR-M-026）。以前のヒント（「地図を長押しすると…」）の行を置き換える。
 * 送信はキーボードの検索キーだけ（ボタンを足さない。地図の上の面積を増やさないため）。
 */
export function LocationSearchField({
  value,
  onChangeText,
  onSubmit,
  onClear,
  hasResults,
  isSearching,
  message,
  isError,
  testID,
}: LocationSearchFieldProps) {
  const theme = useTheme();
  const styles = useStyles();
  const canClear = value.length > 0 || hasResults || message !== null;
  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <Input
          icon="search"
          size="md"
          value={value}
          onChangeText={onChangeText}
          placeholder="住所・駅・施設名で検索"
          accessibilityLabel="住所・駅・施設名で検索"
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          onSubmitEditing={onSubmit}
          style={styles.input}
          testID={testID}
        />
        {isSearching ? (
          <ActivityIndicator
            color={theme.colors.primary}
            accessibilityLabel="検索しています"
            testID={`${testID}-loading`}
          />
        ) : null}
        {canClear ? (
          <IconButton
            icon="x-circle"
            label="検索をクリア"
            variant="ghost"
            size="sm"
            onPress={onClear}
            testID={`${testID}-clear`}
          />
        ) : null}
      </View>
      {message !== null ? (
        <Text
          style={[styles.message, isError ? styles.messageError : null]}
          accessibilityLiveRegion="polite"
          testID={`${testID}-message`}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    gap: theme.spacing[1],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  input: {
    flex: 1,
  },
  message: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
  messageError: {
    color: theme.colors.danger,
  },
}));
