@echo off
setlocal enabledelayedexpansion
echo Converting video files to MP4...
echo.

REM Change to the videos directory
cd /d "D:\videos"

REM Loop through all subdirectories and convert non-MP4 video files
for /r %%d in (*.avi *.mkv *.mov *.wmv *.flv *.webm) do (
    if exist "%%d" (
        echo Converting: %%d
        set "output=%%~dpnd.mp4"
        
        REM Check if MP4 version already exists
        if not exist "!output!" (
            ffmpeg -i "%%d" -c:v libx264 -profile:v baseline -level 3.1 -c:a aac -ac 2 -b:a 128k -movflags +faststart+frag_keyframe+empty_moov -preset medium -crf 23 -r 30 -g 60 -keyint_min 60 -sc_threshold 0 -map 0:v:0 -map 0:a:0 -sn "!output!"
            
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