@echo off
setlocal enabledelayedexpansion
echo Smart Video Optimizer - Analyzing and optimizing videos for streaming...
echo.

echo Checking for FFmpeg...
ffmpeg -version >nul 2>&1
if !errorlevel! neq 0 (
    echo ❌ FFmpeg not found! Please install FFmpeg and add it to PATH.
    echo Download from: https://ffmpeg.org/download.html
    pause
    exit /b 1
)
echo ✓ FFmpeg found

REM Detect GPU encoder
set "gpu_encoder=libx264"
set "gpu_preset=medium"
echo Detecting GPU encoders...

REM Check for NVIDIA NVENC
echo Checking NVIDIA NVENC...
ffmpeg -f lavfi -i testsrc2=duration=1:size=320x240:rate=1 -c:v h264_nvenc -f null - >nul 2>&1
if !errorlevel! equ 0 (
    echo ✓ NVIDIA NVENC detected
    set "gpu_encoder=h264_nvenc"
    set "gpu_preset=p4"
    goto gpu_found
)

REM Check for AMD AMF
echo Checking AMD AMF...
ffmpeg -f lavfi -i testsrc2=duration=1:size=320x240:rate=1 -c:v h264_amf -f null - >nul 2>&1
if !errorlevel! equ 0 (
    echo ✓ AMD AMF detected
    set "gpu_encoder=h264_amf"
    set "gpu_preset=balanced"
    goto gpu_found
)

REM Check for Intel QuickSync
echo Checking Intel QuickSync...
ffmpeg -f lavfi -i testsrc2=duration=1:size=320x240:rate=1 -c:v h264_qsv -f null - >nul 2>&1
if !errorlevel! equ 0 (
    echo ✓ Intel QuickSync detected
    set "gpu_encoder=h264_qsv"
    set "gpu_preset=medium"
    goto gpu_found
)

echo ⚠️ No GPU encoder found, using CPU encoding

:gpu_found
echo Using encoder: !gpu_encoder!
echo.

echo Checking if D:\videos exists...
if not exist "D:\videos" (
    echo ❌ Directory D:\videos does not exist!
    echo Creating directory D:\videos...
    mkdir "D:\videos" 2>nul
    if !errorlevel! neq 0 (
        echo ❌ Failed to create D:\videos directory
        echo Please create the directory manually or change the path in the script
        pause
        exit /b 1
    )
    echo ✓ Directory created
)

cd /d "D:\videos"
if !errorlevel! neq 0 (
    echo ❌ Cannot access videos directory: D:\videos
    pause
    exit /b 1
)
echo ✓ Successfully accessed D:\videos

REM Check if needs_conversion.txt exists and count files
set "needs_file=D:\videos\needs_conversion.txt"
set "total_to_convert=0"
if exist "!needs_file!" (
    for /f %%i in ('type "!needs_file!" ^| find /c /v ""') do set "total_to_convert=%%i"
    echo ✓ Found conversion list: !total_to_convert! files need optimization
) else (
    echo ⚠️ No needs_conversion.txt found - will analyze all files
)
echo.

set "processed=0"
set "optimized=0"
set "errors=0"
set "completed_file=D:\videos\video_optimizer_completed.dat"

echo Searching for video files...
echo.

for /r %%f in (*.mp4 *.avi *.mkv *.mov *.wmv *.flv *.webm) do (
    if exist "%%f" (
        REM Check if this file was already completed
        set "skip_file=0"
        if exist "!completed_file!" (
            findstr /I /C:"%%f" "!completed_file!" >nul 2>&1
            if !errorlevel! equ 0 (
                set "skip_file=1"
            )
        )
        
        if !skip_file! equ 0 (
            set /a "processed+=1"
            set "input=%%f"
            set "needs_optimization=0"
            
            echo Analyzing: %%~nxf
            
            REM Check if file needs optimization using ffprobe
            ffprobe -v quiet -select_streams v:0 -show_entries stream=codec_name,profile,level,bit_rate,width,height -of csv=p=0 "!input!" > temp_video.txt
            ffprobe -v quiet -select_streams a:0 -show_entries stream=codec_name,bit_rate,channels -of csv=p=0 "!input!" > temp_audio.txt
            ffprobe -v quiet -show_entries format=bit_rate -of csv=p=0 "!input!" > temp_format.txt
            
            REM Read video info
            set /p video_info=<temp_video.txt
            set /p audio_info=<temp_audio.txt
            set /p format_info=<temp_format.txt
            
            REM Check video codec (not h264)
            echo !video_info! | findstr /i "h264" >nul
            if !errorlevel! neq 0 (
                echo   → Video codec not H.264
                set "needs_optimization=1"
            )
            
            REM Check audio codec (not aac)
            echo !audio_info! | findstr /i "aac" >nul
            if !errorlevel! neq 0 (
                echo   → Audio codec not AAC
                set "needs_optimization=1"
            )
            
            REM Check if audio has more than 2 channels
            for /f "tokens=2 delims=," %%c in ("!audio_info!") do (
                if %%c gtr 2 (
                    echo   → Audio has more than 2 channels
                    set "needs_optimization=1"
                )
            )
            
            REM Check bitrate (over 5Mbps)
            for /f "tokens=1" %%b in ("!format_info!") do (
                if %%b gtr 5000000 (
                    echo   → Bitrate too high: %%b bps
                    set "needs_optimization=1"
                )
            )
            
            REM Check resolution (over 1080p)
            for /f "tokens=4,5 delims=," %%w in ("!video_info!") do (
                if %%w gtr 1920 (
                    echo   → Width too high: %%w
                    set "needs_optimization=1"
                )
                if %%h gtr 1080 (
                    echo   → Height too high: %%h
                    set "needs_optimization=1"
                )
            )
            
            del temp_*.txt 2>nul
            
            if !needs_optimization! equ 1 (
                echo   → Optimizing video...
                set "temp=%%~dpnf_temp.mp4"
                
                REM Create backup before optimization
                set "backup=%%~dpnf_backup%%~xf"
                copy "!input!" "!backup!" >nul
                
                REM Use appropriate GPU encoder with proper streaming/TV settings
                if "!gpu_encoder!"=="h264_nvenc" (
                    ffmpeg -i "!input!" -c:v h264_nvenc -preset !gpu_preset! -profile:v main -level 4.0 -rc vbr -cq 23 -maxrate 4M -bufsize 8M -vf "scale='min(1920,iw)':'min(1080,ih)'" -c:a aac -ac 2 -ar 48000 -b:a 128k -movflags +faststart -map 0:v:0 -map 0:a:0? -sn "!temp!" -y
                ) else if "!gpu_encoder!"=="h264_amf" (
                    ffmpeg -i "!input!" -c:v h264_amf -quality !gpu_preset! -profile:v main -level 4.0 -rc cqp -qp_i 23 -qp_p 23 -maxrate 4M -bufsize 8M -vf "scale='min(1920,iw)':'min(1080,ih)'" -c:a aac -ac 2 -ar 48000 -b:a 128k -movflags +faststart -map 0:v:0 -map 0:a:0? -sn "!temp!" -y
                ) else if "!gpu_encoder!"=="h264_qsv" (
                    ffmpeg -i "!input!" -c:v h264_qsv -preset !gpu_preset! -profile:v main -level 4.0 -global_quality 23 -maxrate 4M -bufsize 8M -vf "scale='min(1920,iw)':'min(1080,ih)'" -c:a aac -ac 2 -ar 48000 -b:a 128k -movflags +faststart -map 0:v:0 -map 0:a:0? -sn "!temp!" -y
                ) else (
                    ffmpeg -i "!input!" -c:v libx264 -profile:v main -level 4.0 -preset medium -crf 23 -maxrate 4M -bufsize 8M -vf "scale='min(1920,iw)':'min(1080,ih)'" -c:a aac -ac 2 -ar 48000 -b:a 128k -movflags +faststart -map 0:v:0 -map 0:a:0? -sn "!temp!" -y
                )
                
                if !errorlevel! equ 0 (
                    REM Verify the output file is valid
                    ffprobe -v quiet "!temp!" >nul 2>&1
                    if !errorlevel! equ 0 (
                        del "!input!"
                        REM Rename to .mp4 extension
                        set "finalname=%%~dpnf.mp4"
                        ren "!temp!" "%%~nf.mp4"
                        del "!backup!"
                        echo   ✓ Video optimized
                        set /a "optimized+=1"
                    ) else (
                        echo   ❌ Output file corrupted, restoring backup
                        del "!temp!"
                        move "!backup!" "!input!" >nul
                        set /a "errors+=1"
                    )
                ) else (
                    echo   ❌ Failed to optimize, restoring backup
                    if exist "!temp!" del "!temp!"
                    move "!backup!" "!input!" >nul
                    set /a "errors+=1"
                )
            ) else (
                echo   ✓ Already optimized
            )
            
            REM Add to completed list
            if exist "!completed_file!" (
                echo %%f>>"!completed_file!"
            ) else (
                echo %%f>"!completed_file!"
            )
            
            echo.
        )
    )
)

echo.
if !processed! equ 0 (
    echo ⚠️ No video files found in D:\videos
    echo Please add video files to the directory and run again
)

echo ==========================================
echo Smart optimization complete!
echo Files processed: !processed!
echo Files optimized: !optimized!
echo Errors: !errors!
echo ==========================================

pause