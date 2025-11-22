@echo off
setlocal enabledelayedexpansion
echo Bulletproof Video Scanner - Analyzing video collection...
echo.

REM Check FFmpeg
ffmpeg -version >nul 2>&1
if !errorlevel! neq 0 (
    echo ❌ FFmpeg not found! Install FFmpeg first.
    pause
    exit /b 1
)

REM Setup
cd /d "D:\videos" 2>nul
if !errorlevel! neq 0 (
    echo ❌ Cannot access D:\videos
    pause
    exit /b 1
)

set "scan_results=D:\videos\scan_results.txt"
set "needs_conversion=D:\videos\needs_conversion.txt"
set "total_files=0"
set "needs_work=0"
set "scan_errors=0"

echo Scan Results - %date% %time% > "!scan_results!"
echo. >> "!scan_results!"
echo Files Needing Conversion: > "!needs_conversion!"
echo. >> "!needs_conversion!"

echo Scanning all video files...
echo.

for /r %%f in (*.mp4 *.avi *.mkv *.mov *.wmv *.flv *.webm *.m4v *.3gp *.ts *.mts) do (
    if exist "%%f" (
        set /a "total_files+=1"
        set "file_needs_work=0"
        set "reasons="
        
        echo [!total_files!] Checking: %%~nxf
        echo [!total_files!] File: %%f >> "!scan_results!"
        
        REM Get video info - suppress all errors
        ffprobe -v quiet -select_streams v:0 -show_entries stream=codec_name,profile,width,height -of csv=p=0 "%%f" > temp_v.txt 2>nul
        ffprobe -v quiet -select_streams a:0 -show_entries stream=codec_name,channels -of csv=p=0 "%%f" > temp_a.txt 2>nul
        ffprobe -v quiet -show_entries format=bit_rate -of csv=p=0 "%%f" > temp_f.txt 2>nul
        
        REM Check if ffprobe worked
        if exist temp_v.txt (
            set /p video_data=<temp_v.txt 2>nul
        ) else (
            set "video_data="
        )
        
        if exist temp_a.txt (
            set /p audio_data=<temp_a.txt 2>nul
        ) else (
            set "audio_data="
        )
        
        if exist temp_f.txt (
            set /p format_data=<temp_f.txt 2>nul
        ) else (
            set "format_data="
        )
        
        REM Clean up temp files
        del temp_*.txt 2>nul
        
        REM If we couldn't get basic info, mark for conversion
        if "!video_data!"=="" (
            set "file_needs_work=1"
            set "reasons=!reasons! [Cannot read video stream]"
            set /a "scan_errors+=1"
            echo   ❌ Cannot analyze - marking for conversion
        ) else (
            REM Check video codec
            echo !video_data! | findstr /i "h264" >nul 2>&1
            if !errorlevel! neq 0 (
                set "file_needs_work=1"
                set "reasons=!reasons! [Not H.264]"
                echo   → Video codec not H.264
            )
            
            REM Check audio codec
            if not "!audio_data!"=="" (
                echo !audio_data! | findstr /i "aac" >nul 2>&1
                if !errorlevel! neq 0 (
                    set "file_needs_work=1"
                    set "reasons=!reasons! [Not AAC]"
                    echo   → Audio codec not AAC
                )
                
                REM Check audio channels
                for /f "tokens=2 delims=," %%c in ("!audio_data!") do (
                    if %%c gtr 2 (
                        set "file_needs_work=1"
                        set "reasons=!reasons! [>2 channels]"
                        echo   → Audio has %%c channels
                    )
                )
            )
            
            REM Check bitrate
            if not "!format_data!"=="" (
                for /f "tokens=1" %%b in ("!format_data!") do (
                    if %%b gtr 5000000 (
                        set "file_needs_work=1"
                        set "reasons=!reasons! [High bitrate]"
                        echo   → Bitrate: %%b bps
                    )
                )
            )
            
            REM Check resolution
            for /f "tokens=3,4 delims=," %%w in ("!video_data!") do (
                if %%w gtr 1920 (
                    set "file_needs_work=1"
                    set "reasons=!reasons! [Width>1920]"
                    echo   → Width: %%w
                )
                if %%h gtr 1080 (
                    set "file_needs_work=1"
                    set "reasons=!reasons! [Height>1080]"
                    echo   → Height: %%h
                )
            )
            
            REM Check file extension
            if /i not "%%~xf"==".mp4" (
                set "file_needs_work=1"
                set "reasons=!reasons! [Not MP4]"
                echo   → Extension: %%~xf
            )
        )
        
        REM Log results
        if !file_needs_work! equ 1 (
            set /a "needs_work+=1"
            echo   ❌ NEEDS CONVERSION !reasons!
            echo %%f >> "!needs_conversion!"
            echo   Status: NEEDS CONVERSION !reasons! >> "!scan_results!"
        ) else (
            echo   ✓ Already optimized
            echo   Status: OK >> "!scan_results!"
        )
        
        echo. >> "!scan_results!"
    )
)

echo.
echo ==========================================
echo SCAN COMPLETE
echo ==========================================
echo Total files scanned: !total_files!
echo Files needing conversion: !needs_work!
echo Scan errors: !scan_errors!
echo.
echo Results saved to:
echo   !scan_results!
echo   !needs_conversion!
echo.

REM Show summary in results file
echo. >> "!scan_results!"
echo ========================================== >> "!scan_results!"
echo SUMMARY >> "!scan_results!"
echo ========================================== >> "!scan_results!"
echo Total files scanned: !total_files! >> "!scan_results!"
echo Files needing conversion: !needs_work! >> "!scan_results!"
echo Scan errors: !scan_errors! >> "!scan_results!"

pause