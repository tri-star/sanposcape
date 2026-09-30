import { Keyboard, StyleSheet, View } from "react-native";

import { IconButton } from "@/components/ui/icon-button/IconButton";
import { Input } from "@/components/ui/input/Input";

export type NameSearchFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  /** スクリーンリーダー用（label を出さないため必須）。 */
  accessibilityLabel: string;
  /** 入力欄の testID。クリアボタンは `${testID}-clear`。 */
  testID: string;
};

/**
 * NameSearchField — 地図一覧・地図詳細で共有する名前の検索欄（SS-121）。
 * 虫眼鏡 + 入力 + 入力があるときだけ出るクリアボタン。絞り込みは端末で行う（ADR-M-014 D1）。
 * 地図の画面だけで使う機能固有のコンポーネントなので `features/pin/components` に置く。
 */
export function NameSearchField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  testID,
}: NameSearchFieldProps) {
  return (
    <View style={styles.row}>
      <Input
        icon="search"
        size="md"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        accessibilityLabel={accessibilityLabel}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        onSubmitEditing={() => Keyboard.dismiss()}
        style={styles.input}
        testID={testID}
      />
      {value.length > 0 ? (
        <IconButton
          icon="x-circle"
          label="検索をクリア"
          variant="ghost"
          size="sm"
          onPress={() => onChangeText("")}
          testID={`${testID}-clear`}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
  },
});
