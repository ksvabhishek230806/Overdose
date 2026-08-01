@echo off
echo ===================================
echo   Deploying Code to Firebase Hosting
echo ===================================
echo.

echo Running Firebase deployment...
call firebase deploy

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Firebase deployment failed!
    echo.
    set /p relogin="It looks like you need to log in. Log in to Firebase now? (Y/N): "
    if /i "%relogin%"=="Y" (
        echo.
        echo Opening Firebase Login in your browser...
        call firebase login
        echo.
        echo Retrying deployment...
        call firebase deploy
    )
) else (
    echo.
    echo [SUCCESS] Firebase deployment completed successfully!
)
echo.
pause
