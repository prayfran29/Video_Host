let currentUser = null;
let authToken = localStorage.getItem('authToken');
let watchProgress = {};
let currentSeries = null;
let currentVideoIndex = 0;

// Clean up any existing state on page load
window.addEventListener('beforeunload', () => {
    // Clear intervals
    if (qrPollInterval) {
        clearInterval(qrPollInterval);
    }
});

// Initialize - check for existing login
document.addEventListener('DOMContentLoaded', () => {
    try {
    // Show TV-only buttons (Android WebView only)
    if (navigator.userAgent.includes('wv')) {
        document.getElementById('reloadBtn').style.display = 'inline-block';
        if (typeof Android !== 'undefined') {
            document.getElementById('exitBtn').style.display = 'inline-block';
        }
    }
    
    // Check if we have a valid token and validate it
    if (authToken) {
        currentUser = JSON.parse(localStorage.getItem('currentUser'));
        if (currentUser) {
            // Validate token before proceeding
            validateTokenAndProceed();
        } else {
            showLoginModal();
        }
    } else {
        // Auto-login for TV browsers (check multiple indicators)
        const isTV = navigator.userAgent.includes('wv') || 
                    navigator.userAgent.includes('Android') || 
                    typeof Android !== 'undefined';
        
        if (isTV) {
            autoLoginTV();
        } else {
            showLoginModal();
        }
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
    } catch (error) {
        console.error('Initialization error:', error);
        // Force clean reload if initialization fails
        setTimeout(() => {
            window.location.href = window.location.href.split('?')[0];
        }, 1000);
    }
});

// Validate existing token before using it
async function validateTokenAndProceed() {
    try {
        const response = await fetch('/api/series', { 
            headers: { 'Authorization': `Bearer ${authToken}` } 
        });
        
        if (response.ok) {
            // Token is valid
            updateUI();
            document.querySelector('main').style.display = 'block';
            loadSeries();
        } else if (response.status === 401) {
            // Token expired or invalid, clear and re-login
            console.log('Token expired, attempting re-login');
            authToken = null;
            currentUser = null;
            localStorage.removeItem('authToken');
            localStorage.removeItem('currentUser');
            
            const isTV = navigator.userAgent.includes('wv') || 
                        navigator.userAgent.includes('Android') || 
                        typeof Android !== 'undefined';
            
            if (isTV) {
                autoLoginTV();
            } else {
                showLoginModal();
            }
        } else {
            showLoginModal();
        }
    } catch (error) {
        console.error('Token validation error:', error);
        showLoginModal();
    }
}

function showLoginModal() {
    document.getElementById('authModal').style.display = 'block';
    document.querySelector('main').style.display = 'none';
}

async function autoLoginTV() {
    try {
        // Check if Android app is handling login
        if (typeof Android !== 'undefined' && Android.getDeviceId) {
            // Wait for Android app to complete its login attempt
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Check if already logged in by Android app
            if (authToken && currentUser) {
                updateUI();
                document.querySelector('main').style.display = 'block';
                loadSeries();
                return;
            }
        }
        
        // Get unique device ID for this TV with fallback
        let deviceId;
        try {
            deviceId = typeof Android !== 'undefined' && Android.getDeviceId ? 
                      Android.getDeviceId() : 
                      localStorage.getItem('tvDeviceId') || 
                      'TV-' + Math.random().toString(36).substr(2, 9);
            
            // Store device ID for consistency
            localStorage.setItem('tvDeviceId', deviceId);
        } catch (e) {
            deviceId = localStorage.getItem('tvDeviceId') || 'TV-' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('tvDeviceId', deviceId);
        }
        
        const tvUsername = `TV-${deviceId.substr(-8)}`; // Use last 8 chars of device ID
        
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: tvUsername, password: 'TVPass123!' })
        });
        
        const data = await response.json();
        if (response.ok) {
            authToken = data.token;
            currentUser = { username: data.username, adultAccess: data.adultAccess };
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            updateUI();
            document.querySelector('main').style.display = 'block';
            loadSeries();
        } else {
            console.error('TV auto-login failed:', data);
            showLoginModal();
        }
    } catch (error) {
        console.error('TV auto-login error:', error);
        showLoginModal();
    }
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
            if (qrPollInterval) {
                clearInterval(qrPollInterval);
            }
            qrPollInterval = setInterval(() => checkQRLogin(data.token), 2000);
            
            // Start polling immediately
            checkQRLogin(data.token);
        } else {
            document.getElementById('qrStatus').textContent = 'Failed to generate QR code - Please try again';
            document.getElementById('qrCode').innerHTML = `
                <div style="padding:2rem;border:2px solid #ff6b6b;text-align:center;background:#222;border-radius:8px;">
                    <p style="color:#ff6b6b;font-size:1.1rem;margin:0;">❌ QR Generation Failed</p>
                    <p style="color:#999;font-size:0.9rem;margin:1rem 0;">Please use username/password login or refresh the page</p>
                    <button onclick="showQRLogin()" style="background:#0066ff;color:white;border:none;padding:10px 20px;border-radius:5px;cursor:pointer;">Try Again</button>
                </div>
            `;
        }
    } catch (error) {
        document.getElementById('qrStatus').textContent = 'Error generating QR code';
    }
}

async function checkQRLogin(token) {
    try {
        const statusEl = document.getElementById('qrStatus');
        statusEl.textContent = `Checking... (${new Date().toLocaleTimeString()})`;
        
        const response = await fetch(`/api/qr-login/${token}`);
        const data = await response.json();
        
        if (response.ok && data.authenticated) {
            statusEl.textContent = '✓ Login successful! Loading...';
            clearInterval(qrPollInterval);
            qrPollInterval = null;
            
            authToken = data.authToken;
            currentUser = { username: data.username };
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            // For QR login, we don't have the password to save for auto-login
            // The TV app will show the first-time setup prompt next time
            
            updateUI();
            closeAuth();
            document.querySelector('main').style.display = 'block';
            loadSeries();
        } else if (!response.ok) {
            if (response.status === 404) {
                statusEl.textContent = 'QR code expired. Please refresh.';
                clearInterval(qrPollInterval);
                qrPollInterval = null;
            } else {
                statusEl.textContent = `Error: ${response.status} - Still waiting...`;
            }
        } else {
            statusEl.textContent = `Waiting for login... (${new Date().toLocaleTimeString()})`;
        }
    } catch (error) {
        document.getElementById('qrStatus').textContent = `Network error - Still trying... (${new Date().toLocaleTimeString()})`;
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
            
            // Save credentials for TV app auto-login
            if (navigator.userAgent.includes('wv') && typeof Android !== 'undefined') {
                Android.saveCredentials(username, password);
            }
            
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
    // Clear TV app credentials on logout
    if (navigator.userAgent.includes('wv') && typeof Android !== 'undefined') {
        Android.clearCredentials();
    }
    
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
        
        inProgress.forEach((series, index) => {
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
    
    // Ensure click handler works on TV
    card.style.cursor = 'pointer';
    card.addEventListener('click', (e) => {
        console.log('Card clicked:', series.title);
        e.stopPropagation();
        // Force the onclick to execute
        if (card.onclick) {
            card.onclick(e);
        }
    });
    
    let lastWatchedEpisode = null;
    
    if (showProgress && watchProgress[series.id]) {
        // Find last watched video
        const progressEntries = Object.entries(watchProgress[series.id]);
        const lastWatched = progressEntries.reduce((latest, [filename, progress]) => {
            const watchTime = new Date(progress.lastWatched || 0).getTime();
            return watchTime > latest.time ? { filename, time: watchTime, progress } : latest;
        }, { filename: null, time: 0, progress: null });
        
        if (lastWatched.filename) {
            const video = series.videos?.find(v => v.filename === lastWatched.filename);
            if (video) {
                lastWatchedEpisode = video.title || video.filename.replace(/\.[^/.]+$/, "").replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                
                // Continue watching: play last watched video directly
                card.onclick = async (e) => {
                    const videoIndex = series.videos.indexOf(video);
                    if (!video) return;
                    
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
                };
            } else {
                card.onclick = () => openSeries(series);
            }
        } else {
            card.onclick = () => openSeries(series);
        }
    } else {
        card.onclick = () => openSeries(series);
    }
    
    // Add keyboard support for TV
    card.addEventListener('keydown', (e) => {
        console.log('Card keydown:', e.key, 'on card:', series.title);
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            console.log('Enter/Space on card, triggering click');
            card.click();
        }
    });
    
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
            ${series.thumbnail ? `<img src="${series.thumbnail}" alt="${series.title}" loading="lazy" onerror="this.style.display='none'">` : ''}
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
    
    // Clear video list
    videoList.innerHTML = '';
    
    // Add home button for everyone with normal styling
    const homeButtonDiv = document.createElement('div');
    homeButtonDiv.className = 'video-item';
    homeButtonDiv.style.marginBottom = '10px';
    
    const homeButton = document.createElement('button');
    homeButton.textContent = '🏠 Back to Home';
    homeButton.className = 'home-button';
    homeButton.tabIndex = 0;
    homeButton.onclick = closeSeries;
    
    homeButton.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            closeSeries();
        }
    });
    
    homeButtonDiv.appendChild(homeButton);
    videoList.appendChild(homeButtonDiv);
    
    // Add episodes after home button
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
            } else if (e.key === 'ArrowUp' && index === 0) {
                e.preventDefault();
                const closeBtn = document.querySelector('#seriesModal .close');
                if (closeBtn) closeBtn.focus();
            }
        });
        
        videoList.appendChild(item);
    });
    
    modal.style.display = 'block';
    
    // Focus first element (home button for everyone)
    setTimeout(() => {
        const firstFocusable = videoList.querySelector('button[tabindex="0"], .video-item[tabindex="0"]');
        if (firstFocusable) {
            firstFocusable.focus();
        }
    }, 100);
}

function playVideo(url, filename, title, videoIndex = null) {
    try {
    const modal = document.getElementById('videoModal');
    const player = document.getElementById('videoPlayer');
    const videoTitle = document.getElementById('videoTitle');
    const details = document.getElementById('videoDetails');
    
    if (videoIndex !== null) {
        currentVideoIndex = videoIndex;
    }
    
    // Reset player and show loading - remove any poster to prevent broken icon
    player.src = '';
    player.removeAttribute('poster');
    player.load(); // Force reload to clear any cached poster
    document.getElementById('videoLoading').style.display = 'block';
    
    // Add timeout to prevent stuck loading
    const loadingTimeout = setTimeout(() => {
        if (loadingDiv.style.display !== 'none') {
            loadingDiv.innerHTML = '<div>Loading timeout. <button onclick="closeVideo()">Close</button> <button onclick="location.reload()">Retry</button></div>';
        }
    }, 60000); // 60 second timeout
    
    // Clear timeout when loading completes
    const originalHideLoading = () => {
        clearTimeout(loadingTimeout);
        loadingDiv.style.display = 'none';
    };
    
    videoTitle.textContent = title;
    details.textContent = currentSeries ? currentSeries.title : '';
    
    // Load video description
    loadVideoDescription(title);
    
    // Unified progressive streaming for all devices
    const videoUrl = `${window.location.origin}${url}`;

    const loadingDiv = document.getElementById('videoLoading');
    
    // Detect device type for UI messaging
    const userAgent = navigator.userAgent || '';
    const isTV = /Smart-TV|Tizen|WebOS|Android TV|BRAVIA|Samsung|LG webOS|wv/i.test(userAgent);
    
    // Aggressive progressive streaming settings
    player.preload = 'metadata'; // Load just enough to start
    player.setAttribute('playsinline', 'true');
    player.setAttribute('controls', 'true');
    player.setAttribute('crossorigin', 'anonymous');
    
    if (isTV) {
        player.setAttribute('webkit-playsinline', 'true');
        player.muted = false;
        enableFullscreenSupport(player);
    }
    
    // Set video source

    player.src = videoUrl;
    player.load();
    
    let hasStartedPlaying = false;
    let loadTimeout;
    
    // Show appropriate loading message
    loadingDiv.innerHTML = isTV ? '<div>Preparing TV video...</div>' : '<div>Loading video...</div>';
    
    const showReady = () => {
        const message = isTV ? 
            `<div style="text-align: center; padding: 20px;">
                <div style="font-size: 24px; margin-bottom: 15px;">📺 Ready to Play</div>
                <div style="font-size: 16px; color: #0066ff;">
                    Press <strong>▶ PLAY</strong> to start<br>
                    Video streams as you watch
                </div>
            </div>` :
            `<div style="text-align: center; padding: 20px;">
                <div style="font-size: 20px; margin-bottom: 10px;">▶ Ready to Play</div>
                <div style="color: #0066ff;">Video will stream progressively</div>
            </div>`;
        
        loadingDiv.innerHTML = message;
        setTimeout(() => {
            if (!hasStartedPlaying) loadingDiv.style.display = 'none';
        }, 3000);
    };
    
    // Progressive loading event handlers
    player.addEventListener('loadedmetadata', () => {
        console.log('Progressive: Video metadata loaded');
        showReady();
    });
    
    player.addEventListener('canplay', () => {
        console.log('Progressive: Video ready to play');
        showReady();
    });
    
    player.addEventListener('play', () => {
        hasStartedPlaying = true;
        loadingDiv.style.display = 'none';
    });
    
    player.addEventListener('waiting', () => {
        loadingDiv.style.display = 'block';
        loadingDiv.innerHTML = '<div>Buffering...</div>';
    });
    
    player.addEventListener('canplaythrough', () => {
        if (hasStartedPlaying) loadingDiv.style.display = 'none';
    });
    
    player.addEventListener('error', (e) => {
        console.error('Progressive video error:', player.error);
        loadingDiv.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <div style="color: #ff6b6b; margin-bottom: 10px;">❌ Video Error</div>
                <div style="margin-bottom: 15px;">Failed to load video</div>
                <button onclick="closeVideo()" style="background: #0066ff; color: white; border: none; padding: 10px 20px; border-radius: 5px;">Close</button>
            </div>
        `;
    });
    
    // Shorter timeout with auto-play attempt
    loadTimeout = setTimeout(() => {
        if (!hasStartedPlaying && player.readyState < 2) {
            // Try to force play even with minimal data
            player.play().catch(() => {
                loadingDiv.innerHTML = `
                    <div style="text-align: center; padding: 20px;">
                        <div style="color: #ff9500; margin-bottom: 10px;">⚠️ File Loading Slowly</div>
                        <div style="margin-bottom: 15px;">Click play when ready</div>
                        <button onclick="closeVideo()" style="background: #0066ff; color: white; border: none; padding: 10px 20px; border-radius: 5px;">Close</button>
                    </div>
                `;
            });
        }
    }, 10000);
    
    player.addEventListener('loadedmetadata', () => {
        if (loadTimeout) {
            clearTimeout(loadTimeout);
            loadTimeout = null;
        }
    });
    
    updateVideoControls();
    
    // Set up progress tracking
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
    
    } catch (error) {
        console.error('Video playback error:', error);
        const loadingDiv = document.getElementById('videoLoading');
        if (loadingDiv) {
            loadingDiv.innerHTML = '<div>Video error. <button onclick="closeVideo()">Close</button></div>';
        }
    }
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
    
    // Clean video player
    player.pause();
    player.currentTime = 0;
    player.removeAttribute('src');
    player.removeAttribute('poster');
    player.load(); // Clear cached content
    
    modal.style.display = 'none';
}

async function backToSeries() {
    if (currentSeries) {
        const player = document.getElementById('videoPlayer');
        
        // Save progress and stop video
        if (currentUser && player.src) {
            const filename = player.src.split('/').pop().split('?')[0];
            if (filename && player.currentTime > 0) {
                saveProgress(decodeURIComponent(filename), player.currentTime, player.duration);
            }
        }
        
        player.pause();
        player.src = '';
        
        document.getElementById('videoModal').style.display = 'none';
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
    const player = document.getElementById('videoPlayer');
    const videoModal = document.getElementById('videoModal');
    
    // Stop video to prevent background playback
    if (player) {
        player.pause();
        player.src = '';
    }
    
    videoModal.style.display = 'none';
    document.getElementById('seriesModal').style.display = 'none';
    currentSwimlaneIndex = -1;
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
        // Make all cards in continue watching focusable
        Array.from(continueWatching.children).forEach((card, index) => {
            card.tabIndex = 0;
            card.setAttribute('data-swimlane', 'continue-watching');
            card.setAttribute('data-index', index);
        });
    }
    
    genreSections.forEach(section => {
        if (section.children.length > 0) {
            const sectionTitle = section.closest('.section')?.querySelector('h3')?.textContent || 'Genre';
            swimlanes.push({ element: section, name: sectionTitle });
            // Make all cards in genre sections focusable
            Array.from(section.children).forEach((card, index) => {
                card.tabIndex = 0;
                card.setAttribute('data-swimlane', sectionTitle);
                card.setAttribute('data-index', index);
            });
        }
    });
    
    if (allSeries && allSeries.children.length > 0) {
        swimlanes.push({ element: allSeries, name: 'All Series' });
        // Make all cards in all series focusable
        Array.from(allSeries.children).forEach((card, index) => {
            card.tabIndex = 0;
            card.setAttribute('data-swimlane', 'all-series');
            card.setAttribute('data-index', index);
        });
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
        firstCard.tabIndex = 0;
        firstCard.focus();
        
        // Add visual border to focused card
        document.querySelectorAll('.card-focused').forEach(el => {
            el.classList.remove('card-focused');
        });
        firstCard.classList.add('card-focused');
        
        // Remove swimlane border when card is focused
        setTimeout(() => {
            document.querySelectorAll('.swimlane-focused').forEach(el => {
                el.classList.remove('swimlane-focused');
            });
        }, 10);
    }
}

// TV remote control support
document.addEventListener('keydown', (event) => {
    const videoModal = document.getElementById('videoModal');
    const seriesModal = document.getElementById('seriesModal');
    const player = document.getElementById('videoPlayer');
    
    // Handle video modal controls (only if actually visible and focused)
    if (videoModal.style.display === 'block' && !document.querySelector('#seriesModal[style*="block"]')) {
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
                event.preventDefault();
                event.stopPropagation();
                
                if (isButtonFocused) {
                    // Navigate between buttons
                    const buttons = Array.from(videoModal.querySelectorAll('button[tabindex="0"]'));
                    const currentIndex = buttons.indexOf(document.activeElement);
                    
                    if (event.key === 'ArrowDown' && currentIndex < buttons.length - 1) {
                        buttons[currentIndex + 1].focus();
                    } else if (event.key === 'ArrowUp' && currentIndex > 0) {
                        buttons[currentIndex - 1].focus();
                    } else if (event.key === 'ArrowDown' && currentIndex === buttons.length - 1) {
                        buttons[0].focus(); // Loop to first
                    } else if (event.key === 'ArrowUp' && currentIndex === 0) {
                        buttons[buttons.length - 1].focus(); // Loop to last
                    }
                } else {
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
            case 'p':
            case 'P':
                // Always allow pause/play with P key regardless of focus
                event.preventDefault();
                if (player.paused) {
                    player.play();
                } else {
                    player.pause();
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
    
    // Handle main page navigation (if no modals are visible)
    const authModal = document.getElementById('authModal');
    const videoVisible = videoModal.style.display === 'block';
    const seriesVisible = seriesModal.style.display === 'block';
    const authVisible = authModal.style.display === 'block';
    
    if (!videoVisible && !seriesVisible && !authVisible) {
        switch(event.key) {
            case 'Enter':
            case ' ':
                // Trigger click on focused card
                const focusedCard = document.activeElement;
                
                // Visual debug indicator
                const indicator = document.createElement('div');
                indicator.style.cssText = 'position: fixed; top: 10px; left: 10px; background: yellow; color: black; padding: 10px; z-index: 9999; font-size: 14px;';
                
                if (focusedCard && focusedCard.classList.contains('content-card')) {
                    event.preventDefault();
                    if (focusedCard.onclick) {
                        focusedCard.onclick();
                    }
                }
                break;
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
                        
                        // Remove previous card focus styling
                        document.querySelectorAll('.card-focused').forEach(el => {
                            el.classList.remove('card-focused');
                        });
                        document.querySelectorAll('.swimlane-focused').forEach(el => {
                            el.classList.remove('swimlane-focused');
                        });
                        
                        // Focus and highlight new card
                        cards[nextIndex].focus();
                        cards[nextIndex].classList.add('card-focused');
                    }
                }
                break;
        }
        return;
    }
    
    // Handle series modal controls (only if series modal is visible and video modal is not)
    if (seriesModal.style.display === 'block' && videoModal.style.display !== 'block') {
        switch(event.key) {
            case 'Escape':
            case 'Backspace':
            case 'GoBack':
                event.preventDefault();
                event.stopPropagation();
                closeSeries();
                break;
            case 'ArrowUp':
            case 'ArrowDown':
                event.preventDefault();
                event.stopPropagation();
                const focusableElements = seriesModal.querySelectorAll('.close, .video-item');
                const currentIndex = Array.from(focusableElements).indexOf(document.activeElement);
                
                if (event.key === 'ArrowDown') {
                    if (currentIndex < focusableElements.length - 1) {
                        focusableElements[currentIndex + 1].focus();
                    }
                } else if (event.key === 'ArrowUp') {
                    if (currentIndex > 0) {
                        focusableElements[currentIndex - 1].focus();
                    } else {
                        // Focus close button when at top
                        const closeBtn = seriesModal.querySelector('.close');
                        if (closeBtn) closeBtn.focus();
                    }
                }
                break;
            case 'ArrowLeft':
            case 'ArrowRight':
                event.preventDefault();
                event.stopPropagation();
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