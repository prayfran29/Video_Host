const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { body, validationResult, param } = require('express-validator');
const crypto = require('crypto');
const config = require('./config');
const QRCode = require('qrcode');
const redisClient = require('./http-redis-client');
const app = express();

// Trust proxy for Cloudflare tunnel (localhost only)
app.set('trust proxy', 'loopback');

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-hashes'"],
            scriptSrcAttr: ["'unsafe-inline'"],
            mediaSrc: ["'self'"]
        }
    }
}));

// Rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: { error: 'Too many login attempts, try again later' }
});
app.use(express.json({ limit: '10mb' }));
app.use(express.static('.'));

// Handle request timeouts (longer for video streaming)
app.use((req, res, next) => {
    const timeout = req.path.includes('/videos/') ? 120000 : 30000; // 2 minutes for videos
    req.setTimeout(timeout, () => {
        if (!res.headersSent) {
            res.status(408).json({ error: 'Request timeout' });
        }
    });
    next();
});

// Admin page route
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

const JWT_SECRET = process.env.JWT_SECRET || (() => {
    console.warn('⚠️  Using random JWT secret - tokens will be invalid after restart!');
    return crypto.randomBytes(64).toString('hex');
})();
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex') : crypto.randomBytes(32);
const IV_LENGTH = 16;

// Encryption functions
function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = textParts.join(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// Secure file path validation
function validatePath(filePath) {
    const normalizedPath = path.normalize(filePath);
    return !normalizedPath.includes('..') && !path.isAbsolute(normalizedPath);
}

// Data persistence
const dataDir = path.join(__dirname, 'data');
const usersFile = path.join(dataDir, 'users.json');
const progressFile = path.join(dataDir, 'progress.json');
const pendingFile = path.join(dataDir, 'pending.json');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

// Load or initialize data (plain JSON for now)
let users = [];
let watchProgress = {};
let pendingUsers = [];
let qrTokens = new Map(); // Store QR login tokens
const qrTokensFile = path.join(dataDir, 'qr-tokens.json');

// Load QR tokens from file
if (fs.existsSync(qrTokensFile)) {
    try {
        const data = fs.readFileSync(qrTokensFile, 'utf8');
        const tokenData = JSON.parse(data);
        qrTokens = new Map(Object.entries(tokenData));
    } catch (error) {
        console.error('Failed to load QR tokens file');
    }
}

// Save QR tokens to file
function saveQRTokens() {
    try {
        const tokenData = Object.fromEntries(qrTokens);
        fs.writeFileSync(qrTokensFile, JSON.stringify(tokenData, null, 2));
    } catch (error) {
        console.error('Failed to save QR tokens');
    }
}
// Redis-backed storage replaces in-memory collections

async function initializeUsers() {
    if (fs.existsSync(usersFile)) {
        try {
            const data = fs.readFileSync(usersFile, 'utf8');
            users = JSON.parse(data);
            
            // Ensure Magnus has adult access
            const magnus = users.find(u => u.username === 'Magnus');
            if (magnus && !magnus.adultAccess) {
                magnus.adultAccess = true;
                saveUsers();
            }
        } catch (error) {
            console.error('Failed to load users file, starting fresh');
            users = [];
        }
    }
    
    // Auto-create TV user account
    const tvUser = users.find(u => u.username === 'TVUser');
    if (!tvUser) {
        const hashedPassword = await bcrypt.hash('TVPass123!', 12);
        users.push({
            id: crypto.randomUUID(),
            username: 'TVUser',
            password: hashedPassword,
            createdAt: new Date().toISOString(),
            approved: true,
            adultAccess: false
        });
        saveUsers();
    }
}

initializeUsers();

if (fs.existsSync(progressFile)) {
    try {
        const data = fs.readFileSync(progressFile, 'utf8');
        watchProgress = JSON.parse(data);
    } catch (error) {
        console.error('Failed to load progress file, starting fresh');
        watchProgress = {};
    }
}

if (fs.existsSync(pendingFile)) {
    try {
        const data = fs.readFileSync(pendingFile, 'utf8');
        pendingUsers = JSON.parse(data);
    } catch (error) {
        console.error('Failed to load pending file, starting fresh');
        pendingUsers = [];
    }
}

// Save data functions (plain JSON)
function saveUsers() {
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

function saveProgress() {
    fs.writeFileSync(progressFile, JSON.stringify(watchProgress, null, 2));
}

function savePending() {
    fs.writeFileSync(pendingFile, JSON.stringify(pendingUsers, null, 2));
}

// Get videos directory from config
const videosDir = config.getVideosPath();

// Validate videos directory on startup
if (!config.validateVideosPath()) {
    console.error('⚠️  Videos directory validation failed. Check permissions and path.');
}

// Auth middleware with token expiration and blacklist check
const auth = async (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Access denied' });
    
    // Check if token is blacklisted
    try {
        if (await redisClient.isTokenBlacklisted(token)) {
            return res.status(401).json({ error: 'Token revoked' });
        }
    } catch (err) {
        // Redis not available, skip blacklist check
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        // Check if token is expired (24 hours)
        if (Date.now() >= decoded.exp * 1000) {
            return res.status(401).json({ error: 'Token expired' });
        }
        // Update session activity
        if (decoded.sessionId) {
            const session = await redisClient.getSession(decoded.sessionId);
            if (session) {
                session.lastActivity = new Date();
                await redisClient.setSession(decoded.sessionId, session);
            }
        }
        
        req.user = decoded;
        req.token = token;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// Secure video serving with auth and streaming optimizations
app.use('/videos', auth, (req, res, next) => {
    // Add streaming headers for better video compatibility
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    const filePath = req.path;
    
    // Validate file path
    if (!validatePath(filePath)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check file exists and is within videos directory
    const fullPath = path.join(videosDir, filePath);
    
    if (!fullPath.startsWith(videosDir)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    // Handle video streaming with range requests
    if (req.path.match(/\.(mp4|webm|ogg|avi|mkv)$/i)) {
        return streamVideo(req, res, fullPath);
    }
    
    next();
}, express.static(videosDir, {
    maxAge: 0,
    etag: false,
    lastModified: false
}));

// Video streaming function with range support
function streamVideo(req, res, videoPath) {
    if (!fs.existsSync(videoPath)) {
        return res.status(404).json({ error: 'Video not found' });
    }
    
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    // Optimized caching and streaming headers
    res.set({
        'Accept-Ranges': 'bytes',
        'Content-Type': 'video/mp4',
        'Cache-Control': 'public, max-age=2592000', // 30 days
        'ETag': `"${stat.mtime.getTime()}-${fileSize}"`,
        'Connection': 'keep-alive',
        'X-Content-Type-Options': 'nosniff'
    });
    
    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        // Allow larger chunks for better seeking (8MB chunks)
        const maxChunkSize = 8 * 1024 * 1024;
        const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + maxChunkSize - 1, fileSize - 1);
        const chunksize = (end - start) + 1;
        
        res.status(206).set({
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Content-Length': chunksize
        });
        
        const stream = fs.createReadStream(videoPath, { start, end });
        
        // Handle stream errors and client disconnects
        stream.on('error', () => {
            if (!res.headersSent) res.status(500).end();
        });
        
        req.on('close', () => {
            stream.destroy();
        });
        
        stream.pipe(res);
    } else {
        res.set('Content-Length', fileSize);
        const stream = fs.createReadStream(videoPath);
        
        stream.on('error', () => {
            if (!res.headersSent) res.status(500).end();
        });
        
        req.on('close', () => {
            stream.destroy();
        });
        
        stream.pipe(res);
    }
}

// Routes with validation
app.post('/api/register', 
    authLimiter,
    [
        body('username')
            .isLength({ min: 3, max: 30 })
            .matches(/^[a-zA-Z0-9_]+$/)
            .withMessage('Username must be 3-30 characters, alphanumeric and underscore only'),
        body('password')
            .isLength({ min: 8 })
            .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)  
            .withMessage('Password must be 8+ chars with uppercase, lowercase, number, and special character')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array()[0].msg });
        }
        
        const { username, password } = req.body;
        
        // Check if user exists
        if (users.find(u => u.username === username)) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 12);
        
        if (username === 'Magnus') {
            // Auto-approve Magnus with adult access
            const user = { 
                id: crypto.randomUUID(), 
                username, 
                password: hashedPassword,
                createdAt: new Date().toISOString(),
                approved: true,
                adultAccess: true
            };
            users.push(user);
            saveUsers();
            res.json({ message: 'Admin account created successfully!' });
        } else {
            // Regular users need approval
            const pendingUser = { 
                id: crypto.randomUUID(), 
                username, 
                password: hashedPassword,
                createdAt: new Date().toISOString(),
                approved: false,
                adultAccess: false
            };
            pendingUsers.push(pendingUser);
            savePending();
            res.json({ message: 'Registration submitted. Awaiting admin approval.' });
        }
    }
);

app.post('/api/login',
    authLimiter,
    [
        body('username').notEmpty().withMessage('Username required'),
        body('password').notEmpty().withMessage('Password required')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array()[0].msg });
        }
        
        const { username, password } = req.body;
        const user = users.find(u => u.username === username);
        
        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        if (!user.approved && user.username !== 'Magnus') {
            return res.status(401).json({ error: 'Account pending approval' });
        }
        
        const sessionId = crypto.randomUUID();
        const token = jwt.sign(
            { id: user.id, username, sessionId },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        // Store active session in Redis
        await redisClient.setSession(sessionId, {
            userId: user.id,
            username,
            token,
            createdAt: new Date(),
            lastActivity: new Date()
        });
        
        res.json({ token, username, adultAccess: user.adultAccess || false });
    }
);

// QR Code login endpoints
app.post('/api/qr-login', (req, res) => {
    const token = crypto.randomUUID();
    qrTokens.set(token, { 
        authenticated: false, 
        createdAt: Date.now(),
        expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes
    });
    
    // Clean up expired tokens
    for (const [key, value] of qrTokens.entries()) {
        if (Date.now() > value.expiresAt) {
            qrTokens.delete(key);
        }
    }
    
    saveQRTokens();
    res.json({ token });
});

app.get('/api/qr-login/:token', (req, res) => {
    const token = req.params.token;
    const qrData = qrTokens.get(token);
    
    if (!qrData || Date.now() > qrData.expiresAt) {
        qrTokens.delete(token);
        return res.status(404).json({ error: 'Token expired or not found' });
    }
    
    res.json({ 
        authenticated: qrData.authenticated,
        authToken: qrData.authToken,
        username: qrData.username
    });
});

// QR Auth page for mobile
app.get('/qr-auth', (req, res) => {
    const token = req.query.token;
    if (!token || !qrTokens.has(token)) {
        return res.status(404).send('Invalid or expired QR code');
    }
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>TV Login</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; background: #0b0b0b; color: #fff; }
                .container { max-width: 400px; margin: 0 auto; text-align: center; }
                input, button { width: 100%; padding: 12px; margin: 8px 0; border: none; border-radius: 4px; }
                input { background: #333; color: #fff; }
                button { background: #0066ff; color: #fff; cursor: pointer; }
                button:hover { background: #0052cc; }
                .success { color: #28a745; }
                .error { color: #dc3545; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>Login to TV</h2>
                <form id="loginForm">
                    <input type="text" id="username" placeholder="Username" required>
                    <input type="password" id="password" placeholder="Password" required>
                    <button type="submit">Login to TV</button>
                </form>
                <div id="message"></div>
            </div>
            <script>
                document.getElementById('loginForm').onsubmit = async (e) => {
                    e.preventDefault();
                    const username = document.getElementById('username').value;
                    const password = document.getElementById('password').value;
                    const message = document.getElementById('message');
                    
                    try {
                        const response = await fetch('/api/qr-auth/${token}', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ username, password })
                        });
                        
                        const data = await response.json();
                        if (response.ok) {
                            message.innerHTML = '<p class="success">✓ Successfully logged in to TV!</p>';
                            document.getElementById('loginForm').style.display = 'none';
                        } else {
                            message.innerHTML = '<p class="error">' + data.error + '</p>';
                        }
                    } catch (error) {
                        message.innerHTML = '<p class="error">Login failed</p>';
                    }
                };
            </script>
        </body>
        </html>
    `);
});

app.post('/api/qr-auth/:token', async (req, res) => {
    const token = req.params.token;
    const { username, password } = req.body;
    
    const qrData = qrTokens.get(token);
    if (!qrData || Date.now() > qrData.expiresAt) {
        qrTokens.delete(token);
        return res.status(404).json({ error: 'Token expired or not found' });
    }
    
    const user = users.find(u => u.username === username);
    if (!user || !await bcrypt.compare(password, user.password)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (!user.approved && user.username !== 'Magnus') {
        return res.status(401).json({ error: 'Account pending approval' });
    }
    
    const authToken = jwt.sign(
        { id: user.id, username },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
    
    // Update QR token with auth data
    qrTokens.set(token, {
        ...qrData,
        authenticated: true,
        authToken,
        username
    });
    
    saveQRTokens();
    res.json({ message: 'Login successful' });
});

// Generate QR code image
app.get('/api/qr/:token', async (req, res) => {
    try {
        const token = req.params.token;
        const qrUrl = `${req.protocol}://${req.get('host')}/qr-auth?token=${token}`;
        
        const qrCodeDataURL = await QRCode.toDataURL(qrUrl, {
            width: 200,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });
        
        const base64Data = qrCodeDataURL.replace(/^data:image\/png;base64,/, '');
        const imgBuffer = Buffer.from(base64Data, 'base64');
        
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.send(imgBuffer);
    } catch (error) {
        res.status(500).send('QR generation failed');
    }
});



// Get all series from videos directory with auth (supports genre folders)
app.get('/api/series', auth, (req, res) => {
    try {
        
        if (!fs.existsSync(videosDir)) {
            return res.json([]);
        }
        
        const series = [];
        
        // Scan root videos directory
        const rootItems = fs.readdirSync(videosDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory() && dirent.name !== 'Adult');
        
        for (const item of rootItems) {
            if (!validatePath(item.name)) continue;
            
            const itemPath = path.join(videosDir, item.name);
            if (!fs.existsSync(itemPath)) continue;
            
            const files = fs.readdirSync(itemPath);
            const videos = files.filter(f => f.match(/\.(mp4|webm|ogg|avi|mkv)$/i));
            
            if (videos.length > 0) {
                // This is a series folder
                const thumbnail = files.find(f => f.toLowerCase() === 'img' || f.startsWith('img.') || f.startsWith('thumb.'));
                series.push({
                    id: item.name,
                    title: item.name,
                    genre: 'Root',
                    thumbnail: thumbnail ? `/videos/${encodeURIComponent(item.name)}/${encodeURIComponent(thumbnail)}` : null,
                    videoCount: videos.length,
                    videos: videos.map(v => ({
                        filename: v,
                        url: `/videos/${encodeURIComponent(item.name)}/${encodeURIComponent(v)}`
                    }))
                });
            } else {
                // This might be a genre folder, scan inside
                const subItems = fs.readdirSync(itemPath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory());
                
                for (const subItem of subItems) {
                    if (!validatePath(subItem.name)) continue;
                    
                    const subPath = path.join(itemPath, subItem.name);
                    if (!fs.existsSync(subPath)) continue;
                    
                    const subFiles = fs.readdirSync(subPath);
                    const subVideos = subFiles.filter(f => f.match(/\.(mp4|webm|ogg|avi|mkv)$/i));
                    
                    if (subVideos.length > 0) {
                        const thumbnail = subFiles.find(f => f.toLowerCase() === 'img' || f.startsWith('img.'));
                        series.push({
                            id: `${item.name}/${subItem.name}`,
                            title: subItem.name,
                            genre: item.name,
                            thumbnail: thumbnail ? `/videos/${encodeURIComponent(item.name)}/${encodeURIComponent(subItem.name)}/${encodeURIComponent(thumbnail)}` : null,
                            videoCount: subVideos.length,
                            videos: subVideos.map(v => ({
                                filename: v,
                                url: `/videos/${encodeURIComponent(item.name)}/${encodeURIComponent(subItem.name)}/${encodeURIComponent(v)}`
                            }))
                        });
                    }
                }
            }
        }
        
        const { search } = req.query;
        if (search) {
            const sanitizedSearch = search.replace(/[^a-zA-Z0-9\s]/g, '').toLowerCase();
            const filtered = series.filter(s => 
                s.title.toLowerCase().includes(sanitizedSearch)
            );
            return res.json(filtered);
        }
        
        res.json(series);
    } catch (error) {
        console.error('Series loading error:', error);
        res.status(500).json({ error: 'Failed to load series' });
    }
});

// Get all series including adult content
app.get('/api/series/adult', auth, (req, res) => {
    try {
        
        if (!fs.existsSync(videosDir)) {
            return res.json([]);
        }
        
        const series = [];
        
        // Scan root videos directory (including adult)
        const rootItems = fs.readdirSync(videosDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory());
        
        for (const item of rootItems) {
            if (!validatePath(item.name)) continue;
            
            const itemPath = path.join(videosDir, item.name);
            if (!fs.existsSync(itemPath)) continue;
            
            const files = fs.readdirSync(itemPath);
            const videos = files.filter(f => f.match(/\.(mp4|webm|ogg|avi|mkv)$/i));
            
            if (videos.length > 0) {
                const thumbnail = files.find(f => f.toLowerCase() === 'img' || f.startsWith('img.'));
                series.push({
                    id: item.name,
                    title: item.name,
                    genre: 'Root',
                    thumbnail: thumbnail ? `/videos/${encodeURIComponent(item.name)}/${encodeURIComponent(thumbnail)}` : null,
                    videoCount: videos.length,
                    videos: videos.map(v => ({
                        filename: v,
                        url: `/videos/${encodeURIComponent(item.name)}/${encodeURIComponent(v)}`
                    }))
                });
            } else {
                const subItems = fs.readdirSync(itemPath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory());
                
                for (const subItem of subItems) {
                    if (!validatePath(subItem.name)) continue;
                    
                    const subPath = path.join(itemPath, subItem.name);
                    if (!fs.existsSync(subPath)) continue;
                    
                    const subFiles = fs.readdirSync(subPath);
                    const subVideos = subFiles.filter(f => f.match(/\.(mp4|webm|ogg|avi|mkv)$/i));
                    
                    if (subVideos.length > 0) {
                        const thumbnail = subFiles.find(f => f.toLowerCase() === 'img' || f.startsWith('img.'));
                        series.push({
                            id: `${item.name}/${subItem.name}`,
                            title: subItem.name,
                            genre: item.name,
                            thumbnail: thumbnail ? `/videos/${encodeURIComponent(item.name)}/${encodeURIComponent(subItem.name)}/${encodeURIComponent(thumbnail)}` : null,
                            videoCount: subVideos.length,
                            videos: subVideos.map(v => ({
                                filename: v,
                                url: `/videos/${encodeURIComponent(item.name)}/${encodeURIComponent(subItem.name)}/${encodeURIComponent(v)}`
                            }))
                        });
                    }
                }
            }
        }
        
        res.json(series);
    } catch (error) {
        console.error('Adult series loading error:', error);
        res.status(500).json({ error: 'Failed to load series' });
    }
});

// Get series grouped by genre
app.get('/api/genres', auth, (req, res) => {
    try {
        
        if (!fs.existsSync(videosDir)) {
            return res.json({});
        }
        
        const genres = {};
        const rootItems = fs.readdirSync(videosDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory() && dirent.name !== 'Adult');
        
        for (const item of rootItems) {
            if (!validatePath(item.name)) continue;
            
            const itemPath = path.join(videosDir, item.name);
            if (!fs.existsSync(itemPath)) continue;
            
            const files = fs.readdirSync(itemPath);
            const videos = files.filter(f => f.match(/\.(mp4|webm|ogg|avi|mkv)$/i));
            
            if (videos.length > 0) {
                // Root level series
                if (!genres['Other']) genres['Other'] = [];
                const thumbnail = files.find(f => f.toLowerCase() === 'img' || f.startsWith('img.'));
                genres['Other'].push({
                    id: item.name,
                    title: item.name,
                    thumbnail: thumbnail ? `/videos/${encodeURIComponent(item.name)}/${encodeURIComponent(thumbnail)}` : null,
                    videoCount: videos.length
                });
            } else {
                // Genre folder
                const genreName = item.name;
                if (!genres[genreName]) genres[genreName] = [];
                
                const subItems = fs.readdirSync(itemPath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory());
                
                for (const subItem of subItems) {
                    if (!validatePath(subItem.name)) continue;
                    
                    const subPath = path.join(itemPath, subItem.name);
                    if (!fs.existsSync(subPath)) continue;
                    
                    const subFiles = fs.readdirSync(subPath);
                    const subVideos = subFiles.filter(f => f.match(/\.(mp4|webm|ogg|avi|mkv)$/i));
                    
                    if (subVideos.length > 0) {
                        const thumbnail = subFiles.find(f => f.toLowerCase() === 'img' || f.startsWith('img.'));
                        genres[genreName].push({
                            id: `${item.name}/${subItem.name}`,
                            title: subItem.name,
                            thumbnail: thumbnail ? `/videos/${encodeURIComponent(item.name)}/${encodeURIComponent(subItem.name)}/${encodeURIComponent(thumbnail)}` : null,
                            videoCount: subVideos.length
                        });
                    }
                }
            }
        }
        
        res.json(genres);
    } catch (error) {
        console.error('Genres loading error:', error);
        res.status(500).json({ error: 'Failed to load genres' });
    }
});

// Get video description from search API
app.get('/api/video-description/:title', auth, async (req, res) => {
    try {
        const title = decodeURIComponent(req.params.title);
        const cleanTitle = title.replace(/\.[^/.]+$/, "").replace(/[._-]/g, ' ');
        
        // Use DuckDuckGo Instant Answer API (free, no key required)
        const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanTitle)}&format=json&no_html=1&skip_disambig=1`;
        
        const response = await fetch(searchUrl);
        const data = await response.json();
        
        let description = data.Abstract || data.AbstractText || '';
        
        // If no abstract, try the first related topic
        if (!description && data.RelatedTopics && data.RelatedTopics.length > 0) {
            description = data.RelatedTopics[0].Text || '';
        }
        
        // Fallback: generic description
        if (!description) {
            description = `Video: ${cleanTitle}`;
        }
        
        res.json({ description: description.substring(0, 300) }); // Limit length
    } catch (error) {
        res.json({ description: `Video: ${req.params.title.replace(/\.[^/.]+$/, "").replace(/[._-]/g, ' ')}` });
    }
});

// Get specific series details with validation
app.get('/api/series/*', 
    auth,
    (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Invalid series ID' });
        }
        
        try {
            const seriesId = req.params[0]; // Get the full path after /api/series/
            
            // Handle both root series and genre/series paths
            const pathParts = seriesId.split('/');
            if (pathParts.some(part => !validatePath(part))) {
                return res.status(400).json({ error: 'Invalid series path' });
            }
            
            const seriesPath = path.join(videosDir, ...pathParts);
            
            if (!fs.existsSync(seriesPath)) {
                return res.status(404).json({ error: 'Series not found' });
            }
            
            let files;
            try {
                files = fs.readdirSync(seriesPath);
            } catch (error) {
                console.error(`Error reading series directory ${seriesId}:`, error);
                return res.status(500).json({ error: 'Failed to read series directory' });
            }
            
            const videos = files.filter(f => f.match(/\.(mp4|webm|ogg|avi|mkv)$/i))
                .map(v => ({
                    filename: v,
                    url: `/videos/${encodeURIComponent(seriesId)}/${encodeURIComponent(v)}`,
                    title: v.replace(/\.[^/.]+$/, "").replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                }));
            
            if (videos.length === 0) {
                return res.status(404).json({ error: 'No videos found in series' });
            }
            
            res.json({
                id: seriesId,
                title: seriesId,
                videos
            });
        } catch (error) {
            console.error('Series details error:', error);
            res.status(500).json({ error: 'Failed to load series details' });
        }
    }
);

// Save watch progress
app.post('/api/progress', auth, (req, res) => {
    const { seriesId, videoFile, currentTime, duration, completed } = req.body;
    const userId = req.user.id;
    
    if (!watchProgress[userId]) watchProgress[userId] = {};
    if (!watchProgress[userId][seriesId]) watchProgress[userId][seriesId] = {};
    
    watchProgress[userId][seriesId][videoFile] = {
        currentTime,
        duration,
        completed: completed || false,
        lastWatched: new Date()
    };
    
    saveProgress();
    res.json({ message: 'Progress saved' });
});

// Get watch progress
app.get('/api/progress', auth, (req, res) => {
    const userId = req.user.id;
    res.json(watchProgress[userId] || {});
});

// Logout endpoint - blacklist token and remove session
app.post('/api/logout', auth, async (req, res) => {
    await redisClient.blacklistToken(req.token);
    
    // Remove session if it exists
    if (req.user.sessionId) {
        await redisClient.deleteSession(req.user.sessionId);
    }
    
    res.json({ message: 'Logged out successfully' });
});

// Session cleanup job - remove expired sessions and tokens
function cleanupExpiredSessions() {
    const now = Date.now();
    let cleanedSessions = 0;
    let cleanedTokens = 0;
    
    // Clean expired sessions (24 hours of inactivity)
    for (const [sessionId, session] of activeSessions.entries()) {
        const inactiveTime = now - new Date(session.lastActivity).getTime();
        if (inactiveTime > 24 * 60 * 60 * 1000) {
            activeSessions.delete(sessionId);
            cleanedSessions++;
        }
    }
    
    // Clean expired blacklisted tokens (keep for 24 hours after blacklisting)
    const expiredTokens = [];
    for (const token of blacklistedTokens) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
            if (now >= decoded.exp * 1000 + (24 * 60 * 60 * 1000)) {
                expiredTokens.push(token);
            }
        } catch {
            expiredTokens.push(token); // Remove invalid tokens
        }
    }
    
    expiredTokens.forEach(token => {
        blacklistedTokens.delete(token);
        cleanedTokens++;
    });
    
    if (cleanedSessions > 0 || cleanedTokens > 0) {
        console.log(`🧹 Cleaned ${cleanedSessions} expired sessions, ${cleanedTokens} expired tokens`);
    }
}

// Run cleanup every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

// Adult page route with proper access control
app.get('/adult', (req, res) => {
    const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).send('Authentication required');
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Always allow Magnus
        if (decoded.username === 'Magnus') {
            return res.sendFile(path.join(__dirname, 'adult.html'));
        }
        
        // Check other users for adult access
        const user = users.find(u => u.username === decoded.username);
        if (user && user.adultAccess) {
            return res.sendFile(path.join(__dirname, 'adult.html'));
        }
        
        res.status(403).send('Adult access denied');
    } catch (error) {
        res.status(401).send('Invalid token');
    }
});

// Admin routes
const ADMIN_USERNAME = 'Magnus';

const adminAuth = (req, res, next) => {
    if (req.user.username !== ADMIN_USERNAME) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

app.get('/api/admin/pending', auth, adminAuth, (req, res) => {
    res.json(pendingUsers);
});

app.post('/api/admin/approve/:id', auth, adminAuth, (req, res) => {
    const userId = req.params.id;
    const pendingIndex = pendingUsers.findIndex(u => u.id === userId);
    
    if (pendingIndex === -1) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    const user = pendingUsers[pendingIndex];
    users.push({ ...user, approved: true });
    pendingUsers.splice(pendingIndex, 1);
    
    saveUsers();
    savePending();
    res.json({ message: 'User approved' });
});

app.delete('/api/admin/reject/:id', auth, adminAuth, (req, res) => {
    const userId = req.params.id;
    const pendingIndex = pendingUsers.findIndex(u => u.id === userId);
    
    if (pendingIndex === -1) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    pendingUsers.splice(pendingIndex, 1);
    savePending();
    res.json({ message: 'User rejected' });
});

app.get('/api/admin/users', auth, adminAuth, (req, res) => {
    res.json(users.map(u => ({ id: u.id, username: u.username, createdAt: u.createdAt, adultAccess: u.adultAccess || false })));
});

app.post('/api/admin/adult-access/:id', auth, adminAuth, (req, res) => {
    const userId = req.params.id;
    const { adultAccess } = req.body;
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    users[userIndex].adultAccess = adultAccess;
    saveUsers();
    res.json({ message: 'Adult access updated' });
});

app.delete('/api/admin/users/:id', auth, adminAuth, (req, res) => {
    const userId = req.params.id;
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    const user = users[userIndex];
    if (user.username === 'Magnus') {
        return res.status(403).json({ error: 'Cannot delete admin account' });
    }
    
    users.splice(userIndex, 1);
    saveUsers();
    res.json({ message: 'User deleted' });
});

// Get active sessions (admin only)
app.get('/api/admin/sessions', auth, adminAuth, (req, res) => {
    const sessions = Array.from(activeSessions.values()).map(session => ({
        userId: session.userId,
        username: session.username,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity
    }));
    res.json(sessions);
});

// Revoke all sessions for a user (admin only)
app.post('/api/admin/revoke-sessions/:userId', auth, adminAuth, (req, res) => {
    const userId = req.params.userId;
    let revokedCount = 0;
    
    for (const [sessionId, session] of activeSessions.entries()) {
        if (session.userId === userId) {
            blacklistedTokens.add(session.token);
            activeSessions.delete(sessionId);
            revokedCount++;
        }
    }
    
    res.json({ message: `Revoked ${revokedCount} sessions` });
});

// Force HTTPS (except localhost for development)
app.use((req, res, next) => {
    const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
    if (!isLocalhost && req.header('x-forwarded-proto') !== 'https') {
        return res.redirect(`https://${req.header('host')}${req.url}`);
    }
    next();
});

// Error handling middleware
app.use((err, req, res, next) => {
    if (err.code === 'ECONNABORTED' || err.message === 'request aborted') {
        return; // Silently ignore aborted requests
    }
    console.error('Server error:', err);
    if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(3000, () => {
    console.log('Server running on port 3000');
    if (process.env.NODE_ENV !== 'production') {
        console.log('⚠️  Development mode - Security features enabled');
    }
    
    // Initialize Redis connection
    console.log('Initializing Redis connection...');
    redisClient.connect().then(() => {
        console.log('✓ Redis initialized');
    }).catch(err => {
        console.error('Redis initialization failed:', err.message);
    });
});