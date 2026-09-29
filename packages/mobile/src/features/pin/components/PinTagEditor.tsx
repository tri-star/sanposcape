import { View } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Input } from "@/components/ui/input/Input";
import { Tag } from "@/components/ui/tag/Tag";
import { PinTagSuggestions } from "@/features/pin/components/PinTagSuggestions";
import { PIN_TAGS_MAX_COUNT } from "@/features/pin/lib/pinLimits";
import { resolveTagSubmitAction, tagSuggestionHeading } from "@/features/pin/lib/pinTagSuggestions";
import type { TagSuggestion } from "@/features/pin/types";
import { makeStyles } from "@/theme/makeStyles";

export type PinTagEditorProps = {
  tags: string[];
  input: string;
  error: string | null;
  /** 表示する候補（呼び出し側で `filterTagSuggestions` 済み）。 */
  suggestions: readonly TagSuggestion[];
  onChangeInput: (value: string) => void;
  /** 入力欄の内容を追加する（追加ボタン・送信キー）。 */
  onAdd: () => void;
  /** 候補チップのタップ。 */
  onSelectSuggestion: (label: string) => void;
  onRemove: (label: string) => void;
  /** 保存中はタグの追加・削除を止める（PR #93 T12）。 */
  disabled?: boolean;
  testID: string;
};

/** PinTagEditor — 自由入力と既存タグの候補からのタグ付与・削除。 */
export function PinTagEditor({
  tags,
  input,
  error,
  suggestions,
  onChangeInput,
  onAdd,
  onSelectSuggestion,
  onRemove,
  disabled = false,
  testID,
}: PinTagEditorProps) {
  const styles = useStyles();
  const limitReached = tags.length >= PIN_TAGS_MAX_COUNT;

  return (
    <View testID={testID} style={styles.root}>
      {tags.length > 0 ? (
        <View style={styles.chips}>
          {tags.map((tag, index) => (
            <Tag
              key={tag}
              icon="x"
              onPress={disabled ? undefined : () => onRemove(tag)}
              accessibilityLabel={`${tag}を削除`}
              testID={`${testID}-${index}`}
            >
              {tag}
            </Tag>
          ))}
        </View>
      ) : null}

      <View style={styles.inputRow}>
        <View style={styles.inputField}>
          <Input
            size="sm"
            placeholder="タグを追加"
            accessibilityLabel="タグ"
            value={input}
            onChangeText={onChangeInput}
            error={error ?? undefined}
            helper={
              limitReached
                ? `タグは${PIN_TAGS_MAX_COUNT}個までです。追加するには付いているタグを削除してください`
                : undefined
            }
            disabled={disabled || limitReached}
            returnKeyType="done"
            autoCapitalize="none"
            autoCorrect={false}
            // 文字があるときはキーボードを開いたまま追加し、続けて入力できる。空なら閉じるだけ。
            submitBehavior={resolveTagSubmitAction(input) === "add" ? "submit" : "blurAndSubmit"}
            onSubmitEditing={() => {
              if (resolveTagSubmitAction(input) === "add") onAdd();
            }}
            testID={`${testID}-input`}
          />
        </View>
        <Button
          variant="secondary"
          size="sm"
          onPress={onAdd}
          disabled={disabled || limitReached}
          testID={`${testID}-add`}
        >
          追加
        </Button>
      </View>

      {/* 保存中は候補を出さない（押せない静的チップが付与済みタグと紛らわしいため）。 */}
      {disabled ? null : (
        <PinTagSuggestions
          suggestions={suggestions}
          heading={tagSuggestionHeading(input)}
          onSelect={onSelectSuggestion}
          testID={`${testID}-suggestions`}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    marginHorizontal: theme.layout.pageGutter,
    gap: theme.spacing[2],
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
  },
  inputField: {
    flex: 1,
  },
}));
