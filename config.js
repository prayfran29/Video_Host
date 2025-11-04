const path = require('path');
const fs = require('fs');

class Config {
    constructor() {
        this.videosPath = process.env.VIDEOS_PATH || './videos';
        this.videosDir = this.getVideosDirectory();
        this.ensureVideosDirectory();
    }

    getVideosDirectory() {
        return path.isAbsolute(this.videosPath) 
            ? this.videosPath 
            : path.join(__dirname, this.videosPath);
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
            // Test write permissions
            const testFile = path.join(this.videosDir, '.write-test');
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
            return true;
        } catch (error) {
            console.error(`Videos directory validation failed: ${error.message}`);
            return false;
        }
    }
}

module.exports = new Config();