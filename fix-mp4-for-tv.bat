@echo off
setlocal enabledelayedexpansion
echo Re-encoding MP4 files for TV compatibility...
echo.

REM Change to the videos directory
cd /d "D:\videos"

REM Loop through all MP4 files and re-encode them
for /r %%d in (*.mp4) do (
    if exist "%%d" (
        echo Processing: %%d
        set "temp=%%~dpnd_temp.mp4"
        
        ffmpeg -i "%%d" -c:v libx264 -profile:v baseline -level 3.1 -c:a aac -b:a 128k -movflags +faststart+frag_keyframe+empty_moov -preset medium -crf 23 -r 30 -g 60 -keyint_min 60 -sc_threshold 0 "!temp!"
        
        REM Replace original if conversion was successful
        if !errorlevel! equ 0 (
            echo Re-encoding successful, replacing original
            del "%%d"
            ren "!temp!" "%%~nxd"
        ) else (
            echo Re-encoding failed for: %%d
            if exist "!temp!" del "!temp!"
        )
        echo.
    )
)

echo Re-encoding complete!
pause