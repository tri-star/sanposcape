# Sanposcape アプリアイコン

採用した顔のない中性的な歩行者のアイコン（`../icon-concepts/sanposcape-icon-v2.png`、1254 × 1254px）から、構図を変えずに Lanczos で縮小した素材。
完成アイコンは不透明な RGB。Android の人物前景・単色画像は透明な RGBA。角丸や円形マスクは画像に焼き込んでいない。

| 用途 | サイズ（px、縦横同じ） | 保存先 |
| --- | --- | --- |
| Expo・共通マスター | 1024 | `sanposcape-icon-1024.png` |
| Android 従来形式のランチャー | 48 / 72 / 96 / 144 / 192 | `android/mipmap-*/ic_launcher.png` |
| Google Play | 512 | `android/play-store-icon-512.png` |
| Android Adaptive Icon | 1024 | `android/adaptive-{foreground,background,monochrome}.png` |
| iOS 通知・設定・Spotlight・ホーム画面・ストア | 20 / 29 / 40 / 58 / 60 / 76 / 80 / 87 / 120 / 152 / 167 / 180 / 1024 | `ios/AppIcon.appiconset/` |

`ios/AppIcon.appiconset/Contents.json` は iPhone / iPad / ストア用の18スロットを対応する PNG に結び付ける。
`manifest.json` は全23枚の画像と寸法・形式の一覧。`sanposcape-app-icons.zip` に画像・カタログ・説明・生成スクリプトをまとめている。

## アプリへの適用

`app.json` の共通 `icon` と `ios.icon` に1024pxマスターを指定済み。iOSはサンプルのIcon Composer設定からPNG入力へ変更した。
Android の `adaptiveIcon` に専用の前景・背景・単色レイヤーを指定済み。通常アイコンは共通マスターを使う。
前景は画像生成ツールで人物を透明背景に切り出し、背景は人物を除去した景色を再構成した。
原素材は `../icon-concepts/adaptive-walker-source.png` と `adaptive-scenery-source.png`。
単色レイヤーは前景と同じアルファ形状。人物を中央に置き、中央66/108の安全円内に収める。
設計理由は [ADR-M-015](../../adr/ADR-M-015-app-icon-assets.md) を参照。
開発・本番とも同じアイコンを使う。スプラッシュとWeb faviconは既存設定のまま。
端末への反映にはネイティブアプリの再ビルド・再インストールが必要。Fast RefreshやOTAではホーム画面のアイコンは更新されない。
このフォルダのiOSカタログは手動組込み用で、Expoはマスターからビルド時に必要な画像を生成する。

## 再生成

リポジトリルートから実行する。アプリ用の環境変数や `.env` は不要。

```bash
uv run --no-project --with Pillow==11.3.0 python packages/mobile/assets/app-icons/generate.py
```

ZIPには原画像を含めないため、ZIP内のスクリプト単独では再生成できない。再生成はリポジトリの採用原画像と分離した原素材を使用する。

## 参照

- [Expo: Splash screen and app icon](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/)
- [Android: Change the app icon](https://developer.android.com/codelabs/basic-android-kotlin-compose-training-change-app-icon)
- [Apple: Configuring your app icon](https://developer.apple.com/documentation/xcode/configuring-your-app-icon)
- [Apple: 従来形式のサイズ一覧（アーカイブ）](https://developer.apple.com/library/archive/qa/qa1686/_index.html)
