import { View } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Input } from "@/components/ui/input/Input";
import { Tag } from "@/components/ui/tag/Tag";
import { PIN_TAGS_MAX_COUNT } from "@/features/pin/lib/pinLimits";
import { makeStyles } from "@/theme/makeStyles";

export type PinTagEditorProps = {
  tags: string[];
  input: string;
  error: string | null;
  onChangeInput: (value: string) => void;
  onAdd: () => void;
  onRemove: (label: string) => void;
  testID: string;
};

/** PinTagEditor — 自由入力のタグ付与・削除。 */
export function PinTagEditor({
  tags,
  input,
  error,
  onChangeInput,
  onAdd,
  onRemove,
  testID,
}: PinTagEditorProps) {
  const styles = useStyles();

  return (
    <View testID={testID} style={styles.root}>
      {tags.length > 0 ? (
        <View style={styles.chips}>
          {tags.map((tag, index) => (
            <Tag key={tag} icon="x" onPress={() => onRemove(tag)} testID={`${testID}-${index}`}>
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
            value={input}
            onChangeText={onChangeInput}
            error={error ?? undefined}
            testID={`${testID}-input`}
          />
        </View>
        <Button
          variant="secondary"
          size="sm"
          onPress={onAdd}
          disabled={tags.length >= PIN_TAGS_MAX_COUNT}
          testID={`${testID}-add`}
        >
          追加
        </Button>
      </View>
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
