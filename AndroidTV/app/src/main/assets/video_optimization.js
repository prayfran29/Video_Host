// Video optimization script for Android TV
console.log('Video optimization script loaded');

// Force video player visibility and sizing
var style = document.createElement('style');
style.textContent = '#videoPlayer { width: 100% !important; height: 400px !important; background: black !important; } .video-container { height: 400px !important; background: black !important; } #videoLoading { display: none !important; }';
document.head.appendChild(style);

// Ensure video element is visible
setTimeout(() => {
    var video = document.getElementById('videoPlayer');
    if(video) {
        video.style.visibility = 'visible';
        video.style.opacity = '1';
        video.webkitEnterFullscreen = video.webkitEnterFullscreen || function(){};
    }
}, 1000);