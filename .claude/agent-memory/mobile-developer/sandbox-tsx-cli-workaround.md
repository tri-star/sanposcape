---
name: sandbox-tsx-cli-workaround
description: tsx CLI binary fails with EPERM on IPC socket inside this sandboxed Bash tool; use `node --import tsx` instead for local verification
metadata:
  type: project
---

Running the `tsx` CLI directly (e.g. `tsx scripts/generate-tokens.ts`, or via a pnpm script like
`pnpm --filter mobile design:tokens` which shells out to `tsx ...`) fails inside this agent's
sandboxed Bash tool with:

```
Error: listen EPERM: operation not permitted /tmp/claude-.../tsx-.../NN.pipe
    at Server.setupListenHandle [as _listen2] (node:net:1917:21)
    ...
    at createIpcServer (.../tsx/dist/cli.mjs:...)
```

**Why:** the `tsx` CLI wrapper opens a Unix domain socket (IPC channel) as part of its startup,
and the sandbox's filesystem/network restrictions deny the `listen()` syscall for that socket
path under `$TMPDIR`. This reproduced consistently when verifying
`packages/mobile/scripts/generate-tokens.ts` (SS-1 Phase 0, 2026-07-20). It appears to be an
artifact of this sandboxed tool environment, not a problem with the script or `tsx` itself — the
same `"design:tokens": "tsx scripts/generate-tokens.ts"` npm script should work fine in a normal
shell / CI (GitHub Actions) where this sandbox restriction doesn't apply, so **do not change the
package.json script to work around this** — only work around it for local agent-side verification.

**How to apply:** when you need to actually execute a `tsx <file>.ts` script from within this
sandbox (e.g. to verify a codegen script works end-to-end, check idempotency, etc.), run it via
the Node loader instead of the `tsx` CLI binary:

```
pnpm --filter <package> exec node --import tsx <path-to-script>.ts
```

This avoids the IPC server entirely and behaves the same as the CLI for a one-shot script (no
watch mode). Note `execFileSync("oxfmt", ...)` (or other bare-command child-process calls) inside
such scripts only resolves via `PATH` when invoked through `pnpm exec` / a pnpm script — running
`node --import tsx ...` directly (without `pnpm exec`) will not have `node_modules/.bin` on
`PATH` and will fail with `ENOENT` for those subprocess calls.
