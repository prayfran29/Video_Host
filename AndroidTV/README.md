# Magnus Video Streams - Android TV App

A simple Android TV app that wraps the Magnus Video Streams website in a WebView.

## Features
- Full-screen video streaming
- D-pad navigation support
- TV remote control compatibility
- Automatic login persistence

## Build Instructions

1. **Install Android Studio**
2. **Open this AndroidTV folder as a project**
3. **Connect Android TV device or use emulator**
4. **Build and run**

## APK Installation

1. Build the APK in Android Studio
2. Enable "Developer Options" on your Android TV
3. Enable "USB Debugging" 
4. Install via ADB: `adb install app-release.apk`

## TV Navigation

- **D-pad**: Navigate the interface
- **Center/OK**: Click buttons and links
- **Back**: Go back or exit app
- **Home**: Return to TV home screen

## Requirements

- Android TV 5.0+ (API 21+)
- Internet connection
- Access to magnushackhost.win

The app loads your existing streaming site in a TV-optimized WebView with proper remote control support.