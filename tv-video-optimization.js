// TV-optimized video streaming modifications for app.js

// Replace the streamVideo function with this TV-optimized version
function streamVideoTV(req, res, videoPath) {
    if (!fs.existsSync(videoPath)) {
        return res.status(404).json({ error: 'Video not found' });
    }
    
    const userAgent = req.headers['user-agent'] || '';
    const isTV = /Smart-TV|Tizen|WebOS|Android TV|BRAVIA|Samsung|LG webOS|wv/i.test(userAgent);
    
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    // TV-specific headers for better compatibility
    const headers = {
        'Accept-Ranges': 'bytes',
        'Content-Type': 'video/mp4',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
        'X-Content-Type-Options': 'nosniff'
    };
    
    if (isTV) {
        // Additional TV headers
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
    }
    
    res.set(headers);
    
    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        
        // TV-optimized chunk sizing
        let chunkSize;
        if (isTV) {
            // Smaller chunks for TV to prevent timeouts
            chunkSize = 512 * 1024; // 512KB chunks
        } else {
            // Larger chunks for other devices
            chunkSize = 2 * 1024 * 1024; // 2MB chunks
        }
        
        const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + chunkSize - 1, fileSize - 1);
        const contentLength = (end - start) + 1;
        
        res.status(206).set({
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Content-Length': contentLength
        });
        
        const stream = fs.createReadStream(videoPath, { start, end });
        
        // Handle stream errors and client disconnects
        stream.on('error', (err) => {
            console.error('Stream error:', err);
            if (!res.headersSent) res.status(500).end();
        });
        
        req.on('close', () => {
            stream.destroy();
        });
        
        stream.pipe(res);
    } else {
        // For non-range requests, still use streaming
        res.set('Content-Length', fileSize);
        const stream = fs.createReadStream(videoPath);
        
        stream.on('error', (err) => {
            console.error('Stream error:', err);
            if (!res.headersSent) res.status(500).end();
        });
        
        req.on('close', () => {
            stream.destroy();
        });
        
        stream.pipe(res);
    }
}

// TV-specific video serving middleware
app.use('/videos/tv', (req, res, next) => {
    const filePath = req.path;
    
    if (!validatePath(filePath)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    const fullPath = path.join(videosDir, filePath);
    
    if (!fullPath.startsWith(videosDir)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    if (req.path.match(/\.(mp4|webm|ogg|avi|mkv)$/i)) {
        return streamVideoTV(req, res, fullPath);
    }
    
    // Handle other files normally
    try {
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
            res.sendFile(fullPath);
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    } catch (error) {
        res.status(404).json({ error: 'File not found' });
    }
});