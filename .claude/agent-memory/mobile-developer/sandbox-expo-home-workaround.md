---
name: sandbox-expo-home-workaround
description: expo CLI commands (expo install, expo customize, expo prebuild-check) fail with EROFS writing to ~/.expo cache in this sandbox; override HOME to a scratch dir
metadata:
  type: project
---

## `expo` CLI writes to `~/.expo/native-modules-cache` etc., which is read-only in this sandbox

Commands like `pnpm exec expo install <pkg>` or `pnpm exec expo customize tsconfig.json` fail with:

```
Error: EROFS: read-only file system, open '/home/<user>/.expo/native-modules-cache/....bin'
```

**Why:** the sandbox's real `$HOME` is not writable by the agent's Bash tool, but Expo CLI caches
native-module metadata and other state under `~/.expo/` unconditionally.

**How to apply:** override `HOME` to a scratch directory under `$TMPDIR` (and disable telemetry to
avoid an extra network call) for any `expo` CLI invocation in this sandbox:

```bash
mkdir -p "$TMPDIR/fakehome"
HOME="$TMPDIR/fakehome" EXPO_NO_TELEMETRY=1 pnpm exec expo install <pkg>
HOME="$TMPDIR/fakehome" EXPO_NO_TELEMETRY=1 pnpm exec expo customize tsconfig.json
```

This reproduced and was fixed this way for `expo-secure-store` install and typed-routes generation
during SS-10 (2026-07-26). Plain `pnpm exec expo customize tsconfig.json` (no HOME override) also
worked in some sessions — if it fails with EROFS, apply the HOME override; don't skip typed-routes
generation, since `tsc --noEmit` depends on `.expo/types/router.d.ts` existing (see
[[expo-router-app-structure]]).
