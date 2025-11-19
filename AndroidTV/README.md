# Android TV Video Host App

## Security Improvements Made
- Removed dangerous WebView file access permissions
- Disabled WebView debugging in release builds
- Updated to secure mixed content mode
- Added network security configuration
- Disabled backup to prevent data leakage

## Performance Optimizations
- Updated to latest Android SDK (34)
- Enabled hardware acceleration with software fallback
- Added ProGuard configuration for release builds
- Optimized Gradle build settings
- Extracted JavaScript to asset files

## Configuration
- All hardcoded values moved to resources
- Build variants for debug/release configurations
- Externalized video optimization scripts

## Build Instructions
```bash
./gradlew assembleDebug    # Debug build
./gradlew assembleRelease  # Release build
```

## Clean Build
```bash
./gradlew clean
```