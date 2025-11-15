let currentUser = null;
let authToken = localStorage.getItem('authToken');
let watchProgress = {};
let currentSeries = null;
let currentVideoIndex = 0;

// Initialize - check for existing login
document.addEventListener('DOMContentLoaded', () => {
    // Show TV-only buttons (Android WebView only)
    if (navigator.userAgent.includes('wv')) {
        document.getElementById('reloadBtn').style.display = 'inline-block';
        if (typeof Android !== 'undefined') {
            document.getElementById('exitBtn').style.display = 'inline-block';
        }
    }
    
    // Check if we have a valid token
    if (authToken) {
        currentUser = JSON.parse(localStorage.getItem('currentUser'));
        if (currentUser) {
            updateUI();
            document.querySelector('main').style.display = 'block';
            loadSeries();
        } else {
            showLoginModal();
        }
    } else {
        showLoginModal();
    }
    
    // Make sure the page is visible
    document.body.style.display = 'block';
    
    // Clear search field
    if (document.getElementById('searchInput')) {
        document.getElementById('searchInput').value = '';
    }
    
    // Set current year in footer
    const yearElement = document.getElementById('currentYear');
    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }
});

function showLoginModal() {
    document.getElementById('authModal').style.display = 'block';
    document.querySelector('main').style.display = 'none';
}

// Authentication
function toggleAuth() {
    if (currentUser) {
        logout();
    } else {
        document.getElementById('authModal').style.display = 'block';
    }
}

function closeAuth() {
    if (currentUser) {
        document.getElementById('authModal').style.display = 'none';
    }
}

function showLogin() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('qrLoginForm').style.display = 'none';
    if (qrPollInterval) {
        clearInterval(qrPollInterval);
        qrPollInterval = null;
    }
}

function showRegister() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
    document.getElementById('qrLoginForm').style.display = 'none';
}

function showQRLogin() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('qrLoginForm').style.display = 'block';
    generateQRLogin();
}

let qrPollInterval = null;

async function generateQRLogin() {
    try {
        const response = await fetch('/api/qr-login', { method: 'POST' });
        const data = await response.json();
        
        if (response.ok) {
            const qrUrl = `${window.location.origin}/qr-auth?token=${data.token}`;
            
            // Show QR code and URL with TV compatibility
            const qrContainer = document.getElementById('qrCode');
            qrContainer.innerHTML = `
                <div style="padding:2rem;border:2px solid #0066ff;text-align:center;background:#222;border-radius:8px;">
                    <p style="margin:0;color:#0066ff;font-weight:bold;font-size:1.2rem;">📱 Scan or Visit</p>
                    <div id="qrImageContainer" style="margin:1rem 0;">
                        <div style="color:#999;padding:2rem;">Loading QR Code...</div>
                    </div>
                    <p style="margin:1rem 0;font-size:0.9rem;color:#999;">Or visit this URL:</p>
                    <div style="background:#333;padding:1rem;border-radius:4px;margin:1rem 0;">
                        <p style="margin:0;font-size:0.8rem;word-break:break-all;color:#fff;font-family:monospace;">${qrUrl}</p>
                    </div>
                </div>
            `;
            
            // Load QR image with TV-compatible fallback
            const qrImg = new Image();
            qrImg.onload = function() {
                document.getElementById('qrImageContainer').innerHTML = `
                    <img src="/api/qr/${data.token}" alt="QR Code" 
                         style="border:4px solid #0066ff;border-radius:8px;background:#fff;padding:10px;max-width:250px;width:250px;height:250px;">
                `;
            };
            qrImg.onerror = function() {
                // Fallback for TV browsers that can't load the QR image
                document.getElementById('qrImageContainer').innerHTML = `
                    <div style="border:4px solid #0066ff;border-radius:8px;background:#333;padding:2rem;margin:1rem auto;max-width:250px;">
                        <p style="color:#0066ff;font-size:1.1rem;margin:0;">📱 QR Code</p>
                        <p style="color:#999;font-size:0.9rem;margin:0.5rem 0;">Use mobile device to scan</p>
                        <p style="color:#fff;font-size:0.8rem;margin:0;">Token: ${data.token}</p>
                    </div>
                `;
            };
            qrImg.src = `/api/qr/${data.token}`;

            
            document.getElementById('qrStatus').textContent = 'Waiting for login...';
            
            // Poll for login completion
            qrPollInterval = setInterval(() => checkQRLogin(data.token), 2000);
        } else {
            document.getElementById('qrStatus').textContent = 'Failed to generate QR code';
            document.getElementById('qrCode').innerHTML = `
                <div style="padding:2rem;border:2px solid #0066ff;text-align:center;background:#222;border-radius:8px;">
                    <p style="color:#0066ff;font-size:1.1rem;margin:0;">❌ QR Generation Failed</p>
                    <p style="color:#999;font-size:0.9rem;margin:1rem 0;">Please use username/password login</p>
                </div>
            `;
        }
    } catch (error) {
        document.getElementById('qrStatus').textContent = 'Error generating QR code';
    }
}

async function checkQRLogin(token) {
    try {
        const response = await fetch(`/api/qr-login/${token}`);
        const data = await response.json();
        
        if (response.ok && data.authenticated) {
            clearInterval(qrPollInterval);
            authToken = data.authToken;
            currentUser = { username: data.username };
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            updateUI();
            closeAuth();
            document.querySelector('main').style.display = 'block';
            loadSeries();
        }
    } catch (error) {
        // Silent fail, keep polling
    }
}

async function login() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        if (response.ok) {
            authToken = data.token;
            currentUser = { username: data.username, adultAccess: data.adultAccess };
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            updateUI();
            closeAuth();
            document.querySelector('main').style.display = 'block';
            loadSeries();
        } else {
            alert(data.error);
        }
    } catch (error) {
        alert('Login failed');
    }
}

async function register() {
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
    
    // Frontend validation
    if (!username || username.length < 3 || username.length > 30) {
        alert('Username must be 3-30 characters');
        return;
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        alert('Username can only contain letters, numbers, and underscores');
        return;
    }
    
    if (password.length < 8) {
        alert('Password must be at least 8 characters');
        return;
    }
    
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/.test(password)) {
        alert('Password must contain uppercase, lowercase, number, and special character (@$!%*?&)');
        return;
    }
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        if (response.ok) {
            alert('Registration submitted! Please wait for admin approval.');
            showLogin();
        } else {
            alert(data.error);
        }
    } catch (error) {
        alert('Registration failed');
    }
}

function logout() {
    currentUser = null;
    authToken = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    updateUI();
    document.getElementById('authModal').style.display = 'block';
    document.querySelector('main').style.display = 'none';
}

function updateUI() {
    const profileBtn = document.querySelector('.profile-btn');
    const adminBtn = document.getElementById('adminButton');
    const adultBtn = document.getElementById('adultButton');
    
    if (currentUser) {
        profileBtn.textContent = `👤 ${currentUser.username} (Logout)`;
        profileBtn.style.backgroundColor = '#0066ff';
        
        if (currentUser.username === 'Magnus') {
            adminBtn.style.display = 'inline-block';
        }
        
        if (currentUser.adultAccess || currentUser.username === 'Magnus') {
            adultBtn.style.display = 'inline-block';
        }
    } else {
        profileBtn.textContent = '👤 Login';
        profileBtn.style.backgroundColor = '#333';
        adminBtn.style.display = 'none';
        adultBtn.style.display = 'none';
    }
}

function goToAdmin() {
    window.location.href = '/admin';
}

function goToAdult() {
    if (!authToken) {
        alert('Please login first');
        return;
    }
    window.location.href = `/adult?token=${encodeURIComponent(authToken)}`;
}

// Series functionality
async function loadSeries() {
    if (!authToken) return;
    
    try {
        const [seriesResponse, genresResponse] = await Promise.all([
            fetch('/api/series', { headers: { 'Authorization': `Bearer ${authToken}` } }),
            fetch('/api/genres', { headers: { 'Authorization': `Bearer ${authToken}` } })
        ]);
        
        if (seriesResponse.status === 401 || genresResponse.status === 401) {
            handleSessionExpired();
            return;
        }
        
        const series = await seriesResponse.json();
        const genres = await genresResponse.json();
        
        if (currentUser) {
            await loadWatchProgress();
        }
        
        renderGenres(genres);
        renderSeries(series);
    } catch (error) {
        // Silent fail
    }
}

function activateSearch() {
    const searchInput = document.getElementById('searchInput');
    searchInput.removeAttribute('readonly');
    searchInput.focus();
}

async function searchVideos() {
    if (!authToken) return;
    
    const query = document.getElementById('searchInput').value;
    try {
        const response = await fetch(`/api/series?search=${encodeURIComponent(query)}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const series = await response.json();
        renderSeries(series);
        hideSearchResults();
    } catch (error) {
        // Silent fail
    }
}

async function showSearchResults() {
    if (!authToken) return; // Don't search if not logged in
    
    const query = document.getElementById('searchInput').value.trim();
    const resultsDiv = document.getElementById('searchResults');
    
    if (query.length < 2) {
        resultsDiv.style.display = 'none';
        return;
    }
    
    try {
        const response = await fetch(`/api/series?search=${encodeURIComponent(query)}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.status === 401) {
            handleSessionExpired();
            return;
        }
        
        const series = await response.json();
        
        if (series.length === 0) {
            resultsDiv.innerHTML = '<div class="search-item">No results found</div>';
        } else {
            resultsDiv.innerHTML = series.slice(0, 5).map(s => 
                `<div class="search-item" onclick="selectSeries('${s.id}')">
                    <img src="${s.thumbnail || ''}" alt="${s.title}" class="search-thumb">
                    <div class="search-info">
                        <div class="search-title">${s.title}</div>
                        <div class="search-count">${s.videoCount} videos</div>
                    </div>
                </div>`
            ).join('');
        }
        
        resultsDiv.style.display = 'block';
    } catch (error) {
        // Silent fail
    }
}

function hideSearchResults() {
    document.getElementById('searchResults').style.display = 'none';
    const searchInput = document.getElementById('searchInput');
    searchInput.value = '';
    searchInput.setAttribute('readonly', true);
    searchInput.blur();
}

async function selectSeries(seriesId) {
    if (!authToken) return;
    
    try {
        const response = await fetch(`/api/series/${seriesId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const series = await response.json();
        openSeries(series);
        hideSearchResults();
    } catch (error) {
        // Silent fail
    }
}

async function loadWatchProgress() {
    if (!authToken) return;
    try {
        const response = await fetch('/api/progress', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (response.ok) {
            watchProgress = await response.json();
        }
    } catch (error) {
        // Silent fail
    }
}

function renderGenres(genres) {
    const genreSections = document.getElementById('genreSections');
    genreSections.innerHTML = '';
    
    Object.entries(genres).forEach(([genreName, seriesList]) => {
        if (seriesList.length === 0) return;
        
        const section = document.createElement('div');
        section.className = 'section';
        section.innerHTML = `
            <h3>${genreName}</h3>
            <div class="genre-swimlane" id="genre-${genreName.replace(/\s+/g, '-')}">
            </div>
        `;
        
        const swimlane = section.querySelector('.genre-swimlane');
        seriesList.forEach(series => {
            const card = createSeriesCard(series);
            swimlane.appendChild(card);
        });
        
        genreSections.appendChild(section);
    });
    
    // Update navigation after genres load
    updateSwimlanes();
}

function renderSeries(series) {
    // Continue Watching section
    const continueGrid = document.getElementById('continueWatchingGrid');
    continueGrid.innerHTML = '';
    
    if (currentUser) {
        const inProgress = series.filter(s => 
            watchProgress[s.id] && 
            Object.values(watchProgress[s.id]).some(v => !v.completed)
        ).sort((a, b) => {
            const aLastWatched = Math.max(...Object.values(watchProgress[a.id] || {}).map(v => new Date(v.lastWatched || 0).getTime()));
            const bLastWatched = Math.max(...Object.values(watchProgress[b.id] || {}).map(v => new Date(v.lastWatched || 0).getTime()));
            return bLastWatched - aLastWatched;
        });
        
        inProgress.forEach(series => {
            const card = createSeriesCard(series, true);
            continueGrid.appendChild(card);
        });
    }
    
    // All Series section
    const allSeriesGrid = document.getElementById('allSeriesGrid');
    allSeriesGrid.innerHTML = '';
    series.forEach(series => {
        const card = createSeriesCard(series);
        allSeriesGrid.appendChild(card);
    });
    
    // Update navigation after content loads
    updateSwimlanes();
}

function createSeriesCard(series, showProgress = false) {
    const card = document.createElement('div');
    card.className = 'content-card';
    card.tabIndex = 0; // Make focusable for TV navigation
    
    let lastWatchedEpisode = null;
    
    if (showProgress && watchProgress[series.id]) {
        // Find last watched video
        const progressEntries = Object.entries(watchProgress[series.id]);
        const lastWatched = progressEntries.reduce((latest, [filename, progress]) => {
            const watchTime = new Date(progress.lastWatched || 0).getTime();
            return watchTime > latest.time ? { filename, time: watchTime, progress } : latest;
        }, { filename: null, time: 0, progress: null });
        
        if (lastWatched.filename) {
            // Find the episode title for display
            const video = series.videos?.find(v => v.filename === lastWatched.filename);
            if (video) {
                lastWatchedEpisode = video.title || video.filename.replace(/\.[^/.]+$/, "").replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            }
            
            card.onclick = async () => {
                if (video) {
                    const videoIndex = series.videos.indexOf(video);
                    // Load full series data to ensure proper episode titles
                    try {
                        const response = await fetch(`/api/series/${series.id}`, {
                            headers: { 'Authorization': `Bearer ${authToken}` }
                        });
                        if (response.ok) {
                            currentSeries = await response.json();
                        } else {
                            currentSeries = series;
                        }
                    } catch (error) {
                        currentSeries = series;
                    }
                    playVideo(video.url, video.filename, video.title || video.filename.replace(/\.[^/.]+$/, ""), videoIndex);
                } else {
                    openSeries(series);
                }
            };
        } else {
            card.onclick = () => openSeries(series);
        }
    } else {
        card.onclick = () => openSeries(series);
    }
    
    let progressText = `${series.videoCount} videos`;
    let episodeInfo = '';
    
    if (showProgress && watchProgress[series.id]) {
        const completed = Object.values(watchProgress[series.id]).filter(v => v.completed).length;
        progressText = `${completed}/${series.videoCount} completed`;
        
        if (lastWatchedEpisode) {
            episodeInfo = `<div class="episode-info">Last: ${lastWatchedEpisode}</div>`;
        }
    }
    
    const genreText = series.genre && series.genre !== 'Root' ? `${series.genre} • ` : '';
    
    card.innerHTML = `
        <div class="card-image">
            ${series.thumbnail ? `<img src="${series.thumbnail}" alt="${series.title}" loading="lazy">` : ''}
        </div>
        <div class="card-info">
            <h4>${series.title}</h4>
            <p>${genreText}${progressText}</p>
            ${episodeInfo}
        </div>
    `;
    
    // Remove swimlane border when individual card gets focus
    card.addEventListener('focus', () => {
        document.querySelectorAll('.swimlane-focused').forEach(el => {
            el.classList.remove('swimlane-focused');
        });
    });
    
    // Also remove on mouse over for consistency
    card.addEventListener('mouseenter', () => {
        document.querySelectorAll('.swimlane-focused').forEach(el => {
            el.classList.remove('swimlane-focused');
        });
    });
    
    return card;
}

async function openSeries(series) {
    if (!authToken) return;
    
    try {
        const response = await fetch(`/api/series/${series.id}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (response.ok) {
            currentSeries = await response.json();
            showSeriesModal(currentSeries);
        } else {
            alert('Failed to load series');
        }
    } catch (error) {
        alert('Error loading series');
    }
}

function showSeriesModal(series) {
    const modal = document.getElementById('seriesModal');
    const title = document.getElementById('seriesTitle');
    const videoList = document.getElementById('videoList');
    
    title.textContent = series.title;
    videoList.innerHTML = '';
    
    series.videos.forEach((video, index) => {
        const item = document.createElement('div');
        item.className = 'video-item';
        item.tabIndex = 0; // Make focusable for TV navigation
        
        let progressInfo = '';
        if (currentUser && watchProgress[series.id] && watchProgress[series.id][video.filename]) {
            const progress = watchProgress[series.id][video.filename];
            if (progress.completed) {
                progressInfo = ' ✓';
            } else {
                const percent = Math.round((progress.currentTime / progress.duration) * 100);
                progressInfo = ` (${percent}%)`;
            }
        }
        
        item.innerHTML = `
            <span>${video.title}${progressInfo}</span>
            <button onclick="playVideo('${video.url}', '${video.filename}', '${video.title}', ${index})">▶ Play</button>
        `;
        
        // Add keyboard support for each video item
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                playVideo(video.url, video.filename, video.title, index);
            }
        });
        
        videoList.appendChild(item);
    });
    
    modal.style.display = 'block';
    
    // Focus the modal content and trap focus
    setTimeout(() => {
        const firstItem = videoList.querySelector('.video-item');
        if (firstItem) {
            firstItem.focus();
        }
    }, 100);
}

function playVideo(url, filename, title, videoIndex = null) {
    const modal = document.getElementById('videoModal');
    const player = document.getElementById('videoPlayer');
    const videoTitle = document.getElementById('videoTitle');
    const details = document.getElementById('videoDetails');
    
    if (videoIndex !== null) {
        currentVideoIndex = videoIndex;
    }
    
    // Reset player and show loading
    player.src = '';
    document.getElementById('videoLoading').style.display = 'block';
    
    videoTitle.textContent = title;
    details.textContent = currentSeries ? currentSeries.title : '';
    
    // Load video description
    loadVideoDescription(title);
    
    // Optimize video loading for streaming
    player.preload = 'none'; // Don't preload to save bandwidth
    player.setAttribute('playsinline', 'true');
    player.setAttribute('webkit-playsinline', 'true');
    
    // TV-specific enhancements
    player.setAttribute('controls', 'true');
    player.setAttribute('controlsList', 'nodownload');
    
    // Optimize for streaming
    if (player.canPlayType) {
        // Prefer hardware-accelerated formats
        const formats = ['video/mp4; codecs="avc1.42E01E"', 'video/webm; codecs="vp8"'];
        formats.forEach(format => {
            if (player.canPlayType(format) === 'probably') {
                console.log('Optimized format supported:', format);
            }
        });
    }
    
    // Enhanced error handling and retry logic for TV
    let retryCount = 0;
    let stallTimeout = null;
    
    player.onerror = () => {
        if (retryCount < 3) {
            retryCount++;
            document.getElementById('videoLoading').style.display = 'block';
            setTimeout(() => {
                player.load();
            }, 1000 * retryCount);
        }
    };
    
    // Handle stalling/buffering issues
    player.onstalled = player.onwaiting = () => {
        document.getElementById('videoLoading').style.display = 'block';
        // Auto-retry if stalled for more than 10 seconds
        stallTimeout = setTimeout(() => {
            if (retryCount < 2) {
                retryCount++;
                player.load();
            }
        }, 10000);
    };
    
    player.onprogress = player.oncanplaythrough = () => {
        if (stallTimeout) {
            clearTimeout(stallTimeout);
            stallTimeout = null;
        }
    };
    
    player.onloadstart = () => {
        document.getElementById('videoLoading').style.display = 'block';
    };
    
    player.oncanplay = () => {
        document.getElementById('videoLoading').style.display = 'none';
    };
    
    player.onwaiting = () => {
        document.getElementById('videoLoading').style.display = 'block';
    };
    
    player.onplaying = () => {
        document.getElementById('videoLoading').style.display = 'none';
    };
    
    // Flag to prevent progress restoration during manual seeking
    let progressRestored = false;
    let userSeeking = false;
    
    // Function to restore progress
    const restoreProgress = () => {
        if (progressRestored || userSeeking) return;
        if (currentUser && currentSeries && watchProgress[currentSeries.id] && watchProgress[currentSeries.id][filename]) {
            const progress = watchProgress[currentSeries.id][filename];
            const savedTime = progress.currentTime || 0;
            if (savedTime > 0 && Math.abs(player.currentTime - savedTime) > 5) {
                player.currentTime = savedTime;
                progressRestored = true;
            }
        }
    };
    
    // Track user seeking to prevent interference
    player.onseeking = () => {
        userSeeking = true;
        progressRestored = true; // Prevent future auto-restoration
    };
    
    player.onseeked = () => {
        userSeeking = false;
    };
    
    // Setup audio track detection and force audio
    player.onloadedmetadata = () => {
        setupAudioTracks();
        // Force audio for dual audio files
        if (player.audioTracks && player.audioTracks.length >= 2) {
            player.audioTracks[1].enabled = true;
            player.audioTracks[0].enabled = false;
        }
        player.volume = 0.3;
        player.muted = false;
        
        restoreProgress();
        
        // Auto-play when ready
        player.play().catch(() => {});
        
        // TV-specific: Enable fullscreen API
        enableFullscreenSupport(player);
    };
    
    // Fallback progress restoration for TV browsers
    player.oncanplay = () => {
        restoreProgress();
    };
    
    player.onloadeddata = () => {
        restoreProgress();
    };
    
    // Additional fallback after a short delay
    setTimeout(() => {
        if (player.readyState >= 2) {
            restoreProgress();
        }
    }, 1000);
    
    // Set source after event handlers
    player.src = url;
    
    updateVideoControls();
    
    // Save progress periodically and auto-play next
    if (currentUser && currentSeries) {
        player.ontimeupdate = () => saveProgress(filename, player.currentTime, player.duration);
        player.onended = () => {
            saveProgress(filename, player.duration, player.duration, true);
            playNextVideo();
        };
    } else {
        player.onended = () => playNextVideo();
    }
    
    modal.style.display = 'block';
    document.getElementById('seriesModal').style.display = 'none';
}

// TV-specific fullscreen support
function enableFullscreenSupport(player) {
    // Add fullscreen button to video controls
    const videoModal = document.getElementById('videoModal');
    const controlsDiv = videoModal.querySelector('.video-controls');
    
    // Remove existing fullscreen button and recreate for TV
    const existingBtn = document.getElementById('fullscreenBtn');
    if (existingBtn) {
        existingBtn.remove();
    }
    
    if (navigator.userAgent.includes('wv')) {
        const fullscreenBtn = document.createElement('button');
        fullscreenBtn.id = 'fullscreenBtn';
        fullscreenBtn.textContent = '⛶ Fullscreen';
        fullscreenBtn.tabIndex = 0;
        fullscreenBtn.onclick = () => toggleFullscreen(player);
        controlsDiv.insertBefore(fullscreenBtn, controlsDiv.firstChild);
    }
    
    // Handle fullscreen changes
    document.onfullscreenchange = document.onwebkitfullscreenchange = document.onmozfullscreenchange = document.onmsfullscreenchange = () => {
        const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
        const btn = document.getElementById('fullscreenBtn');
        if (btn) {
            btn.textContent = isFullscreen ? '⛶ Exit Fullscreen' : '⛶ Fullscreen';
            // Re-enable button functionality
            btn.onclick = () => toggleFullscreen(player);
        }
    };
}

// Toggle fullscreen function with cross-browser support
function toggleFullscreen(player) {
    const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    
    if (isFullscreen) {
        // Exit fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    } else {
        // Try video element fullscreen first (better for Android TV)
        if (player.requestFullscreen) {
            player.requestFullscreen();
        } else if (player.webkitRequestFullscreen) {
            player.webkitRequestFullscreen();
        } else if (player.webkitEnterFullscreen) {
            player.webkitEnterFullscreen();
        } else {
            // Fallback to container fullscreen
            const element = player.parentElement;
            if (element.requestFullscreen) {
                element.requestFullscreen();
            } else if (element.webkitRequestFullscreen) {
                element.webkitRequestFullscreen();
            } else if (element.mozRequestFullScreen) {
                element.mozRequestFullScreen();
            } else if (element.msRequestFullscreen) {
                element.msRequestFullscreen();
            }
        }
    }
}

let lastProgressSave = 0;

async function saveProgress(filename, currentTime, duration, completed = false) {
    if (!authToken || !currentSeries) return;
    
    // Throttle progress saves to every 10 seconds (except for completion)
    const now = Date.now();
    if (!completed && now - lastProgressSave < 10000) return;
    lastProgressSave = now;
    
    try {
        await fetch('/api/progress', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                seriesId: currentSeries.id,
                videoFile: filename,
                currentTime,
                duration,
                completed
            })
        });
        
        // Update local progress
        if (!watchProgress[currentSeries.id]) watchProgress[currentSeries.id] = {};
        watchProgress[currentSeries.id][filename] = { currentTime, duration, completed };
    } catch (error) {
        // Silent fail
    }
}

function closeVideo() {
    const modal = document.getElementById('videoModal');
    const player = document.getElementById('videoPlayer');
    
    // Save progress before closing
    if (currentUser && currentSeries && player.src) {
        const filename = player.src.split('/').pop().split('?')[0];
        if (filename && player.currentTime > 0) {
            saveProgress(decodeURIComponent(filename), player.currentTime, player.duration);
        }
    }
    
    // Aggressive memory cleanup for TV performance
    player.pause();
    player.currentTime = 0;
    player.removeAttribute('src');
    player.removeAttribute('poster');
    
    // Clear all event listeners
    const newPlayer = player.cloneNode(true);
    player.parentNode.replaceChild(newPlayer, player);
    
    modal.style.display = 'none';
    
    // Force garbage collection hints
    if (window.gc) window.gc();
    if (window.CollectGarbage) window.CollectGarbage();
}

async function backToSeries() {
    if (currentSeries) {
        const player = document.getElementById('videoPlayer');
        
        // Save progress before stopping
        if (currentUser && player.src) {
            const filename = player.src.split('/').pop().split('?')[0];
            if (filename && player.currentTime > 0) {
                saveProgress(decodeURIComponent(filename), player.currentTime, player.duration);
            }
        }
        
        // Stop video completely
        player.pause();
        player.removeAttribute('src');
        player.innerHTML = '<source src="" type="video/mp4">';
        
        document.getElementById('videoModal').style.display = 'none';
        
        // Reload series data to ensure proper episode titles
        try {
            const response = await fetch(`/api/series/${currentSeries.id}`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (response.ok) {
                currentSeries = await response.json();
            }
        } catch (error) {
            // Silent fail, use existing data
        }
        showSeriesModal(currentSeries);
    }
}

function updateVideoControls() {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    if (currentSeries && currentSeries.videos) {
        prevBtn.style.display = currentVideoIndex > 0 ? 'inline-block' : 'none';
        nextBtn.style.display = currentVideoIndex < currentSeries.videos.length - 1 ? 'inline-block' : 'none';
    } else {
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
    }
}

function playPreviousVideo() {
    if (currentSeries && currentVideoIndex > 0) {
        const prevVideo = currentSeries.videos[currentVideoIndex - 1];
        playVideo(prevVideo.url, prevVideo.filename, prevVideo.title, currentVideoIndex - 1);
    }
}

function playNextVideo() {
    if (currentSeries && currentVideoIndex < currentSeries.videos.length - 1) {
        const nextVideo = currentSeries.videos[currentVideoIndex + 1];
        playVideo(nextVideo.url, nextVideo.filename, nextVideo.title, currentVideoIndex + 1);
    }
}

function setupAudioTracks() {
    const player = document.getElementById('videoPlayer');
    const select = document.getElementById('audioTrackSelect');
    
    select.innerHTML = '';
    
    if (player.audioTracks && player.audioTracks.length > 0) {
        for (let i = 0; i < player.audioTracks.length; i++) {
            const track = player.audioTracks[i];
            const option = document.createElement('option');
            option.value = i;
            option.textContent = track.label || `Track ${i + 1}`;
            if (track.enabled) option.selected = true;
            select.appendChild(option);
        }
        document.querySelector('.audio-controls').style.display = 'block';
    } else {
        document.querySelector('.audio-controls').style.display = 'none';
    }
}

function switchAudioTrack() {
    const player = document.getElementById('videoPlayer');
    const select = document.getElementById('audioTrackSelect');
    const selectedIndex = parseInt(select.value);
    
    if (player.audioTracks) {
        for (let i = 0; i < player.audioTracks.length; i++) {
            player.audioTracks[i].enabled = (i === selectedIndex);
        }
    }
}

function closeSeries() {
    document.getElementById('seriesModal').style.display = 'none';
}

function goHome() {
    closeVideo();
    // Reload the main page content
    loadSeries();
}

// TV navigation state
let currentSwimlaneIndex = -1;
let swimlanes = [];

// Update swimlanes list when content loads
function updateSwimlanes() {
    swimlanes = [];
    const continueWatching = document.getElementById('continueWatchingGrid');
    const genreSections = document.querySelectorAll('.genre-swimlane');
    const allSeries = document.getElementById('allSeriesGrid');
    
    if (continueWatching && continueWatching.children.length > 0) {
        swimlanes.push({ element: continueWatching, name: 'Continue Watching' });
    }
    genreSections.forEach(section => {
        if (section.children.length > 0) {
            const sectionTitle = section.closest('.section')?.querySelector('h3')?.textContent || 'Genre';
            swimlanes.push({ element: section, name: sectionTitle });
        }
    });
    if (allSeries && allSeries.children.length > 0) {
        swimlanes.push({ element: allSeries, name: 'All Series' });
    }
}

// Focus swimlane function
function focusSwimlane(index) {
    if (index < 0 || index >= swimlanes.length) return;
    
    // Remove previous focus
    document.querySelectorAll('.swimlane-focused').forEach(el => {
        el.classList.remove('swimlane-focused');
    });
    
    currentSwimlaneIndex = index;
    const swimlane = swimlanes[index];
    swimlane.element.classList.add('swimlane-focused');
    
    // Instant scroll without animation
    const section = swimlane.element.closest('.section');
    const titleElement = section?.querySelector('h3');
    if (titleElement) {
        titleElement.scrollIntoView({ behavior: 'auto', block: 'start' });
        window.scrollBy(0, -120);
    }
    
    // Focus first card in swimlane
    const firstCard = swimlane.element.querySelector('.content-card');
    if (firstCard) {
        // Remove swimlane border when focusing first card
        setTimeout(() => {
            document.querySelectorAll('.swimlane-focused').forEach(el => {
                el.classList.remove('swimlane-focused');
            });
        }, 10);
        firstCard.focus();
    }
}

// TV remote control support
document.addEventListener('keydown', (event) => {
    const videoModal = document.getElementById('videoModal');
    const seriesModal = document.getElementById('seriesModal');
    const player = document.getElementById('videoPlayer');
    
    // Handle video modal controls
    if (videoModal.style.display === 'block') {
        const focusedElement = document.activeElement;
        const isButtonFocused = focusedElement && focusedElement.tagName === 'BUTTON';
        
        switch(event.key) {
            case 'ArrowLeft':
                if (isButtonFocused) {
                    // Allow normal button navigation
                    return;
                } else {
                    event.preventDefault();
                    if (player.currentTime > 10) {
                        player.currentTime -= 10;
                    }
                }
                break;
            case 'ArrowRight':
                if (isButtonFocused) {
                    // Allow normal button navigation
                    return;
                } else {
                    event.preventDefault();
                    if (player.currentTime < player.duration - 10) {
                        player.currentTime += 10;
                    }
                }
                break;
            case 'ArrowUp':
            case 'ArrowDown':
                if (isButtonFocused) {
                    // Allow navigation between buttons
                    return;
                } else {
                    // Prevent episode changes when video is focused
                    event.preventDefault();
                    event.stopPropagation();
                    // Focus the first button to enable navigation
                    const firstButton = videoModal.querySelector('button[tabindex="0"]');
                    if (firstButton) {
                        firstButton.focus();
                    }
                }
                break;
            case ' ':
            case 'Enter':
                if (!isButtonFocused) {
                    event.preventDefault();
                    if (player.paused) {
                        player.play();
                    } else {
                        player.pause();
                    }
                }
                break;
            case 'Escape':
            case 'Backspace':
                event.preventDefault();
                // Exit fullscreen first if in fullscreen mode
                const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
                if (isFullscreen) {
                    if (document.exitFullscreen) document.exitFullscreen();
                    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
                    else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
                    else if (document.msExitFullscreen) document.msExitFullscreen();
                } else {
                    closeVideo();
                }
                break;
            case 'f':
            case 'F':
                if (!isButtonFocused) {
                    event.preventDefault();
                    toggleFullscreen(player);
                }
                break;

        }
        return;
    }
    
    // Handle main page navigation
    const authModal = document.getElementById('authModal');
    if (videoModal.style.display !== 'block' && seriesModal.style.display !== 'block' && authModal.style.display !== 'block') {
        switch(event.key) {
            case 'ArrowDown':
                event.preventDefault();
                updateSwimlanes();
                if (currentSwimlaneIndex === -1) {
                    // Return to first swimlane from header
                    focusSwimlane(0);
                } else if (currentSwimlaneIndex < swimlanes.length - 1) {
                    focusSwimlane(currentSwimlaneIndex + 1);
                } else {
                    focusSwimlane(0); // Loop to top
                }
                break;
            case 'ArrowUp':
                event.preventDefault();
                updateSwimlanes();
                if (currentSwimlaneIndex > 0) {
                    focusSwimlane(currentSwimlaneIndex - 1);
                } else {
                    // Focus header buttons when at top swimlane
                    const searchBtn = document.querySelector('.search-btn');
                    if (searchBtn) {
                        searchBtn.focus();
                        currentSwimlaneIndex = -1; // Indicate we're in header
                    }
                }
                break;
            case 'ArrowLeft':
            case 'ArrowRight':
                if (currentSwimlaneIndex === -1) {
                    // Navigate between header buttons
                    event.preventDefault();
                    const headerButtons = document.querySelectorAll('#exitBtn, #reloadBtn, .search-btn, .profile-btn, #adminButton');
                    const focusedElement = document.activeElement;
                    const currentIndex = Array.from(headerButtons).indexOf(focusedElement);
                    
                    if (currentIndex >= 0) {
                        let nextIndex;
                        if (event.key === 'ArrowRight') {
                            nextIndex = currentIndex < headerButtons.length - 1 ? currentIndex + 1 : 0;
                        } else {
                            nextIndex = currentIndex > 0 ? currentIndex - 1 : headerButtons.length - 1;
                        }
                        headerButtons[nextIndex].focus();
                    }
                } else if (currentSwimlaneIndex >= 0) {
                    // Handle horizontal navigation within swimlane
                    const currentSwimlane = swimlanes[currentSwimlaneIndex];
                    const cards = currentSwimlane.element.querySelectorAll('.content-card');
                    const focusedCard = document.activeElement;
                    const currentCardIndex = Array.from(cards).indexOf(focusedCard);
                    
                    if (currentCardIndex >= 0) {
                        event.preventDefault();
                        let nextIndex;
                        if (event.key === 'ArrowRight') {
                            nextIndex = currentCardIndex < cards.length - 1 ? currentCardIndex + 1 : 0;
                        } else {
                            nextIndex = currentCardIndex > 0 ? currentCardIndex - 1 : cards.length - 1;
                        }
                        
                        // Remove swimlane border before focusing card
                        document.querySelectorAll('.swimlane-focused').forEach(el => {
                            el.classList.remove('swimlane-focused');
                        });
                        
                        cards[nextIndex].focus();
                    }
                }
                break;
        }
        return;
    }
    
    // Handle series modal controls
    if (seriesModal.style.display === 'block') {
        switch(event.key) {
            case 'Escape':
            case 'Backspace':
                event.preventDefault();
                event.stopPropagation();
                closeSeries();
                break;
            case 'ArrowUp':
            case 'ArrowDown':
            case 'ArrowLeft':
            case 'ArrowRight':
                // Prevent arrow keys from affecting background elements
                event.preventDefault();
                event.stopPropagation();
                // Allow natural focus navigation within the modal
                const focusableElements = seriesModal.querySelectorAll('.video-item, button');
                const currentIndex = Array.from(focusableElements).indexOf(document.activeElement);
                
                if (event.key === 'ArrowDown' && currentIndex < focusableElements.length - 1) {
                    focusableElements[currentIndex + 1].focus();
                } else if (event.key === 'ArrowUp' && currentIndex > 0) {
                    focusableElements[currentIndex - 1].focus();
                }
                break;
            default:
                // For other keys, still prevent bubbling to background
                event.stopPropagation();
                break;
        }
        return;
    }
});

// Handle session expiration
function handleSessionExpired() {
    currentUser = null;
    authToken = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    updateUI();
    showLoginModal();
}

// Load video description from search API
async function loadVideoDescription(title) {
    const descriptionDiv = document.getElementById('videoDescription');
    descriptionDiv.innerHTML = '<div style="color: #666;">Loading description...</div>';
    
    try {
        const response = await fetch(`/api/video-description/${encodeURIComponent(title)}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();
        descriptionDiv.innerHTML = `<p>${data.description}</p>`;
    } catch (error) {
        descriptionDiv.innerHTML = '';
    }
}

// Close modals and search when clicking outside
window.onclick = function(event) {
    const authModal = document.getElementById('authModal');
    const videoModal = document.getElementById('videoModal');
    const seriesModal = document.getElementById('seriesModal');
    const searchContainer = document.querySelector('.search-container');
    
    if (event.target === authModal) {
        closeAuth();
    }
    if (event.target === videoModal) {
        closeVideo();
    }
    if (event.target === seriesModal) {
        closeSeries();
    }
    if (searchContainer && !searchContainer.contains(event.target)) {
        document.getElementById('searchResults').style.display = 'none';
    }
}