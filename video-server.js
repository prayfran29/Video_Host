const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const videosDir = 'D:/videos';

// Simple CORS headers
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Range');
    next();
});

// Simple video streaming
app.get('/*', (req, res) => {
    const videoPath = path.join(videosDir, decodeURIComponent(req.path));
    
    if (!fs.existsSync(videoPath)) {
        return res.status(404).end();
    }
    
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4'
        });
        
        fs.createReadStream(videoPath, { start, end }).pipe(res);
    } else {
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
            'Accept-Ranges': 'bytes'
        });
        
        fs.createReadStream(videoPath).pipe(res);
    }
});

app.listen(3001, () => {
    console.log('Video server running on port 3001');
});