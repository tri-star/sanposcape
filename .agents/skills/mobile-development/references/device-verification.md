# 端末での確認

正本は [起動ガイド](../../../../packages/mobile/docs/app-startup-guide.md)、iPhoneなら [実機手順](../../../../packages/mobile/docs/iphone-device-development.md)。

- `bash scripts/mobile-tools/dev-doctor.sh` で現状を診断する。
- Android起動は [android-emulator](../../android-emulator/SKILL.md)。同じAVDを二重起動しない。
- `bash scripts/mobile-tools/dev-up.sh` でbackend・転送・Metro・development buildを整える。対象環境とスクリプトを先に確認する。
- UI操作・歩行シミュレーションはscripts/mobile-tools内のhelp/実装を確認して使う。
- エミュレータ再起動でadb reverseが消える点、Metroとdevelopment buildが未接続の場合に注意する。
- fake/mockでの検証と実サービスでの検証を区別する。
- Claude固有sandbox設定はCodexに引き継がれない。権限・接続エラーは実際の結果で診断する。

操作、期待値、結果、画面等の証拠は対象課題の作業メモへ残す。
