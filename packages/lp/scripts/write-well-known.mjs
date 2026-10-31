// ビルド後に dist/.well-known/ を書く（SS-250。地図の招待リンクの Universal Links / App Links）。
// 値は環境（PUBLIC_LP_ENV）ごとに違うので、public/ に置かずビルド時に出し分ける。
// - apple-app-site-association: 拡張子が無いので、lp-deploy.yml で Content-Type: application/json を付けて上げる。
// - assetlinks.json: 署名証明書の SHA-256 がある環境だけ出す（本番の Android はストアの準備ができてから足す）。
// どちらも公開する前提の識別子で、秘密ではない（Team ID は AASA に、SHA-256 は APK にも載っている）。
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APPLE_TEAM_ID = "F946L3T4HH";

// アプリ識別子は packages/mobile の app.json（開発用）と app.config.ts の PRODUCTION_VARIANT（本番）と同じ値。
const TARGETS = {
  production: {
    iosAppId: `${APPLE_TEAM_ID}.com.sanposcape.app`,
    androidPackage: "com.sanposcape.app",
    // 本番の署名証明書（EAS の本番 keystore・Play App Signing）は未取得。取得したら足す。
    androidSha256: [],
  },
  development: {
    iosAppId: `${APPLE_TEAM_ID}.com.sanposcape.app.dev`,
    androidPackage: "com.sanposcape.app.dev",
    // EAS が管理する開発用の keystore（development プロファイル）。
    androidSha256: [
      "F3:43:A5:D4:64:82:36:EB:5F:54:0A:6D:A3:AC:6F:E5:E2:94:6C:8C:92:86:1E:83:E6:2D:9A:5D:D0:31:CC:FA",
    ],
  },
};

const env = process.env.PUBLIC_LP_ENV ?? "development";
const target = TARGETS[env];
if (!target) {
  throw new Error(
    `Unknown PUBLIC_LP_ENV "${env}". Expected "production" or "development".`,
  );
}

const dist = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
  ".well-known",
);
mkdirSync(dist, { recursive: true });

// 招待のページ（/i/。トークンは fragment）だけを対象にし、LP の他のページはブラウザで開く。
const aasa = {
  applinks: {
    details: [
      {
        appIDs: [target.iosAppId],
        components: [{ "/": "/i/", comment: "地図の招待リンク（SS-250）" }],
      },
    ],
  },
};
writeFileSync(
  join(dist, "apple-app-site-association"),
  `${JSON.stringify(aasa, null, 2)}\n`,
);

if (target.androidSha256.length > 0) {
  const assetlinks = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: target.androidPackage,
        sha256_cert_fingerprints: target.androidSha256,
      },
    },
  ];
  writeFileSync(
    join(dist, "assetlinks.json"),
    `${JSON.stringify(assetlinks, null, 2)}\n`,
  );
}

console.log(`wrote .well-known for ${env}`);
