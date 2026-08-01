@echo off
echo ===================================
echo   Uploading Code to GitHub
echo ===================================
echo.

set /p commit_msg="Enter commit message (or press ENTER for default 'Update code'): "
if "%commit_msg%"=="" set commit_msg=Update code

echo.
echo [1/3] Adding changes...
git add .

echo [2/3] Committing changes...
git commit -m "%commit_msg%"

echo [3/3] Pushing to GitHub...
git push

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Git push failed! Please check your connection or git setup.
) else (
    echo.
    echo [SUCCESS] Code successfully pushed to GitHub!
)
echo.
pause
