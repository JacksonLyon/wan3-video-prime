# 把本仓库安装为 DSH 技能：%USERPROFILE%\.dsh\skills\wan3-video-prime
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE ".dsh" }
$dest = Join-Path $dshHome "skills\wan3-video-prime"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Recurse -Force (Join-Path $here "SKILL.md") $dest
Copy-Item -Recurse -Force (Join-Path $here "scripts") $dest
Copy-Item -Recurse -Force (Join-Path $here "references") $dest
Write-Host "已安装到 $dest"
Write-Host "下一步：新开一个 DSH 会话，然后运行 node `"$dest\scripts\wan_prime.mjs`" check"
