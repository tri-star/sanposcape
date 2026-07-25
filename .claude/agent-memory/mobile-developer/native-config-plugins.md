---
name: native-config-plugins
description: react-native-nitro-google-signin's Expo config plugin unconditionally requires iosUrlScheme (or Firebase files), even for Android-only development
metadata:
  type: project
---

## `react-native-nitro-google-signin` config plugin fails hard without `iosUrlScheme`

Adding `"react-native-nitro-google-signin"` (bare, no options) to `app.json`'s `expo.plugins` makes
**every** `expo` config-evaluating command fail — `expo customize tsconfig.json`, `expo prebuild`,
`expo start`, fingerprint computation, EAS builds — regardless of target platform:

```
Error: react-native-nitro-google-signin config plugin: configure either:
  • Firebase: set expo.ios.googleServicesFile & expo.android.googleServicesFile, ...
  • Without Firebase: pass iosUrlScheme (REVERSED_CLIENT_ID) in plugin options
```

**Why:** `plugin/withNitroGoogleSignIn.js` validates `options.iosUrlScheme` (or Firebase service
files) unconditionally in `withNitroGoogleSignInRoot`, before branching on platform. There is no
"Android only" escape hatch in the plugin itself — despite this being a very reasonable thing to
want during incremental rollout (SS-10, 2026-07-26: iOS OAuth client not yet created, Android-first
development).

**How to apply:** when the iOS OAuth client ID isn't available yet, pass a clearly-marked
placeholder that satisfies the plugin's prefix validation (`com.googleusercontent.apps.`) instead of
omitting the plugin entirely (omitting it would mean CocoaPods config for iOS never gets wired up,
and re-adding it later changes the fingerprint again):

```json
["react-native-nitro-google-signin", { "iosUrlScheme": "com.googleusercontent.apps.REPLACE_WITH_IOS_CLIENT_ID" }]
```

Document prominently (e.g. in `docs/local-env.md`) that this must be replaced with the real iOS
client's reversed ID once that OAuth client is created — otherwise iOS builds will silently carry a
bogus URL scheme.
