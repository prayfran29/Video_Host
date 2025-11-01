@echo off
setlocal enabledelayedexpansion
echo Converting video files to MP4...
echo.

REM Change to the videos directory
cd /d "%~dp0videos"

REM Loop through all subdirectories and convert non-MP4 video files
for /r %%d in (*.avi *.mkv *.mov *.wmv *.flv *.webm) do (
    if exist "%%d" (
        echo Converting: %%d
        set "output=%%~dpnd.mp4"
        
        REM Check if MP4 version already exists
        if not exist "!output!" (
            ffmpeg -i "%%d" -c:v libx264 -c:a aac -preset medium -crf 23 "!output!"
            
            REM Only delete original if conversion was successful
            if !errorlevel! equ 0 (
                echo Conversion successful, removing original file
                del "%%d"
            ) else (
                echo Conversion failed for: %%d
            )
        ) else (
            echo MP4 version already exists: !output!
        )
        echo.
    )
)

echo Conversion complete!
pause