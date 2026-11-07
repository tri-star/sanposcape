---
name: adb-server-wedged-after-handover
description: 並行 worktree でエミュレータを引き継いだ直後、Windows 側の adb サーバーが固まり dev-up.sh が「起動中」で止まる。adb.exe devices も kill-server も返らないので、powershell の Stop-Process で adb.exe を止めると直る
metadata:
  type: feedback
  scope: task-local
  source_issue: SS-192
---

ほかの worktree の Claude からエミュレータのロックを引き継いで `dev-up.sh` を走らせたら、「1/5 エミュレータ」の「起動中」から10分以上進まなかった（SS-192、2026-11-07）。

- エミュレータ本体は動いていた（`powershell.exe Get-Process emulator*,qemu*` に前の人が起動したプロセスがある）。
- `adb.exe devices`・`adb.exe kill-server` はどちらも 40 秒たっても返らず、`localhost:5037` への TCP 接続もタイムアウトした。adb サーバー（Windows 側の `adb.exe`）が固まっていた。
  `dev-up.sh` は端末が 0 台と判定し、エミュレータの起動待ちを続けていた。

**How to apply:**
- `dev-up.sh` が「起動中」で数分止まったら、まず `powershell.exe Get-Process emulator*,qemu*` でエミュレータが動いているかを見る。動いているのに `adb.exe devices` が返らなければ、adb サーバーが固まっている。
- `powershell.exe -NoProfile -Command "Get-Process adb | Select Id,StartTime"` で ID を確かめ、`Stop-Process -Id <id> -Force` で止める。次の `adb.exe devices` がサーバーを起動し直し、`offline` → `device` になる。
  待っていた `dev-up.sh` はそのまま先へ進む（止めて走らせ直さなくてよい）。
- adb サーバーはマシンに1つなので、止めるのはロックを持っているときだけにする。
- `pkill -f "expo start --dev-client"` を同じコマンドの中で実行すると、自分のシェルのコマンド行にも一致して終了コード 144 で落ちる。Metro は止まるので、ロックの解放は別のコマンドで行う。

関連: [[sandbox-and-tooling]]（Metro とエミュレータは worktree 間で共有）
