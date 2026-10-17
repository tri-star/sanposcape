import { Modal } from "react-native";

import { UpdateRequiredView } from "@/features/app-update/components/UpdateRequiredView";
import { useOpenStore } from "@/features/app-update/hooks/useOpenStore";
import { useUpdateRequired } from "@/features/app-update/hooks/useUpdateRequired";

/** Android の戻る操作で閉じさせない（閉じる手段を置かない。SS-101）。 */
const ignoreCloseRequest = () => {};

/**
 * 最低サポートバージョンを下回るアプリで、操作をふさぐ全画面の案内を出す（SS-101 / ADR-008 決定7）。
 * `app/_layout.tsx` に1つだけ置く。判定は `useUpdateRequired`。
 *
 * - `<Stack>` を包まずに兄弟として置き、RN の `Modal` で上に重ねる。children を条件付きで差し替えると
 *   ナビゲータが作り直される（`AppConfigBootstrap` の JSDoc と同じ理由）。`Modal` にしているのは、
 *   画面側の `Dialog` / `BottomSheet`（これも `Modal`）より上に出し、Android の戻る操作も受け止めるため。
 * - 閉じる手段は置かない。contract（古い API の削除）の前提は、最低バージョン未満の端末が API を使わないこと。
 * - 最低バージョンが下がれば（`/app-config` の再取得で）自然に消える。
 */
export function UpdateRequiredGate() {
  const required = useUpdateRequired();
  const store = useOpenStore();

  return (
    <Modal
      visible={required}
      animationType="fade"
      onRequestClose={ignoreCloseRequest}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <UpdateRequiredView
        storeUrl={store.storeUrl}
        storeLabel={store.storeLabel}
        openFailed={store.failed}
        onOpenStore={store.open}
      />
    </Modal>
  );
}
