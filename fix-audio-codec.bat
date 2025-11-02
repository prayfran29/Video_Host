@echo off
setlocal enabledelayedexpansion
echo MP4 Audio Codec Fix Script
echo ==========================

REM Check if ffmpeg is available
ffmpeg -version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: FFmpeg not found. Please install FFmpeg first.
    pause
    exit /b 1
)

set "input_dir=videos\Anime\Danny Phantom"

if not exist "%input_dir%" (
    echo Danny Phantom directory not found at: %input_dir%
    pause
    exit /b 1
)

echo.
echo Fixing audio codecs in Danny Phantom MP4 files
echo This will create fixed versions with _fixed suffix
echo.

for /r "%input_dir%" %%f in (*.mp4) do (
    echo Checking: %%f
    
    REM Check if audio codec is not AAC
    ffprobe -v quiet -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "%%f" > temp_codec.txt
    set /p audio_codec=<temp_codec.txt
    del temp_codec.txt
    
    if not "!audio_codec!"=="aac" (
        echo Audio codec: !audio_codec! - Converting to AAC
        set "output=%%~dpnf_fixed.mp4"
        
        REM Convert audio to AAC, keep video as-is
        ffmpeg -i "%%f" -c:v copy -c:a aac -b:a 128k -movflags +faststart -y "!output!"
        
        if !errorlevel! equ 0 (
            echo Successfully fixed: %%~nxf
        ) else (
            echo Failed to fix: %%~nxf
        )
    ) else (
        echo Audio codec: AAC - No conversion needed
    )
    echo.
)

echo.
echo Audio codec fix complete!
pause