@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Git: update and push

REM Always run from the folder where this .bat lives (fixes double-click / shortcuts).
cd /d "%~dp0" || (
  echo [ERROR] Could not cd to script folder: %~dp0
  goto :finish_error
)

echo ========================================
echo  Git push - %CD%
echo ========================================
echo.

REM 0) require Git
git --version >NUL 2>&1
IF ERRORLEVEL 1 (
  echo [ERROR] Git is not installed or not in PATH.
  echo Install Git for Windows and reopen this window.
  goto :finish_error
)

REM 1) optional arg: remote url
set "REMOTE_URL=%~1"

REM 2) ensure we're in a git repo (or init if URL given)
IF NOT EXIST ".git" (
  IF "%REMOTE_URL%"=="" (
    echo [ERROR] No .git in this folder: %CD%
    echo Run from the project root, or pass repo URL:
    echo   update_and_push.bat https://github.com/USER/REPO.git
    goto :finish_error
  )
  echo [INIT] No .git found. Initializing new repo on branch 'main' and setting origin...
  git init -b main || (echo [ERROR] git init failed & goto :finish_error)
  git remote add origin "%REMOTE_URL%" || (echo [ERROR] adding origin failed & goto :finish_error)
)

REM 3) make sure we have a branch name; prefer current, else create/checkout main
set "BR="
for /f "delims=" %%B in ('git rev-parse --abbrev-ref HEAD 2^>NUL') do set "BR=%%B"
IF "%BR%"=="" (
  set "BR=main"
  git checkout -B "%BR%" >NUL 2>&1
)

REM 4) if origin missing but URL was provided, set it
set "HASREMOTE="
for /f "delims=" %%R in ('git remote 2^>NUL') do set "HASREMOTE=1"
IF NOT DEFINED HASREMOTE (
  IF "%REMOTE_URL%"=="" (
    echo [ERROR] No remote configured. Pass repo URL:
    echo   update_and_push.bat https://github.com/USER/REPO.git
    goto :finish_error
  )
  git remote add origin "%REMOTE_URL%" || (echo [ERROR] adding origin failed & goto :finish_error)
)

echo [1/3] git add -A
git add -A
IF ERRORLEVEL 1 (
  echo [ERROR] git add failed.
  goto :finish_error
)

REM Stale lock files (e.g. after a crashed Git, Cursor sync, or antivirus) block commit.
IF EXIST ".git\HEAD.lock" (
  echo [WARN] Removing stale .git\HEAD.lock
  del /f /q ".git\HEAD.lock" 2>NUL
)
IF EXIST ".git\index.lock" (
  echo [WARN] Removing stale .git\index.lock
  del /f /q ".git\index.lock" 2>NUL
)

echo [2/3] git commit (allow-empty)
set "MSG=update %date% %time%"
git commit -m "%MSG%" --allow-empty
IF ERRORLEVEL 1 (
  echo [ERROR] git commit failed.
  echo If you see HEAD.lock / index.lock: close other Git tools ^(Cursor, Git GUI^), run this script again.
  echo If you see user identity:  git config user.email "you@example.com"
  echo                              git config user.name "Your Name"
  goto :finish_error
)

echo [3/3] git push
git push
IF ERRORLEVEL 1 (
  echo Retrying with upstream: git push -u origin "%BR%" ...
  git push -u origin "%BR%"
  IF ERRORLEVEL 1 (
    echo [ERROR] Push failed. Check network, branch, and GitHub login / token.
    goto :finish_error
  )
)

echo.
echo [OK] Pushed from "%CD%" branch "%BR%".
goto :finish_ok

:finish_error
echo.
pause
exit /b 1

:finish_ok
echo.
pause
exit /b 0
