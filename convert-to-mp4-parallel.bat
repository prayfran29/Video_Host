@echo off
setlocal enabledelayedexpansion
echo Converting video files to MP4 (Parallel)...
echo.

REM Change to the videos directory
cd /d "D:\videos"

REM Create a list of all non-MP4 video files
echo Creating file list...
dir /s /b *.avi *.mkv *.mov *.wmv *.flv *.webm > video_list.txt 2>nul

REM Check if any files were found
if not exist video_list.txt (
    echo No video files found to convert.
    pause
    goto :eof
)

REM Process files in parallel batches of 4
set /a count=0
for /f "delims=" %%f in (video_list.txt) do (
    set /a count+=1
    set "file!count!=%%f"
    
    REM Process in batches of 4
    if !count! equ 4 (
        call :process_batch
        set /a count=0
    )
)

REM Process remaining files
if !count! gtr 0 call :process_batch

del video_list.txt
echo All conversions complete!
pause
goto :eof

:process_batch
for /l %%i in (1,1,%count%) do (
    set "output=!file%%i:~0,-4!.mp4"
    if not exist "!output!" (
        start /b cmd /c "ffmpeg -i "!file%%i!" -c:v libx264 -profile:v baseline -level 3.1 -c:a aac -b:a 128k -movflags +faststart+frag_keyframe+empty_moov -preset medium -crf 23 -r 30 -g 60 -keyint_min 60 -sc_threshold 0 "!output!" && del "!file%%i!" || echo Conversion failed for !file%%i!"
    )
)
REM Wait for batch to complete
:wait_loop
tasklist /fi "imagename eq ffmpeg.exe" 2>nul | find /i "ffmpeg.exe" >nul
if not errorlevel 1 (
    timeout /t 5 /nobreak >nul
    goto wait_loop
)
goto :eof