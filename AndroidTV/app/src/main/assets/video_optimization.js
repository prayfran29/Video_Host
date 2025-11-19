// TV-specific video optimization script
(function() {
    // Force video sizing for TV
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
    `;
    document.head.appendChild(style);
    
    // Optimize video elements
    setTimeout(() => {
        var video = document.getElementById('videoPlayer');
        if(video) {
            video.style.visibility = 'visible';
            video.style.opacity = '1';
            video.webkitEnterFullscreen = video.webkitEnterFullscreen || function(){};
        }
        
        var videos = document.querySelectorAll('video');
        for(var i=0; i<videos.length; i++) {
            videos[i].setAttribute('preload', 'metadata');
            videos[i].setAttribute('playsinline', 'true');
            videos[i].style.width = '100%';
            videos[i].style.height = '100%';
            videos[i].style.objectFit = 'contain';
        }
        console.log('TV app loaded, videos optimized');
    }, 100);
})();