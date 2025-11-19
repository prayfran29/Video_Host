const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { body, validationResult, param } = require('express-validator');
const crypto = require('crypto');
const config = require('./config/config');
const QRCode = require('qrcode');
const redisClient = require('./http-redis-client');
const app = express();



// Trust proxy for Cloudflare tunnel (localhost only)
app.set('trust proxy', 'loopback');

// Security middleware with CSP for video
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-hashes'", "https://static.cloudflareinsights.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            mediaSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "https://cloudflareinsights.com"]
        }
    }
}));

// Add CORS headers for all requests
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range');
    res.header('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: { error: 'Too many login attempts, try again later' }
});
app.use(express.json({ limit: '10mb' }));
app.use(express.static('.'));

// Log all requests
app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.path} - ${req.headers['user-agent']?.substring(0, 30)}`);
    if (req.path.includes('/videos/')) {
        console.log(`🎬 VIDEO REQUEST: ${req.method} ${req.path}`);
        console.log(`📊 Range: ${req.headers.range || 'none'}`);
    }
    next();
});

// Handle request timeouts (longer for video streaming)
app.use((req, res, next) => {
    const timeout = req.path.includes('/videos/') ? 300000 : 30000; // 5 minutes for videos
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
    console.error('❌ JWT_SECRET not set! Set JWT_SECRET environment variable.');
    process.exit(1);
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
// QR tokens now stored in Redis for replica sharing
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



// Cache for video structure
let videoCache = { series: [], genres: {}, lastScan: 0 };
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Validate videos directory on startup
if (!config.validateVideosPath()) {
    console.error('⚠️  Videos directory validation failed. Check permissions and path.');
}

// Scan video structure on startup
function scanVideoStructure() {
    try {
        console.log('🔍 Scanning video structure...');
        const series = [];
        const genres = {};
        
        if (!fs.existsSync(videosDir)) {
            console.error('Videos directory not found:', videosDir);
            return;
        }
        
        const rootItems = fs.readdirSync(videosDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory() && dirent.name !== 'Adult');
        
        for (const item of rootItems) {
            if (!validatePath(item.name)) continue;
            
            const itemPath = path.join(videosDir, item.name);
            if (!fs.existsSync(itemPath)) continue;
            
            const files = fs.readdirSync(itemPath);
            const videos = files.filter(f => f.match(/\.(mp4|webm|ogg|avi|mkv)$/i));
            
            if (videos.length > 0) {
                const thumbnail = files.find(f => f.toLowerCase() === 'img' || f.startsWith('img.'));
                const seriesData = {
                    id: item.name,
                    title: item.name,
                    genre: 'Root',
                    thumbnail: thumbnail ? `/videos/${encodeURIComponent(item.name)}/${encodeURIComponent(thumbnail)}` : null,
                    videoCount: videos.length,
                    videos: videos.map(v => ({
                        filename: v,
                        url: `/videos/${encodeURIComponent(item.name)}/${encodeURIComponent(v)}`
                    }))
                };
                series.push(seriesData);
                if (!genres['Other']) genres['Other'] = [];
                genres['Other'].push(seriesData);
            } else {
                const subItems = fs.readdirSync(itemPath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory());
                
                if (!genres[item.name]) genres[item.name] = [];
                
                for (const subItem of subItems) {
                    if (!validatePath(subItem.name)) continue;
                    
                    const subPath = path.join(itemPath, subItem.name);
                    if (!fs.existsSync(subPath)) continue;
                    
                    const subFiles = fs.readdirSync(subPath);
                    const subVideos = subFiles.filter(f => f.match(/\.(mp4|webm|ogg|avi|mkv)$/i));
                    
                    if (subVideos.length > 0) {
                        const thumbnail = subFiles.find(f => f.toLowerCase() === 'img' || f.startsWith('img.'));
                        const seriesData = {
                            id: `${item.name}/${subItem.name}`,
                            title: subItem.name,
                            genre: item.name,
                            thumbnail: thumbnail ? `/videos/${encodeURIComponent(item.name)}/${encodeURIComponent(subItem.name)}/${encodeURIComponent(thumbnail)}` : null,
                            videoCount: subVideos.length,
                            videos: subVideos.map(v => ({
                                filename: v,
                                url: `/videos/${encodeURIComponent(item.name)}/${encodeURIComponent(subItem.name)}/${encodeURIComponent(v)}`
                            }))
                        };
                        series.push(seriesData);
                        genres[item.name].push(seriesData);
                    }
                }
            }
        }
        
        videoCache = { series, genres, lastScan: Date.now() };
        console.log(`✓ Scanned ${series.length} series in ${Object.keys(genres).length} genres`);
    } catch (error) {
        console.error('Error scanning video structure:', error);
    }
}

// Initial scan
scanVideoStructure();

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
        
        // Validate session if sessionId exists
        if (decoded.sessionId) {
            try {
                const session = await redisClient.getSession(decoded.sessionId);
                if (!session) {
                    return res.status(401).json({ error: 'Session not found' });
                }
                
                // Update session activity
                session.lastActivity = new Date();
                await redisClient.setSession(decoded.sessionId, session);
            } catch (sessionError) {
                // Redis session error, but allow request to continue for TV compatibility
                console.warn('Session validation failed:', sessionError.message);
            }
        }
        
        req.user = decoded;
        req.token = token;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        res.status(401).json({ error: 'Invalid token' });
    }
};





// Public video serving with streaming optimizations
app.use('/videos', (req, res, next) => {
    console.log(`🎬 Video request: ${req.method} ${req.path}`);
    console.log(`📡 Headers: Range=${req.headers.range || 'none'}, User-Agent=${req.headers['user-agent']?.substring(0, 50)}`);
    
    // Add streaming headers for better video compatibility
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    const filePath = req.path;
    
    // Validate file path
    if (!validatePath(filePath)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check file exists and is within videos directory
    let fullPath = path.join(videosDir, filePath);
    
    if (!fullPath.startsWith(videosDir)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    // Handle case sensitivity issues with case-insensitive matching
    const pathParts = filePath.split('/').filter(p => p).map(p => decodeURIComponent(p));
    let resolvedPath = videosDir;
    let pathResolved = true;
    
    for (const part of pathParts) {
        if (!fs.existsSync(resolvedPath)) {
            pathResolved = false;
            break;
        }
        
        const items = fs.readdirSync(resolvedPath);
        const matchedItem = items.find(item => item.toLowerCase() === part.toLowerCase());
        
        if (matchedItem) {
            resolvedPath = path.join(resolvedPath, matchedItem);
        } else {
            resolvedPath = path.join(resolvedPath, part);
            pathResolved = false;
            break;
        }
    }
    
    if (pathResolved && fs.existsSync(resolvedPath)) {
        fullPath = resolvedPath;
    }
    
    // Handle video streaming with range requests
    if (req.path.match(/\.(mp4|webm|ogg|avi|mkv)$/i)) {
        return streamVideo(req, res, fullPath);
    }
    
    // Handle other files (thumbnails, etc.)
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

// Unified progressive streaming function for all devices
function streamVideo(req, res, videoPath) {
    if (!fs.existsSync(videoPath)) {
        return res.status(404).json({ error: 'Video not found' });
    }
    
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    // Log video info for diagnostics
    const fileName = path.basename(videoPath);
    const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(1);
    console.log(`📹 Progressive streaming: ${fileName} (${fileSizeMB}MB)`);
    console.log(`🔍 Range header: ${range || 'No range'}`);
    
    // Unified streaming headers optimized for all devices
    const headers = {
        'Accept-Ranges': 'bytes',
        'Content-Type': 'video/mp4',
        'Cache-Control': 'public, max-age=3600',
        'Connection': 'keep-alive',
        'X-Content-Type-Options': 'nosniff'
    };
    
    res.set(headers);
    
    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        // Use larger initial chunk for faster startup, then smaller chunks
        const isFirstChunk = start === 0;
        const chunkSize = isFirstChunk ? (2 * 1024 * 1024) : (512 * 1024); // 2MB first, then 512KB
        const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + chunkSize - 1, fileSize - 1);
        const chunksize = (end - start) + 1;
        
        console.log(`📦 Progressive chunk: ${(chunksize / (1024 * 1024)).toFixed(1)}MB`);
        
        res.status(206).set({
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Content-Length': chunksize
        });
        
        const stream = fs.createReadStream(videoPath, { start, end });
        
        stream.on('error', (err) => {
            console.error(`❌ Stream error: ${err.message}`);
            if (!res.headersSent) res.status(500).end();
        });
        
        req.on('close', () => {
            stream.destroy();
        });
        
        stream.pipe(res);
    } else {
        res.set('Content-Length', fileSize);
        const stream = fs.createReadStream(videoPath);
        
        stream.on('error', (err) => {
            console.error(`❌ Stream error: ${err.message}`);
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
        let user = users.find(u => u.username === username);
        
        if (!user || !await bcrypt.compare(password, user.password)) {
            // Auto-create TV accounts for device-specific logins
            if (username.startsWith('TV-') && password === 'TVPass123!') {
                const hashedPassword = await bcrypt.hash('TVPass123!', 12);
                const newTVUser = {
                    id: crypto.randomUUID(),
                    username: username,
                    password: hashedPassword,
                    createdAt: new Date().toISOString(),
                    approved: true,
                    adultAccess: false
                };
                users.push(newTVUser);
                saveUsers();
                user = newTVUser;
            } else {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
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
        
        // Store active session in Redis with error handling
        try {
            await redisClient.setSession(sessionId, {
                userId: user.id,
                username,
                token,
                createdAt: new Date(),
                lastActivity: new Date()
            });
        } catch (sessionError) {
            console.warn('Failed to store session in Redis:', sessionError.message);
            // Continue without session storage for TV compatibility
        }
        
        // Set auth token as cookie for video requests
        res.cookie('authToken', token, {
            httpOnly: false, // Allow JavaScript access for debugging
            secure: false, // Set to true in production with HTTPS
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });
        
        res.json({ token, username, adultAccess: user.adultAccess || false });
    }
);

// QR Code login endpoints
app.post('/api/qr-login', async (req, res) => {
    const token = crypto.randomUUID();
    const qrData = { 
        authenticated: false, 
        createdAt: Date.now(),
        expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes for better UX
    };
    
    try {
        await redisClient.setQRToken(token, qrData);
        res.json({ token });
    } catch (error) {
        console.error('Failed to store QR token:', error);
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

app.get('/api/qr-login/:token', async (req, res) => {
    const token = req.params.token;
    try {
        const qrData = await redisClient.getQRToken(token);
        
        if (!qrData) {
            return res.status(404).json({ error: 'Token not found' });
        }
        
        if (Date.now() > qrData.expiresAt) {
            await redisClient.deleteQRToken(token);
            return res.status(404).json({ error: 'Token expired' });
        }
        
        res.json({ 
            authenticated: qrData.authenticated || false,
            authToken: qrData.authToken || null,
            username: qrData.username || null
        });
    } catch (error) {
        console.error('QR polling error:', error);
        res.status(500).json({ error: 'Polling failed' });
    }
});

// QR Auth page for mobile
app.get('/qr-auth', async (req, res) => {
    const token = req.query.token;
    if (!token) {
        return res.status(404).send('Invalid QR code');
    }
    
    try {
        const qrData = await redisClient.getQRToken(token);
        console.log(`QR auth page accessed for token: ${token}, data:`, qrData);
        if (!qrData) {
            return res.status(404).send('QR code not found');
        }
        if (Date.now() > qrData.expiresAt) {
            await redisClient.deleteQRToken(token);
            return res.status(404).send('QR code expired');
        }
    } catch (error) {
        console.error('QR auth page error:', error);
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
    
    console.log(`QR auth attempt for token: ${token}, username: ${username}`);
    
    try {
        const qrData = await redisClient.getQRToken(token);
        console.log(`QR data retrieved:`, qrData);
        
        if (!qrData) {
            console.log('QR token not found');
            return res.status(404).json({ error: 'Token not found' });
        }
        
        if (Date.now() > qrData.expiresAt) {
            console.log('QR token expired');
            await redisClient.deleteQRToken(token);
            return res.status(404).json({ error: 'Token expired' });
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
        const updatedQrData = {
            ...qrData,
            authenticated: true,
            authToken,
            username
        };
        
        await redisClient.setQRToken(token, updatedQrData);
        console.log(`QR token updated with auth data for ${username}`);
        res.json({ message: 'Login successful' });
    } catch (error) {
        console.error('QR auth error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
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
        // Check if cache is still valid
        if (Date.now() - videoCache.lastScan > CACHE_DURATION) {
            scanVideoStructure();
        }
        
        const { search } = req.query;
        if (search) {
            const sanitizedSearch = search.replace(/[^a-zA-Z0-9\s]/g, '').toLowerCase();
            const filtered = videoCache.series.filter(s => 
                s.title.toLowerCase().includes(sanitizedSearch)
            );
            return res.json(filtered);
        }
        
        res.json(videoCache.series);
    } catch (error) {
        console.error('Series loading error:', error);
        console.error('Videos directory:', videosDir);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: 'Failed to load series: ' + error.message });
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
        // Check if cache is still valid
        if (Date.now() - videoCache.lastScan > CACHE_DURATION) {
            scanVideoStructure();
        }
        
        res.json(videoCache.genres);
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
        try {
            const seriesId = decodeURIComponent(req.params[0]); // Decode URL-encoded path
            
            // Handle both root series and genre/series paths
            const pathParts = seriesId.split('/').map(part => decodeURIComponent(part));
            if (pathParts.some(part => !validatePath(part))) {
                return res.status(400).json({ error: 'Invalid series path' });
            }
            
            const seriesPath = path.join(videosDir, ...pathParts);
            
            if (!fs.existsSync(seriesPath)) {
                console.error(`Series not found: ${seriesPath}`);
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
                .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())) // Case-insensitive sort
                .map(v => ({
                    filename: v,
                    url: `/videos/${pathParts.map(p => encodeURIComponent(p)).join('/')}/${encodeURIComponent(v)}`,
                    title: v.replace(/\.[^/.]+$/, "").replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                }));
            
            if (videos.length === 0) {
                return res.status(404).json({ error: 'No videos found in series' });
            }
            
            const seriesTitle = pathParts[pathParts.length - 1]; // Use last part as title
            
            res.json({
                id: seriesId,
                title: seriesTitle,
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

