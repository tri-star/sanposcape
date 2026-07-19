/**
 * アプリのエントリポイント。
 * Expo Router を読み込む前に Unistyles の設定を初期化する必要があるため、
 * expo-router/entry ではなくこのファイルを main に指定している。
 */
import "./src/theme/unistyles";

import "expo-router/entry";
