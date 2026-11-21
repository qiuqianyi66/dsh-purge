@echo off
setlocal EnableExtensions
chcp 65001 >nul
set "ROOT=%~dp0"
set "NODE="
set "DSHEXE="

rem 1) 已安装 / 正在运行的 DSH：复用它的内置 Node，用户不需要自己装 Node
for /f "usebackq delims=" %%P in (`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%ROOT%scripts\find-dsh-node.ps1"`) do set "NODE=%%P"

rem 2) PATH 里的 node
if not defined NODE for /f "delims=" %%N in ('where node 2^>nul') do if not defined NODE set "NODE=%%N"

rem 3) 常见安装位置
if not defined NODE if exist "%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe" set "NODE=%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe"
if not defined NODE if exist "%ProgramFiles%\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe" set "NODE=%ProgramFiles%\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe"
if not defined NODE if exist "D:\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe" set "NODE=D:\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe"

if not defined NODE (
  echo.
  echo [dsh-purge] 没找到 Node。请先打开一次 DeepSeek Harness，再双击本文件；
  echo            或安装 Node.js 18+ 后重试。
  echo.
  pause
  exit /b 1
)

rem 4) 版本校验：PATH 里的旧 node（<18）在这里拦住，别等到运行时才报错
"%NODE%" -e "process.exit(+process.versions.node.split('.')[0]>=18?0:1)" >nul 2>nul
if errorlevel 1 (
  echo.
  echo [dsh-purge] Node 版本太旧，需要 18 或更新版本：
  "%NODE%" -v
  echo            请打开一次 DeepSeek Harness 用它的内置 Node，或安装 Node 18+ 后重试。
  echo.
  pause
  exit /b 1
)
echo.
echo dsh-purge 一键安装
echo   Node: %NODE%
echo.
"%NODE%" "%ROOT%bin\dsh-purge.js" --install %*
set "CODE=%ERRORLEVEL%"
echo.
if not "%CODE%"=="0" (
  echo [dsh-purge] 安装没有完成。上面的原因已翻译成人话；
  echo            详细步骤见 README 第 4 节，或运行 --diagnose 导出状态。
) else (
  echo [dsh-purge] 安装流程结束。DSH 重启后，会话标题旁会出现 dsh-purge 按钮。
  echo            第一次用请先看面板里的用户须知，不会自动改宿主。
)
echo.
pause
exit /b %CODE%
