# ADR-M-015: アプリアイコンは採用PNGとAndroidの専用レイヤーを使う

## 現在有効な決定（要約）

> 最終更新: 2026-10-25（SS-227）。本節は本文（追補を含む）を要約したもので、一次記録は本文。
> 本文と食い違う場合は本節の誤りとして本節を直す。

### 決定

- **本番は採用PNGとAndroid専用レイヤーを使う**。iOSは不透明なPNG、Androidは前景・背景・単色画像を使う。（本文: 決定）
- **開発用は本番素材から「DEV」帯を機械的に重ねて作る**。Androidでは前景と単色を生成し、背景を共用する。単色は帯の文字を透明に抜く。（本文: SS-227 追補）
- **app.jsonは開発用、APP_VARIANT=productionで本番用に切り替える**。開発用はdevelopment・preview・staging・staging-apk・staging-iosに適用する。（本文: SS-227 追補）
- **Androidの人物とDEV帯は中央66/108の安全円に収める**。スプラッシュ・favicon・位置記録の通知アイコンは変更しない。（本文: 決定、SS-227 追補）
- **生成元と再生成スクリプトを保持し、アイコン更新後はネイティブビルドを作り直す**。Fast Refresh・OTAでは反映しない。（本文: 決定、影響、SS-227 追補）

### 変更・撤回された決定

- 開発・本番は同じアイコン → 開発用にDEV帯を付け、variantで切り替える（SS-227 追補）。

## 日付

2026-10-01（SS-87）、2026-10-25 追補（SS-227）

## コンテキスト

SS-87で、青空・雲・木々のある道と、顔のない中性的な歩行者のイラストを採用した。
既存設定はExpoのサンプル画像で、iOSはIcon Composer、AndroidはAdaptive Iconの前景・背景・単色レイヤーを指定していた。
採用画像を両OSに反映し、小さな表示やAndroidのマスクでも人物を識別できる必要がある。

## 決定

- 静的なパスは[ADR-M-007](./ADR-M-007-expo-config-and-maps-key-injection.md)に従い`app.json`に指定する。
- 共通`icon`と`ios.icon`は`assets/app-icons/sanposcape-icon-1024.png`を指定する。不透明・正方形の採用PNGを使い、角丸はOSに任せる。
- iOSはサンプルの`expo.icon`を使わず、ExpoのPNG入力からネイティブアイコンを生成する。独自のdark/tinted画像は今回用意しない。
- Androidは採用画像から画像生成ツールで分離した人物と景色を専用レイヤーにする。単色レイヤーは人物のアルファ形状を使う。
- 人物は1024pxキャンバスの中央に置き、108dpキャンバスの中央66dpの円内にアルファが収まるよう余白を調整する。
- 開発・本番は同じアイコンを使う（SS-227追補で開発用を分離）。スプラッシュとWeb faviconはこの変更の対象にしない。
- 原画像・分離した画像・サイズ展開・再生成スクリプトを保持する。生成元と設定への導線は`assets/app-icons/README.md`に記載する。

## 検討した選択肢

- **iOSのPNG入力（採用）**: 承認された完成画像をそのまま使え、Linuxでも素材の検証・再生成ができる。
- **Icon Composerを更新**: レイヤーや見た目別の調整ができるが、完成した1枚絵に追加効果を加える要件はなく、macOSでの編集・検証が必要になる。
- **Androidの完成画像を前景に指定**: 簡単だが、マスクによる人物の欠けや、テーマ用にサンプルアイコンが残る問題を避けにくい。

## 決定理由

採用された人物と景色を中心に据え、各OSの入力形式とマスクに合わせる。iOSの高度なレイヤー効果より、承認済み画像への忠実さと再現可能な生成を優先する。

## 影響

- アイコン更新にはネイティブアプリの再ビルド・再インストールが必要。MetroのFast RefreshやOTAだけでは反映されない。
- Androidの景色レイヤーは人物除去後に再構成されるため、完成PNGと完全に同じピクセルにはならない。合成プレビューと端末で見え方を確認する。
- iOSのdark/tinted表示とAndroidの各ランチャーによる見え方はOSにも依存する。実機未確認ならその制約を報告する。

## 関連情報

- [Expo: App icon](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/)
- [Android: Adaptive icons](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive)
- [ADR-M-003: development build](./ADR-M-003-development-build-and-dev-loop.md)

## SS-227 追補: 開発用アイコンの分離

### 決定と理由

- 本番アイコンを保ち、開発用はオレンジの「DEV」帯を重ねた派生画像にする。同じ端末に共存する開発・本番を、アプリ名を読まずに区別できるようにする。
- `assets/app-icons/generate-development.py` がPillow 11.3.0と同梱フォントで、本番用の通常PNG・Android前景・単色画像から `development/` の3枚を生成する。画像生成サービス・OSフォントに依存せず再生成できる。
- 通常PNGは下部に帯を置き、Android前景の帯は中央66/108の安全円内に置く。単色画像は帯を加え、文字を透明に抜く。背景を共用し、人物と景色の構図を引き継ぐ。
- `app.json` は開発用画像を指定し、既存の `APP_VARIANT=production` 分岐で本番用画像へ上書きする。`development`・`preview`・`staging`・`staging-apk`・`staging-ios` は開発用、`production` は本番用とする。
- スプラッシュ・Web favicon・位置記録の通知アイコンは変更しない。アプリ識別子・権限・利用者データの扱いも変更しない。

### 却下案

- 手編集で開発用画像を別管理する: 本番素材の更新時に同じ手順で再現できない。
- Androidの端に斜めリボンを置く: ランチャーのマスクで装飾や文字が切れやすい。
- EASビルド中に生成する: Python/Pillowをビルド依存に加える必要がある。生成物をコミットしてビルドは既存PNGを読む方式にする。

### 影響・更新手順

本番素材の更新後に開発用生成コマンドを実行し、生成したPNGを同じ変更に含める。
コマンドと生成元の一覧は [アイコン素材のREADME](../assets/app-icons/README.md) に記録する。
既存の本番用 `manifest.json`・ZIP・手動組込み用iOSカタログの対象は本番素材のまま。
反映はネイティブアプリの再ビルド・再インストールで行い、Fast Refresh・OTAでは切り替わらない。
iOSのdark/tintedとAndroid各ランチャーの最終的な表示は端末で確認する。
