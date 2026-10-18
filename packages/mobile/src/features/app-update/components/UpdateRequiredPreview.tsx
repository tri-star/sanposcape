import { Modal } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { UpdateRequiredView } from "@/features/app-update/components/UpdateRequiredView";
import { useOpenStore } from "@/features/app-update/hooks/useOpenStore";

export type UpdateRequiredPreviewProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * 画面カタログ（`ScreenCatalog`）から開く、アップデートの案内の見た目の確認用（SS-101）。
 * 本物（`UpdateRequiredGate`）と同じ `UpdateRequiredView` を出し、確認用の「閉じる」だけを足す。
 * ストアのボタンは本物と同じく本番の掲載ページを開く。
 */
export function UpdateRequiredPreview({ open, onClose }: UpdateRequiredPreviewProps) {
  const store = useOpenStore();

  return (
    <Modal
      visible={open}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <UpdateRequiredView
        storeUrl={store.storeUrl}
        storeLabel={store.storeLabel}
        openFailed={store.failed}
        onOpenStore={store.open}
        footer={
          <Button
            testID="update-required-preview-close"
            variant="ghost"
            fullWidth
            onPress={onClose}
          >
            閉じる（確認用）
          </Button>
        }
      />
    </Modal>
  );
}
