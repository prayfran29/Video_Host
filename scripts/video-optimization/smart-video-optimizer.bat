@echo off
setlocal enabledelayedexpansion
echo Smart Video Optimizer - Analyzing and optimizing videos for streaming...
echo.

REM Check if ffmpeg is available
ffmpeg -version >nul 2>&1
if !errorlevel! neq 0 (
    echo ❌ FFmpeg not found! Please install FFmpeg and add it to PATH.
    pause
    exit /b 1
)

cd /d "D:\videos"
if !errorlevel! neq 0 (
    echo ❌ Cannot access videos directory: D:\videos
    pause
    exit /b 1
)

set "processed=0"
set "optimized=0"
set "errors=0"

for /r %%f in (*.mp4 *.avi *.mkv *.mov *.wmv *.flv *.webm) do (
    if exist "%%f" (
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
        
        REM Check video codec (not h264 baseline)
        echo !video_info! | findstr /i "h264" >nul
        if !errorlevel! neq 0 set "needs_optimization=1"
        
        REM Check audio codec (not aac) and channels (not stereo)
        echo !audio_info! | findstr /i "aac" >nul
        if !errorlevel! neq 0 set "needs_optimization=1"
        
        REM Check if audio has more than 2 channels
        for /f "tokens=3 delims=," %%c in ("!audio_info!") do (
            if %%c gtr 2 set "needs_optimization=1"
        )
        
        REM Check bitrate (over 5Mbps)
        for /f "tokens=1" %%b in ("!format_info!") do (
            if %%b gtr 5000000 set "needs_optimization=1"
        )
        
        REM Check resolution (over 1080p)
        for /f "tokens=4,5 delims=," %%w in ("!video_info!") do (
            if %%w gtr 1920 set "needs_optimization=1"
            if %%h gtr 1080 set "needs_optimization=1"
        )
        
        del temp_*.txt 2>nul
        
        if !needs_optimization! equ 1 (
            echo   → Needs optimization
            set "temp=%%~dpnf_temp.mp4"
            
            REM Create backup before optimization
            set "backup=%%~dpnf_backup%%~xf"
            copy "!input!" "!backup!" >nul
            
            ffmpeg -i "!input!" -c:v libx264 -profile:v main -level 4.0 -preset medium -crf 23 -maxrate 4M -bufsize 8M -vf "scale='min(1920,iw)':'min(1080,ih)'" -c:a aac -ac 2 -b:a 128k -movflags +faststart -map 0:v:0 -map 0:a:0 -sn "!temp!" -y
            
            if !errorlevel! equ 0 (
                REM Verify the output file is valid
                ffprobe -v quiet "!temp!" >nul 2>&1
                if !errorlevel! equ 0 (
                    del "!input!"
                    REM Rename to .mp4 extension
                    set "finalname=%%~dpnf.mp4"
                    ren "!temp!" "%%~nf.mp4"
                    del "!backup!"
                    echo   ✓ Optimized and converted to MP4
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
            echo   ✓ Codec and quality already optimized
        )
        
        REM Always check and apply faststart for MP4 files
        if /i "%%~xf"==".mp4" (
            echo   → Checking faststart optimization...
            
            REM Check if moov atom is at the beginning
            ffprobe -v quiet -show_entries format_tags=major_brand -of csv=p=0 "!input!" >nul 2>&1
            
            set "temp=%%~dpnf_faststart.mp4"
            ffmpeg -i "!input!" -c copy -movflags +faststart "!temp!" -y 2>nul
            
            if !errorlevel! equ 0 (
                REM Check if file size changed (indicates faststart was needed)
                for %%a in ("!input!") do set "size1=%%~za"
                for %%a in ("!temp!") do set "size2=%%~za"
                
                if !size1! neq !size2! (
                    REM Verify the output file is valid
                    ffprobe -v quiet "!temp!" >nul 2>&1
                    if !errorlevel! equ 0 (
                        del "!input!"
                        ren "!temp!" "%%~nxf"
                        echo   ✓ Applied faststart optimization
                        set /a "optimized+=1"
                    ) else (
                        echo   ❌ Faststart output corrupted
                        del "!temp!"
                        set /a "errors+=1"
                    )
                ) else (
                    del "!temp!"
                    echo   ✓ Already has faststart
                )
            ) else (
                if exist "!temp!" del "!temp!"
                echo   ⚠ Could not apply faststart
            )
        )
        echo.
    )
)

echo.
echo ==========================================
echo Smart optimization complete!
echo Files processed: !processed!
echo Files optimized: !optimized!
echo Errors: !errors!
echo ==========================================
pause