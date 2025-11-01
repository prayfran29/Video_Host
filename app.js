const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { body, validationResult, param } = require('express-validator');
const crypto = require('crypto');
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
// Rate limiting disabled for development
// const authLimiter = rateLimit({
//     windowMs: 15 * 60 * 1000,
//     max: 50,
//     message: { error: 'Too many login attempts, try again later' }
// });
app.use(express.json({ limit: '10mb' }));
app.use(express.static('.'));

// Admin page route
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
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

if (fs.existsSync(usersFile)) {
    try {
        const data = fs.readFileSync(usersFile, 'utf8');
        users = JSON.parse(data);
    } catch (error) {
        console.error('Failed to load users file, starting fresh');
        users = [];
    }
}

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

// Ensure videos directory exists
const videosDir = path.join(__dirname, 'videos');
if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir);
}

// Auth middleware with token expiration
const auth = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Access denied' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        // Check if token is expired (24 hours)
        if (Date.now() >= decoded.exp * 1000) {
            return res.status(401).json({ error: 'Token expired' });
        }
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// Secure video serving with auth
app.use('/videos', auth, (req, res, next) => {
    const filePath = req.path;
    
    // Validate file path
    if (!validatePath(filePath)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check file exists and is within videos directory
    const fullPath = path.join(__dirname, 'videos', filePath);
    const videosDir = path.join(__dirname, 'videos');
    
    if (!fullPath.startsWith(videosDir)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    next();
}, express.static('videos'));

// Routes with validation
app.post('/api/register', 
    // authLimiter,
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
            // Auto-approve Magnus
            const user = { 
                id: crypto.randomUUID(), 
                username, 
                password: hashedPassword,
                createdAt: new Date().toISOString(),
                approved: true
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
                approved: false
            };
            pendingUsers.push(pendingUser);
            savePending();
            res.json({ message: 'Registration submitted. Awaiting admin approval.' });
        }
    }
);

app.post('/api/login',
    // authLimiter,
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
        
        const token = jwt.sign(
            { id: user.id, username },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({ token, username });
    }
);

// Get all series from videos directory with auth (supports genre folders)
app.get('/api/series', auth, (req, res) => {
    try {
        const videosDir = path.join(__dirname, 'videos');
        
        if (!fs.existsSync(videosDir)) {
            return res.json([]);
        }
        
        const series = [];
        
        // Scan root videos directory
        const rootItems = fs.readdirSync(videosDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory());
        
        for (const item of rootItems) {
            if (!validatePath(item.name)) continue;
            
            const itemPath = path.join(videosDir, item.name);
            if (!fs.existsSync(itemPath)) continue;
            
            const files = fs.readdirSync(itemPath);
            const videos = files.filter(f => f.match(/\.(mp4|webm|ogg|avi|mkv)$/i));
            
            if (videos.length > 0) {
                // This is a series folder
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

// Get series grouped by genre
app.get('/api/genres', auth, (req, res) => {
    try {
        const videosDir = path.join(__dirname, 'videos');
        
        if (!fs.existsSync(videosDir)) {
            return res.json({});
        }
        
        const genres = {};
        const rootItems = fs.readdirSync(videosDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory());
        
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
            
            const seriesPath = path.join(__dirname, 'videos', ...pathParts);
            
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
                    title: v.replace(/\.[^/.]+$/, "")
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

// Force HTTPS in production
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        if (req.header('x-forwarded-proto') !== 'https') {
            res.redirect(`https://${req.header('host')}${req.url}`);
        } else {
            next();
        }
    });
}

app.listen(3000, () => {
    console.log('Server running on port 3000');
    if (process.env.NODE_ENV !== 'production') {
        console.log('⚠️  Development mode - Security features enabled');
    }
});