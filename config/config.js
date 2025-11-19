const path = require('path');
const fs = require('fs');

class Config {
    constructor() {
        // Use container mount path for videos
        this.videosDir = '/app/videos';
        this.ensureVideosDirectory();
    }

    getVideosDirectory() {
        return this.videosDir;
    }

    ensureVideosDirectory() {
        if (!fs.existsSync(this.videosDir)) {
            try {
                fs.mkdirSync(this.videosDir, { recursive: true });
                console.log(`✓ Created videos directory: ${this.videosDir}`);
            } catch (error) {
                console.error(`✗ Failed to create videos directory: ${this.videosDir}`, error);
                throw new Error(`Cannot create videos directory: ${error.message}`);
            }
        } else {
            console.log(`✓ Using videos directory: ${this.videosDir}`);
        }
    }

    getVideosPath() {
        return this.videosDir;
    }

    validateVideosPath() {
        try {
            const stats = fs.statSync(this.videosDir);
            if (!stats.isDirectory()) {
                throw new Error('Videos path exists but is not a directory');
            }
            // Only check if directory exists and is readable (no write test for read-only mounts)
            fs.readdirSync(this.videosDir);
            return true;
        } catch (error) {
            console.error(`Videos directory validation failed: ${error.message}`);
            return false;
        }
    }
}

module.exports = new Config();