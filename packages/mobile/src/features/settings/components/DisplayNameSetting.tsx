import { useState } from "react";
import { View } from "react-native";

import { FEATURE_FLAG_KEYS } from "@/config/featureFlags";
import { DisplayNameEditDialog } from "@/features/settings/components/DisplayNameEditDialog";
import { DisplayNameSection } from "@/features/settings/components/DisplayNameSection";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";
import { makeStyles } from "@/theme/makeStyles";

/**
 * 設定画面の表示名の設定（SS-268）。カード（`DisplayNameSection`）と変更のダイアログを合成する。
 * 呼び出し側（`SettingsView`）はサインイン中のときだけ置く。フラグ `display_name_edit` が OFF なら何も出さない。
 *
 * 表示名は `useAuthSessionStore` から読む（`features/settings` はストアを直接参照してよい。SettingsView の JSDoc）。
 * ダイアログは開くたびに `key` を変えて作り直し、入力欄をいまの名前から始める（`SanpoMapCreateDialog` と同じ）。
 */
export function DisplayNameSetting() {
  const styles = useStyles();
  const enabled = useFeatureFlag(FEATURE_FLAG_KEYS.displayNameEdit);
  // セレクタはプリミティブを返す（zustand v5）。
  const displayName = useAuthSessionStore((state) => state.user?.displayName ?? null);
  const [open, setOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);

  if (!enabled) return null;

  const openDialog = () => {
    setDialogKey((key) => key + 1);
    setOpen(true);
  };

  return (
    <View style={styles.section}>
      <DisplayNameSection
        displayName={displayName}
        onEdit={openDialog}
        testID="settings-display-name-section"
      />
      <DisplayNameEditDialog
        key={dialogKey}
        open={open}
        initialDisplayName={displayName}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

// 余白はここに持つ（フラグが OFF で何も出さないとき、設定画面に余白だけが残らないように）。
const useStyles = makeStyles((theme) => ({
  section: {
    marginTop: theme.spacing[4],
  },
}));
