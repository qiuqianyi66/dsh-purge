# 给 install.cmd 用：找正在运行 / 已安装的 DSH 内置 Node，输出第一行路径。
# 运行中的进程优先；没运行就查卸载注册表的 InstallLocation / DisplayIcon；
# 最后查两个默认安装目录。找不到不输出，交给 install.cmd 继续走 PATH。
$ErrorActionPreference = 'SilentlyContinue'

$exes = @()
$exes += Get-Process 'DeepSeek Harness' | Where-Object { $_.Path } | ForEach-Object { $_.Path }

$keys = @(
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$item = Get-ItemProperty $keys | Where-Object { $_.DisplayName -like '*DeepSeek Harness*' } | Select-Object -First 1
if ($item) {
  if ($item.InstallLocation) {
    $exes += (Join-Path $item.InstallLocation 'DeepSeek Harness.exe')
  }
  if ($item.DisplayIcon) {
    $exes += ($item.DisplayIcon -replace '",?.*$', '' -replace '"', '')
  }
}

$exes += Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\DeepSeek Harness.exe'
$exes += Join-Path $env:ProgramFiles 'DeepSeek Harness\DeepSeek Harness.exe'

foreach ($exe in $exes) {
  if (-not $exe) { continue }
  $node = Join-Path (Split-Path -Parent $exe) 'resources\runtime\primary-runtime\dependencies\node\bin\node.exe'
  if (Test-Path -LiteralPath $node) {
    Write-Output $node
    exit 0
  }
}
exit 0
