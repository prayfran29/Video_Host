// Video optimization script for Tizen TV
console.log('Tizen TV video optimization script loaded');

// Force video player visibility and sizing for TV
var style = document.createElement('style');
style.textContent = `
    #videoPlayer { 
        width: 100% !important; 
        height: 400px !important; 
        background: black !important; 
    } 
    .video-container { 
        height: 400px !important; 
        background: black !important; 
    } 
    #videoLoading { 
        display: none !important; 
    }
    /* TV-specific video optimizations */
    video {
        object-fit: contain !important;
        background: #000 !important;
    }
    .video-modal {
        background: rgba(0,0,0,0.95) !important;
    }
`;
document.head.appendChild(style);

// Ensure video element is visible and optimized for TV
setTimeout(() => {
    var video = document.getElementById('videoPlayer');
    if(video) {
        video.style.visibility = 'visible';
        video.style.opacity = '1';
        video.setAttribute('preload', 'metadata');
        
        // TV-specific video event handlers
        video.addEventListener('loadstart', () => {
            console.log('Video loading started');
        });
        
        video.addEventListener('canplay', () => {
            console.log('Video can start playing');
        });
        
        // Prevent video from exiting fullscreen unexpectedly
        video.addEventListener('webkitfullscreenchange', (e) => {
            console.log('Fullscreen change detected');
        });
    }
}, 1000);

// TV remote control optimizations
document.addEventListener('keydown', (e) => {
    var video = document.getElementById('videoPlayer');
    if (video && !video.paused) {
        switch(e.keyCode) {
            case 32: // Space - Play/Pause
                e.preventDefault();
                if (video.paused) {
                    video.play();
                } else {
                    video.pause();
                }
                break;
            case 37: // Left Arrow - Rewind 10s
                e.preventDefault();
                video.currentTime = Math.max(0, video.currentTime - 10);
                break;
            case 39: // Right Arrow - Forward 10s
                e.preventDefault();
                video.currentTime = Math.min(video.duration, video.currentTime + 10);
                break;
        }
    }
});