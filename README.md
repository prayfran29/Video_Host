# Majin Video Streams - Multi-Device Streaming Platform

A comprehensive video hosting and streaming platform with Smart TV support, QR authentication, and progressive streaming.

## Project Structure

```
Video Host/
├── app.js                     # Main Express server
├── script.js                  # Frontend JavaScript
├── index.html                 # Main web interface
├── admin.html                 # Admin panel
├── adult.html                 # Adult content interface
├── config/
│   ├── config.js              # Server configuration
│   └── data/                  # JSON data storage (users, progress)
├── scripts/video-optimization/ # Video conversion tools
├── docs/                      # Documentation
├── AndroidTV/                 # Android TV WebView app
├── TizenTV/                   # Samsung Smart TV app
└── videos/                    # Video content directory
```

## Quick Start

1. **Install Dependencies**: `npm install`
2. **Set Environment**: `JWT_SECRET=your-secret-key`
3. **Optimize Videos**: `scripts/video-optimization/smart-video-optimizer.bat`
4. **Start Server**: `npm start`
5. **Access**: http://localhost:3000

## Key Features

### 🎬 **Streaming**
- Progressive streaming with range requests
- Resume playback functionality
- Multi-format support (MP4, WebM, OGG, AVI, MKV)
- Automatic video optimization

### 📱 **Multi-Device Support**
- Responsive web interface (desktop/mobile)
- Android TV native app with remote control
- Samsung Tizen TV compatibility
- QR code authentication for TV login

### 🔐 **Authentication & Security**
- JWT-based authentication
- User registration with admin approval
- Adult content access controls
- Session management with Redis
- Rate limiting and security headers

### 🎯 **User Experience**
- Genre-based content organization
- Continue watching functionality
- Search with live results
- Watch progress tracking
- Series/episode management

## Video Optimization

Use the smart video optimizer to ensure all videos are streaming-ready:
```bash
scripts/video-optimization/smart-video-optimizer.bat
```

This automatically:
- Converts to H.264 baseline profile for TV compatibility
- Downmixes multi-channel audio to stereo
- Adds streaming metadata (faststart)
- Optimizes bitrate and resolution for progressive streaming

## TV Apps

### Android TV
- WebView-based app with TV remote navigation
- Auto-login with device-specific credentials
- Fullscreen video playback
- D-pad navigation support

### Samsung Tizen TV
- Native Tizen app for Samsung Smart TVs
- Remote control integration
- Optimized UI for TV screens

## Authentication

### QR Code Login
1. Open app on TV
2. Scan QR code with mobile device
3. Login on mobile to authenticate TV
4. Automatic session sync

### User Management
- Admin approval for new users
- Adult content access controls
- Progress tracking per user
- Session management across devices

## Environment Variables

```bash
JWT_SECRET=your-jwt-secret-key
ENCRYPTION_KEY=your-32-byte-hex-key
REDIS_HOST=localhost  # For session storage
```

## Docker Deployment

```bash
docker build -t majin-video-streams .
docker run -p 3000:3000 -v /path/to/videos:/app/videos majin-video-streams
```

## API Endpoints

- `POST /api/login` - User authentication
- `POST /api/register` - User registration
- `GET /api/series` - List all series
- `GET /api/series/:id` - Get series details
- `POST /api/progress` - Save watch progress
- `GET /api/qr-login` - Generate QR login token

## Default Accounts

- **Admin**: Magnus (full access)
- **TV Users**: Auto-created with format `TV-{deviceId}`
- **Regular Users**: Require admin approval

## Tech Stack

- **Backend**: Node.js, Express, JWT
- **Frontend**: Vanilla JavaScript, CSS3
- **Storage**: File-based JSON, Redis sessions
- **Video**: Progressive streaming, range requests
- **Security**: Helmet, rate limiting, input validation

## Documentation

- [Progressive Streaming Guide](docs/PROGRESSIVE_STREAMING_GUIDE.md)
- [Kubernetes Deployment](docs/README-k8s.md)
- [Cloudflare Optimization](docs/cloudflare-optimization.md)
- [Tunnel Setup](docs/tunnel-setup.md)