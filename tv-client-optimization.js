// TV-optimized client-side video loading
// Add this to your script.js playVideo function for TV devices

function playVideoTV(url, filename, title, videoIndex = null) {
    const modal = document.getElementById('videoModal');
    const player = document.getElementById('videoPlayer');
    const videoTitle = document.getElementById('videoTitle');
    const loadingDiv = document.getElementById('videoLoading');
    
    // Reset player
    player.src = '';
    player.load();
    loadingDiv.style.display = 'block';
    loadingDiv.innerHTML = '<div>Preparing TV video...</div>';
    
    // TV-specific video setup
    player.preload = 'none'; // Don't preload on TV
    player.setAttribute('playsinline', 'true');
    player.setAttribute('webkit-playsinline', 'true');
    player.muted = false;
    
    // Use TV-optimized endpoint
    const tvVideoUrl = url.replace('/videos/', '/videos/tv/');
    
    // Set up progressive loading for TV
    player.src = tvVideoUrl;
    
    // TV loading strategy
    let loadTimeout;
    let hasStartedPlaying = false;
    
    const showTVInstructions = () => {
        loadingDiv.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <div style="font-size: 24px; margin-bottom: 15px;">📺 TV Mode</div>
                <div style="font-size: 18px; margin-bottom: 10px;">Video is ready!</div>
                <div style="font-size: 16px; color: #0066ff;">
                    Press <strong>▶ PLAY</strong> to start<br>
                    Video will load as you watch
                </div>
            </div>
        `;
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            if (!hasStartedPlaying) {
                loadingDiv.style.display = 'none';
            }
        }, 3000);
    };
    
    // Handle different loading states
    player.addEventListener('loadstart', () => {
        console.log('TV: Video loading started');
        loadingDiv.innerHTML = '<div>Connecting to video...</div>';
    });
    
    player.addEventListener('loadedmetadata', () => {
        console.log('TV: Video metadata loaded');
        showTVInstructions();
    });
    
    player.addEventListener('canplay', () => {
        console.log('TV: Video can start playing');
        showTVInstructions();
    });
    
    player.addEventListener('play', () => {
        console.log('TV: Video started playing');
        hasStartedPlaying = true;
        loadingDiv.style.display = 'none';
    });
    
    player.addEventListener('waiting', () => {
        console.log('TV: Video buffering');
        loadingDiv.style.display = 'block';
        loadingDiv.innerHTML = '<div>Buffering...</div>';
    });
    
    player.addEventListener('canplaythrough', () => {
        console.log('TV: Video can play through');
        if (hasStartedPlaying) {
            loadingDiv.style.display = 'none';
        }
    });
    
    player.addEventListener('error', (e) => {
        console.error('TV video error:', player.error);
        loadingDiv.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <div style="color: #ff6b6b; font-size: 18px; margin-bottom: 10px;">❌ Video Error</div>
                <div style="margin-bottom: 15px;">Failed to load video</div>
                <button onclick="closeVideo()" style="background: #0066ff; color: white; border: none; padding: 10px 20px; border-radius: 5px;">Close</button>
                <button onclick="location.reload()" style="background: #666; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin-left: 10px;">Retry</button>
            </div>
        `;
    });
    
    // Set timeout for initial connection
    loadTimeout = setTimeout(() => {
        if (!hasStartedPlaying && player.readyState < 2) {
            loadingDiv.innerHTML = `
                <div style="text-align: center; padding: 20px;">
                    <div style="color: #ff9500; font-size: 18px; margin-bottom: 10px;">⚠️ Large File</div>
                    <div style="margin-bottom: 15px;">This video is loading slowly.<br>Please wait or try a smaller file.</div>
                    <button onclick="closeVideo()" style="background: #0066ff; color: white; border: none; padding: 10px 20px; border-radius: 5px;">Close</button>
                </div>
            `;
        }
    }, 30000); // 30 second timeout
    
    // Clear timeout when video starts
    player.addEventListener('loadedmetadata', () => {
        if (loadTimeout) {
            clearTimeout(loadTimeout);
            loadTimeout = null;
        }
    });
    
    videoTitle.textContent = title;
    modal.style.display = 'block';
    document.getElementById('seriesModal').style.display = 'none';
    
    // Set up progress tracking
    if (currentUser && currentSeries) {
        player.ontimeupdate = () => saveProgress(filename, player.currentTime, player.duration);
        player.onended = () => {
            saveProgress(filename, player.duration, player.duration, true);
            playNextVideo();
        };
    }
    
    updateVideoControls();
}

// Detect TV and use appropriate loading method
function playVideoOptimized(url, filename, title, videoIndex = null) {
    const userAgent = navigator.userAgent || '';
    const isTV = /Smart-TV|Tizen|WebOS|Android TV|BRAVIA|Samsung|LG webOS|wv/i.test(userAgent);
    
    if (isTV) {
        playVideoTV(url, filename, title, videoIndex);
    } else {
        // Use existing desktop/mobile implementation
        playVideo(url, filename, title, videoIndex);
    }
}