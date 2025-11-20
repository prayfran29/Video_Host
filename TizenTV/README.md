# Magnus Video Streams - Tizen TV App

## Setup Instructions

1. **Install Tizen Studio**
   - Download from Samsung Developer site
   - Install TV extensions

2. **Build App**
   - Open Tizen Studio
   - Import this project folder
   - Build for TV target

3. **Deploy to TV**
   - Enable Developer Mode on Samsung TV
   - Connect TV to same network
   - Deploy via Tizen Studio

## Features

- QR code login (scan with phone)
- Manual login fallback
- Remote control navigation
- Video streaming
- Genre-based browsing

## Remote Controls

- **Arrow Keys**: Navigate
- **Enter**: Select
- **Return/Back**: Go back
- **Red Button**: Exit app

## Files Structure

- `config.xml` - App manifest
- `index.html` - Main UI
- `css/style.css` - TV-optimized styles
- `js/tizen-tv.js` - Tizen API wrapper
- `js/app.js` - Main application logic

## Server Configuration

Update `serverUrl` in `js/app.js` to match your server:
```javascript
this.serverUrl = 'http://your-server:3000';
```