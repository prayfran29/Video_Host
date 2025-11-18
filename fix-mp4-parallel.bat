@echo off
setlocal enabledelayedexpansion
echo Re-encoding MP4 files for TV compatibility (Parallel)...
echo.

REM Change to the videos directory
cd /d "D:\videos"

REM Create a list of all MP4 files
echo Creating file list...
dir /s /b *.mp4 > mp4_list.txt

REM Process files in parallel batches of 4
set /a count=0
for /f "delims=" %%f in (mp4_list.txt) do (
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

del mp4_list.txt
echo All conversions complete!
pause
goto :eof

:process_batch
for /l %%i in (1,1,%count%) do (
    start /b cmd /c "ffmpeg -i "!file%%i!" -c:v libx264 -profile:v baseline -level 3.1 -c:a aac -ac 2 -b:a 128k -movflags +faststart+frag_keyframe+empty_moov -preset medium -crf 23 -r 30 -g 60 -keyint_min 60 -sc_threshold 0 -map 0:v:0 -map 0:a:0 -sn "!file%%i!_temp.mp4" && (move "!file%%i!_temp.mp4" "!file%%i!" || del "!file%%i!_temp.mp4") || del "!file%%i!_temp.mp4""
)
REM Wait for batch to complete
:wait_loop
tasklist /fi "imagename eq ffmpeg.exe" 2>nul | find /i "ffmpeg.exe" >nul
if not errorlevel 1 (
    timeout /t 5 /nobreak >nul
    goto wait_loop
)
goto :eof