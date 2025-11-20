# Majin Video Streams - Streaming Platform

A comprehensive video hosting and streaming platform with TV compatibility and progressive streaming support.

## Project Structure

```
Video Host/
├── scripts/
│   ├── video-optimization/     # Video conversion and optimization scripts
│   └── deployment/            # Deployment and infrastructure scripts
├── docs/                      # Documentation and guides
├── config/                    # Configuration files
├── data/                      # Application data (users, progress, etc.)
├── public/                    # Static web assets
├── AndroidTV/                 # Android TV client application
└── videos/                    # Video content directory
```

## Quick Start

1. **Install Dependencies**: `npm install`
2. **Configure Environment**: Copy `config/.env.example` to `.env`
3. **Optimize Videos**: Run `scripts/video-optimization/smart-video-optimizer.bat`
4. **Start Server**: `node app.js`

## Key Features

- **Progressive Streaming**: Optimized for immediate playback
- **TV Compatibility**: Works with Smart TVs and streaming devices
- **Multi-format Support**: Converts various video formats to streaming-ready MP4
- **User Management**: Progress tracking and user authentication
- **Mobile & Desktop**: Responsive web interface

## Video Optimization

Use the smart video optimizer to ensure all videos are streaming-ready:
```bash
scripts/video-optimization/smart-video-optimizer.bat
```

This automatically:
- Converts to H.264 baseline profile
- Downmixes multi-channel audio to stereo
- Adds streaming metadata (faststart)
- Limits resolution and bitrate for optimal streaming

## Documentation

- [Progressive Streaming Guide](docs/PROGRESSIVE_STREAMING_GUIDE.md)
- [Kubernetes Deployment](docs/README-k8s.md)
- [Cloudflare Optimization](docs/cloudflare-optimization.md)
- [Tunnel Setup](docs/tunnel-setup.md)