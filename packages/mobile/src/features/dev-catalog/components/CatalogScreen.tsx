import { useState, type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useUnistyles, UnistylesRuntime } from "react-native-unistyles";

import { Avatar } from "@/components/ui/avatar/Avatar";
import { Badge } from "@/components/ui/badge/Badge";
import { BottomSheet } from "@/components/ui/bottom-sheet/BottomSheet";
import { Button } from "@/components/ui/button/Button";
import { Card } from "@/components/ui/card/Card";
import { Checkbox } from "@/components/ui/checkbox/Checkbox";
import { Dialog } from "@/components/ui/dialog/Dialog";
import { Icon } from "@/components/ui/icon/Icon";
import type { IconName } from "@/components/ui/icon/iconRegistry";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { IllustrationSlot } from "@/components/ui/illustration-slot/IllustrationSlot";
import { Input } from "@/components/ui/input/Input";
import { MapPin } from "@/components/ui/map-pin/MapPin";
import { ProgressBar } from "@/components/ui/progress-bar/ProgressBar";
import { Radio } from "@/components/ui/radio/Radio";
import { Select, type SelectOption } from "@/components/ui/select/Select";
import { StatBlock } from "@/components/ui/stat-block/StatBlock";
import { Switch } from "@/components/ui/switch/Switch";
import { Tag } from "@/components/ui/tag/Tag";
import { useToast } from "@/components/ui/toast/useToast";
import { CatalogSection } from "@/features/dev-catalog/components/CatalogSection";

const ICON_SAMPLE: IconName[] = ["home", "map-pin", "search", "settings", "heart", "footprints"];
const SPOT_OPTIONS: SelectOption<"park" | "cafe" | "culture" | "station">[] = [
  { value: "park", label: "公園", iconName: "trees" },
  { value: "cafe", label: "カフェ", iconName: "coffee" },
  { value: "culture", label: "文化施設", iconName: "library" },
  { value: "station", label: "駅", iconName: "train" },
];

/**
 * 全 primitive を一覧する開発用カタログ画面(Storybook の代替)。
 * `/(dev)/catalog`(開発ビルド or `EXPO_PUBLIC_ENABLE_CATALOG=true` のみ到達可能)。
 * light/dark トグルはトークン移植の目視検証手段として必須。
 */
export function CatalogScreen() {
  const { theme, rt } = useUnistyles();

  const [inputValue, setInputValue] = useState("");
  const [switchOn, setSwitchOn] = useState(true);
  const [checked, setChecked] = useState(true);
  const [selectedRadio, setSelectedRadio] = useState<"a" | "b">("a");
  const [selectValue, setSelectValue] = useState<"park" | "cafe" | "culture" | "station" | null>(
    null,
  );
  const [dialogVisible, setDialogVisible] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const { show } = useToast();

  const isDark = rt.themeName === "dark";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={["bottom"]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: theme.spacing[16],
          borderBottomWidth: theme.sizing.hairline,
          borderBottomColor: theme.colors.border,
        }}
      >
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.fontFamily.heading,
            ...theme.typography.headingSm,
          }}
        >
          UI カタログ
        </Text>
        <Button
          label={isDark ? "Dark" : "Light"}
          variant="secondary"
          size="sm"
          onPress={() => {
            // カタログでは意図的な手動切替を優先するため、システム追従を止めてから切り替える
            UnistylesRuntime.setAdaptiveThemes(false);
            UnistylesRuntime.setTheme(isDark ? "light" : "dark");
          }}
          testID="catalog-theme-toggle"
        />
      </View>

      <ScrollView contentContainerStyle={{ padding: theme.spacing[16] }}>
        <CatalogSection title="Icon">
          <Row>
            {ICON_SAMPLE.map((name) => (
              <Icon key={name} name={name} testID={`catalog-icon-${name}`} />
            ))}
          </Row>
        </CatalogSection>

        <CatalogSection title="Button">
          <Row>
            <Button
              label="primary"
              variant="primary"
              onPress={() => show("primary が押されました")}
            />
            <Button label="secondary" variant="secondary" onPress={() => {}} />
            <Button label="ghost" variant="ghost" onPress={() => {}} />
            <Button label="danger" variant="danger" onPress={() => {}} />
            <Button label="disabled" variant="primary" disabled onPress={() => {}} />
            <Button label="loading" variant="primary" loading onPress={() => {}} />
          </Row>
        </CatalogSection>

        <CatalogSection title="IconButton">
          <Row>
            <IconButton
              iconName="heart"
              accessibilityLabel="お気に入り"
              variant="primary"
              onPress={() => {}}
            />
            <IconButton
              iconName="share"
              accessibilityLabel="共有"
              variant="secondary"
              onPress={() => {}}
            />
            <IconButton
              iconName="settings"
              accessibilityLabel="設定"
              variant="ghost"
              onPress={() => {}}
            />
          </Row>
        </CatalogSection>

        <CatalogSection title="Card">
          <Row>
            <Card testID="catalog-card-static">
              <Text style={{ color: theme.colors.text }}>静的な Card</Text>
            </Card>
            <Card onPress={() => {}} testID="catalog-card-pressable">
              <Text style={{ color: theme.colors.text }}>押下可能な Card</Text>
            </Card>
          </Row>
        </CatalogSection>

        <CatalogSection title="Avatar">
          <Row>
            <Avatar name="桜" size="sm" />
            <Avatar name="桜" size="md" />
            <Avatar name="桜" size="lg" />
            <Avatar size="xl" />
          </Row>
        </CatalogSection>

        <CatalogSection title="StatBlock">
          <Row>
            <StatBlock value="00:28:34" label="経過時間" size="lg" />
            <StatBlock value="4.0" unit="km" label="距離" size="md" />
          </Row>
        </CatalogSection>

        <CatalogSection title="ProgressBar">
          <View style={{ gap: theme.spacing[8] }}>
            <ProgressBar value={0.3} size="sm" testID="catalog-progress-sm" />
            <ProgressBar value={0.7} size="md" testID="catalog-progress-md" />
          </View>
        </CatalogSection>

        <CatalogSection title="Input">
          <View style={{ gap: theme.spacing[12] }}>
            <Input
              label="散歩の目的地"
              placeholder="駅名や公園名を入力"
              iconName="search"
              value={inputValue}
              onChangeText={setInputValue}
              testID="catalog-input-default"
            />
            <Input
              label="エラー例"
              value=""
              onChangeText={() => {}}
              errorMessage="必須項目です"
              testID="catalog-input-error"
            />
            <Input
              label="無効化例"
              value="編集不可"
              onChangeText={() => {}}
              disabled
              testID="catalog-input-disabled"
            />
          </View>
        </CatalogSection>

        <CatalogSection title="Switch">
          <Row>
            <Switch
              value={switchOn}
              onValueChange={setSwitchOn}
              accessibilityLabel="通知"
              testID="catalog-switch"
            />
            <Switch value={false} onValueChange={() => {}} disabled accessibilityLabel="無効" />
          </Row>
        </CatalogSection>

        <CatalogSection title="Checkbox">
          <Row>
            <Checkbox
              checked={checked}
              onChange={setChecked}
              label="利用規約に同意する"
              testID="catalog-checkbox"
            />
            <Checkbox checked={false} indeterminate onChange={() => {}} label="一部選択" />
          </Row>
        </CatalogSection>

        <CatalogSection title="Radio">
          <Row>
            <Radio
              selected={selectedRadio === "a"}
              onSelect={() => setSelectedRadio("a")}
              label="A"
            />
            <Radio
              selected={selectedRadio === "b"}
              onSelect={() => setSelectedRadio("b")}
              label="B"
            />
          </Row>
        </CatalogSection>

        <CatalogSection title="Badge">
          <Row>
            <Badge label="neutral" variant="neutral" />
            <Badge label="primary" variant="primary" />
            <Badge label="success" variant="success" />
            <Badge label="warning" variant="warning" />
            <Badge label="danger" variant="danger" />
            <Badge variant="danger" />
          </Row>
        </CatalogSection>

        <CatalogSection title="Tag">
          <Row>
            <Tag label="公園" category="park" selected />
            <Tag label="カフェ" category="cafe" />
            <Tag label="文化施設" category="culture" />
            <Tag label="駅" category="station" onRemove={() => {}} />
          </Row>
        </CatalogSection>

        <CatalogSection title="Toast" description="タップすると画面下にトーストが表示されます">
          <Row>
            <Button
              label="info"
              variant="secondary"
              size="sm"
              onPress={() => show("保存しました")}
            />
            <Button
              label="success"
              variant="secondary"
              size="sm"
              onPress={() => show("完了しました", { variant: "success" })}
            />
            <Button
              label="danger"
              variant="secondary"
              size="sm"
              onPress={() => show("エラーが発生しました", { variant: "danger" })}
            />
          </Row>
        </CatalogSection>

        <CatalogSection title="Dialog">
          <Button
            label="Dialog を開く"
            variant="secondary"
            onPress={() => setDialogVisible(true)}
            testID="catalog-dialog-open"
          />
          <Dialog
            visible={dialogVisible}
            onClose={() => setDialogVisible(false)}
            title="削除しますか?"
            message="この操作は取り消せません。"
            destructive
            actions={[
              { label: "キャンセル", onPress: () => setDialogVisible(false) },
              { label: "削除する", onPress: () => setDialogVisible(false) },
            ]}
            testID="catalog-dialog"
          />
        </CatalogSection>

        <CatalogSection title="BottomSheet">
          <Button
            label="BottomSheet を開く"
            variant="secondary"
            onPress={() => setSheetVisible(true)}
            testID="catalog-sheet-open"
          />
          <BottomSheet
            visible={sheetVisible}
            onClose={() => setSheetVisible(false)}
            title="スポット一覧"
            testID="catalog-sheet"
          >
            <Text style={{ color: theme.colors.text }}>
              ドラッグしてスナップ位置を確認できます。
            </Text>
          </BottomSheet>
        </CatalogSection>

        <CatalogSection title="Select">
          <Select
            label="スポット種別"
            value={selectValue}
            options={SPOT_OPTIONS}
            onChange={setSelectValue}
            testID="catalog-select"
          />
        </CatalogSection>

        <CatalogSection title="MapPin">
          <Row>
            <MapPin category="park" />
            <MapPin category="cafe" />
            <MapPin category="culture" />
            <MapPin category="station" selected />
            <MapPin category="park" variant="current" />
            <MapPin category="park" variant="destination" />
          </Row>
        </CatalogSection>

        <CatalogSection title="IllustrationSlot">
          <Row>
            <IllustrationSlot kind="home-hero" size="sm" />
            <IllustrationSlot kind="empty-walks" size="sm" />
            <IllustrationSlot kind="empty-spots" size="sm" />
            <IllustrationSlot kind="nav-idle" size="sm" />
          </Row>
        </CatalogSection>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ children }: { children: ReactNode }) {
  const { theme } = useUnistyles();
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: theme.spacing[12],
      }}
    >
      {children}
    </View>
  );
}
