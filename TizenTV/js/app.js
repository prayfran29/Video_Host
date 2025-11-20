class VideoStreamApp {
    constructor() {
        this.tv = new TizenTV();
        this.serverUrl = 'http://magnushackhost.win:3000';
        this.authToken = null;
        this.currentScreen = 'login';
        this.focusedElement = null;
        this.qrToken = null;
        this.qrPollInterval = null;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.showLoginScreen();
    }
    
    setupEventListeners() {
        document.addEventListener('tvkey', (e) => {
            this.handleRemoteKey(e.detail.keyName);
        });
        
        // Manual login
        document.getElementById('loginBtn').addEventListener('click', () => {
            this.manualLogin();
        });
        
        document.getElementById('toggleLogin').addEventListener('click', () => {
            this.toggleLoginMethod();
        });
        
        document.getElementById('backBtn').addEventListener('click', () => {
            this.showHomeScreen();
        });
    }
    
    handleRemoteKey(keyName) {
        console.log('Remote key:', keyName);
        
        switch (keyName) {
            case 'Return':
                if (this.currentScreen === 'series') {
                    this.showHomeScreen();
                } else if (this.currentScreen === 'home') {
                    this.showLoginScreen();
                }
                break;
            case 'ColorF0Red':
                this.tv.exit();
                break;
            case 'ArrowUp':
            case 'ArrowDown':
            case 'ArrowLeft':
            case 'ArrowRight':
                this.navigate(keyName);
                break;
            case 'Enter':
                this.selectFocused();
                break;
        }
    }
    
    navigate(direction) {
        const focusable = this.getFocusableElements();
        if (focusable.length === 0) return;
        
        if (!this.focusedElement) {
            this.setFocus(focusable[0]);
            return;
        }
        
        const currentIndex = focusable.indexOf(this.focusedElement);
        let nextIndex = currentIndex;
        
        switch (direction) {
            case 'ArrowUp':
                nextIndex = Math.max(0, currentIndex - 1);
                break;
            case 'ArrowDown':
                nextIndex = Math.min(focusable.length - 1, currentIndex + 1);
                break;
            case 'ArrowLeft':
                nextIndex = Math.max(0, currentIndex - 1);
                break;
            case 'ArrowRight':
                nextIndex = Math.min(focusable.length - 1, currentIndex + 1);
                break;
        }
        
        this.setFocus(focusable[nextIndex]);
    }
    
    getFocusableElements() {
        return Array.from(document.querySelectorAll('button:not([disabled]), .series-card, .video-item'))
            .filter(el => el.offsetParent !== null);
    }
    
    setFocus(element) {
        if (this.focusedElement) {
            this.focusedElement.classList.remove('focused');
        }
        this.focusedElement = element;
        element.classList.add('focused');
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    selectFocused() {
        if (this.focusedElement) {
            this.focusedElement.click();
        }
    }
    
    async showLoginScreen() {
        this.currentScreen = 'login';
        document.getElementById('loginScreen').style.display = 'block';
        document.getElementById('homeScreen').style.display = 'none';
        document.getElementById('seriesScreen').style.display = 'none';
        
        await this.startQRLogin();
    }
    
    async startQRLogin() {
        try {
            const response = await fetch(`${this.serverUrl}/api/qr-login`, {
                method: 'POST'
            });
            const data = await response.json();
            this.qrToken = data.token;
            
            document.getElementById('qrCode').src = `${this.serverUrl}/api/qr/${this.qrToken}`;
            document.getElementById('connectionStatus').textContent = 'Scan QR code to login';
            
            this.startQRPolling();
        } catch (error) {
            console.error('QR login failed:', error);
            document.getElementById('connectionStatus').textContent = 'Connection failed';
        }
    }
    
    startQRPolling() {
        this.qrPollInterval = setInterval(async () => {
            try {
                const response = await fetch(`${this.serverUrl}/api/qr-login/${this.qrToken}`);
                const data = await response.json();
                
                if (data.authenticated) {
                    this.authToken = data.authToken;
                    clearInterval(this.qrPollInterval);
                    document.getElementById('connectionStatus').textContent = `Logged in as ${data.username}`;
                    await this.showHomeScreen();
                }
            } catch (error) {
                console.error('QR polling error:', error);
            }
        }, 2000);
    }
    
    async manualLogin() {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        if (!username || !password) return;
        
        try {
            const response = await fetch(`${this.serverUrl}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            if (response.ok) {
                this.authToken = data.token;
                document.getElementById('connectionStatus').textContent = `Logged in as ${data.username}`;
                await this.showHomeScreen();
            } else {
                alert(data.error);
            }
        } catch (error) {
            console.error('Login failed:', error);
            alert('Login failed');
        }
    }
    
    toggleLoginMethod() {
        const manual = document.getElementById('manualLogin');
        const toggle = document.getElementById('toggleLogin');
        
        if (manual.style.display === 'none') {
            manual.style.display = 'flex';
            toggle.textContent = 'QR Login';
        } else {
            manual.style.display = 'none';
            toggle.textContent = 'Manual Login';
        }
    }
    
    async showHomeScreen() {
        this.currentScreen = 'home';
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('homeScreen').style.display = 'block';
        document.getElementById('seriesScreen').style.display = 'none';
        
        await this.loadSeries();
    }
    
    async loadSeries() {
        try {
            const response = await fetch(`${this.serverUrl}/api/series`, {
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            const series = await response.json();
            
            this.displaySeries(series);
        } catch (error) {
            console.error('Failed to load series:', error);
        }
    }
    
    displaySeries(series) {
        const container = document.getElementById('genreContainer');
        container.innerHTML = '';
        
        const genres = {};
        series.forEach(s => {
            if (!genres[s.genre]) genres[s.genre] = [];
            genres[s.genre].push(s);
        });
        
        Object.keys(genres).forEach(genre => {
            const section = document.createElement('div');
            section.className = 'genre-section';
            
            const title = document.createElement('h3');
            title.className = 'genre-title';
            title.textContent = genre;
            section.appendChild(title);
            
            const row = document.createElement('div');
            row.className = 'series-row';
            
            genres[genre].forEach(s => {
                const card = document.createElement('div');
                card.className = 'series-card';
                card.onclick = () => this.showSeries(s);
                
                const image = document.createElement('div');
                image.className = 'series-image';
                image.textContent = '▶';
                
                const info = document.createElement('div');
                info.className = 'series-info';
                
                const seriesTitle = document.createElement('div');
                seriesTitle.className = 'series-title';
                seriesTitle.textContent = s.title;
                
                const count = document.createElement('div');
                count.className = 'series-count';
                count.textContent = `${s.videoCount} videos`;
                
                info.appendChild(seriesTitle);
                info.appendChild(count);
                card.appendChild(image);
                card.appendChild(info);
                row.appendChild(card);
            });
            
            section.appendChild(row);
            container.appendChild(section);
        });
        
        // Set initial focus
        const firstCard = container.querySelector('.series-card');
        if (firstCard) this.setFocus(firstCard);
    }
    
    async showSeries(series) {
        this.currentScreen = 'series';
        document.getElementById('homeScreen').style.display = 'none';
        document.getElementById('seriesScreen').style.display = 'block';
        
        document.getElementById('seriesTitle').textContent = series.title;
        
        try {
            const response = await fetch(`${this.serverUrl}/api/series/${encodeURIComponent(series.id)}`, {
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            const data = await response.json();
            
            const videoList = document.getElementById('videoList');
            videoList.innerHTML = '';
            
            data.videos.forEach(video => {
                const item = document.createElement('div');
                item.className = 'video-item';
                item.onclick = () => this.playVideo(video.url);
                
                const title = document.createElement('div');
                title.className = 'video-title';
                title.textContent = video.title || video.filename;
                
                item.appendChild(title);
                videoList.appendChild(item);
            });
            
            const firstVideo = videoList.querySelector('.video-item');
            if (firstVideo) this.setFocus(firstVideo);
            
        } catch (error) {
            console.error('Failed to load series details:', error);
        }
    }
    
    playVideo(videoUrl) {
        const fullUrl = `${this.serverUrl}${videoUrl}`;
        
        if (typeof tizen !== 'undefined' && tizen.tvaudiocontrol) {
            // Use Tizen video player
            const videoElement = document.createElement('video');
            videoElement.src = fullUrl;
            videoElement.controls = true;
            videoElement.autoplay = true;
            videoElement.style.position = 'fixed';
            videoElement.style.top = '0';
            videoElement.style.left = '0';
            videoElement.style.width = '100vw';
            videoElement.style.height = '100vh';
            videoElement.style.zIndex = '9999';
            videoElement.style.background = '#000';
            
            document.body.appendChild(videoElement);
            
            videoElement.addEventListener('ended', () => {
                document.body.removeChild(videoElement);
            });
        } else {
            // Fallback: open in new window
            window.open(fullUrl, '_blank');
        }
    }
}

// Initialize app when page loads
window.addEventListener('load', () => {
    new VideoStreamApp();
});