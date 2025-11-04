let currentUser = null;
let authToken = localStorage.getItem('authToken');
let watchProgress = {};
let currentSeries = null;
let currentVideoIndex = 0;

// Initialize - check for existing login
document.addEventListener('DOMContentLoaded', () => {
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
}

function showRegister() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
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
            currentUser = { username: data.username };
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
    
    if (currentUser) {
        profileBtn.textContent = `👤 ${currentUser.username} (Logout)`;
        profileBtn.style.backgroundColor = '#ff6600';
        
        if (currentUser.username === 'Magnus') {
            adminBtn.style.display = 'inline-block';
        }
    } else {
        profileBtn.textContent = '👤 Login';
        profileBtn.style.backgroundColor = '#333';
        adminBtn.style.display = 'none';
    }
}

function goToAdmin() {
    window.location.href = '/admin';
}

// Series functionality
async function loadSeries() {
    if (!authToken) return;
    
    try {
        const [seriesResponse, genresResponse] = await Promise.all([
            fetch('/api/series', { headers: { 'Authorization': `Bearer ${authToken}` } }),
            fetch('/api/genres', { headers: { 'Authorization': `Bearer ${authToken}` } })
        ]);
        
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
    document.getElementById('searchInput').value = '';
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
}

function createSeriesCard(series, showProgress = false) {
    const card = document.createElement('div');
    card.className = 'content-card';
    
    if (showProgress && watchProgress[series.id]) {
        // Find last watched video
        const progressEntries = Object.entries(watchProgress[series.id]);
        const lastWatched = progressEntries.reduce((latest, [filename, progress]) => {
            const watchTime = new Date(progress.lastWatched || 0).getTime();
            return watchTime > latest.time ? { filename, time: watchTime, progress } : latest;
        }, { filename: null, time: 0, progress: null });
        
        if (lastWatched.filename) {
            card.onclick = () => {
                // Find video in series and play directly
                const video = series.videos?.find(v => v.filename === lastWatched.filename);
                if (video) {
                    const videoIndex = series.videos.indexOf(video);
                    currentSeries = series;
                    playVideo(video.url, video.filename, video.title, videoIndex);
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
    if (showProgress && watchProgress[series.id]) {
        const completed = Object.values(watchProgress[series.id]).filter(v => v.completed).length;
        progressText = `${completed}/${series.videoCount} completed`;
    }
    
    const genreText = series.genre && series.genre !== 'Root' ? `${series.genre} • ` : '';
    
    card.innerHTML = `
        <div class="card-image" style="background-image: url('${series.thumbnail || ''}')"></div>
        <div class="card-info">
            <h4>${series.title}</h4>
            <p>${genreText}${progressText}</p>
        </div>
    `;
    return card;
}

async function openSeries(series) {
    if (!authToken) return;
    
    try {
        const response = await fetch(`/api/series/${series.id}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        currentSeries = await response.json();
        showSeriesModal(currentSeries);
    } catch (error) {
        // Silent fail
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
        videoList.appendChild(item);
    });
    
    modal.style.display = 'block';
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
    
    // Optimize video loading
    player.preload = 'metadata';
    
    // Add loading error handling with retry
    let retryCount = 0;
    player.onerror = () => {
        if (retryCount < 3) {
            retryCount++;
            setTimeout(() => {
                player.load();
            }, 1000 * retryCount);
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
        
        // Load saved progress before playing
        if (currentUser && currentSeries && watchProgress[currentSeries.id] && watchProgress[currentSeries.id][filename]) {
            const progress = watchProgress[currentSeries.id][filename];
            player.currentTime = progress.currentTime || 0;
        }
        
        // Auto-play when ready
        player.play().catch(() => {});
    };
    
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

async function saveProgress(filename, currentTime, duration, completed = false) {
    if (!authToken || !currentSeries) return;
    
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
    player.pause();
    modal.style.display = 'none';
}

function backToSeries() {
    if (currentSeries) {
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
    if (!searchContainer.contains(event.target)) {
        document.getElementById('searchResults').style.display = 'none';
    }
}