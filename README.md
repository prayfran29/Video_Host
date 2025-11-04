# Magnus Video Streams - Video Hosting Site

A Crunchyroll-inspired video hosting platform with authentication, search, and video playback capabilities.

## Features

- **User Authentication**: Register/Login with JWT tokens
- **Video Search**: Search videos by title or genre
- **Video Player**: Built-in HTML5 video player with modal overlay
- **Responsive Design**: Mobile-friendly Crunchyroll-inspired UI
- **Docker Support**: Containerized for easy deployment

## Configuration

### Videos Directory

The videos directory can be configured to be anywhere on your system by setting the `VIDEOS_PATH` environment variable:

```bash
# In your .env file
VIDEOS_PATH=./videos                    # Relative to project (default)
VIDEOS_PATH=C:\Videos                   # Absolute Windows path
VIDEOS_PATH=/home/user/videos           # Absolute Linux/Mac path
VIDEOS_PATH=D:\Media\MyVideos          # Custom drive on Windows
```

**Examples:**
- `VIDEOS_PATH=./videos` - Default, creates videos folder in project directory
- `VIDEOS_PATH=C:\Users\YourName\Videos` - Use your Windows user Videos folder
- `VIDEOS_PATH=/mnt/nas/videos` - Use a network attached storage
- `VIDEOS_PATH=D:\Media` - Use a different drive

The application will automatically create the directory if it doesn't exist and validate write permissions on startup.

## Quick Start

### Using Docker (Recommended)

```bash
# Build and run with docker-compose
docker-compose up --build

# Or build and run manually
docker build -t video-host .
docker run -p 3000:3000 video-host
```

### Local Development

```bash
# Install dependencies
npm install

# Start the server
npm start

# Development with auto-reload
npm run dev
```

## Usage

1. Open http://localhost:3000 in your browser
2. Click the profile icon to register/login
3. Use the search bar to find videos
4. Click on any video card to play the video
5. Browse different content sections

## API Endpoints

- `POST /api/register` - Register new user
- `POST /api/login` - User login
- `GET /api/videos` - Get all videos (with optional search)
- `GET /api/videos/:id` - Get specific video

## Technologies

- Frontend: HTML5, CSS3, JavaScript
- Backend: Node.js, Express.js
- Authentication: JWT, bcrypt
- Containerization: Docker, Docker Compose