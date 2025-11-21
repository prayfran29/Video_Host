class TizenWebViewApp {
    constructor() {
        this.tv = new TizenTV();
        this.webview = document.getElementById('webview');
        this.loading = document.getElementById('loading');
        this.deviceId = this.tv.getDeviceId();
        this.inactivityTimer = null;
        this.INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.loadWebsite();
    }
    
    setupEventListeners() {
        document.addEventListener('tvkey', (e) => {
            this.handleRemoteKey(e.detail.keyName);
            this.resetInactivityTimer();
        });
        
        this.webview.addEventListener('load', () => {
            this.onWebViewLoaded();
        });
        
        // Start inactivity timer
        this.startInactivityTimer();
    }
    
    loadWebsite() {
        this.webview.src = 'http://magnushackhost.win';
    }
    
    onWebViewLoaded() {
        this.loading.style.display = 'none';
        this.webview.style.display = 'block';
        
        // Inject TV-specific optimizations
        this.injectTVOptimizations();
        
        // Auto-login for TV
        setTimeout(() => {
            this.performAutoLogin();
        }, 2000);
    }
    
    injectTVOptimizations() {
        const script = `
            // TV-specific optimizations
            (function() {
                // Add TV styling
                var style = document.createElement('style');
                style.textContent = \`
                    body { font-size: 1.2rem !important; }
                    .content-card { width: 160px !important; height: 200px !important; }
                    .card-image { height: 110px !important; }
                    .content-card:focus, .content-card.card-focused {
                        outline: 4px solid #0066ff !important;
                        outline-offset: 4px !important;
                        transform: scale(1.1) !important;
                        box-shadow: 0 0 20px rgba(0, 102, 255, 0.8) !important;
                    }
                    #exitBtn, #reloadBtn { display: block !important; }
                    /* Video optimizations */
                    #videoPlayer { 
                        width: 100% !important; 
                        height: 400px !important; 
                        background: black !important; 
                    } 
                    .video-container { 
                        height: 400px !important; 
                        background: black !important; 
                    }
                \`;
                document.head.appendChild(style);
                
                // Add Android interface for compatibility
                window.Android = {
                    exitApp: function() {
                        parent.postMessage({type: 'exit'}, '*');
                    },
                    getDeviceId: function() {
                        return '${this.deviceId}';
                    }
                };
                
                // Add Mobile interface for mobile app compatibility
                window.Mobile = {
                    exitApp: function() {
                        parent.postMessage({type: 'exit'}, '*');
                    },
                    getDeviceId: function() {
                        return '${this.deviceId}';
                    },
                    saveCredentials: function(username, password) {
                        // Tizen TV credential storage
                        if (typeof tizen !== 'undefined' && tizen.preference) {
                            try {
                                tizen.preference.setValue('tv_username', username);
                                tizen.preference.setValue('tv_password', password);
                            } catch (e) {
                                console.warn('Failed to save credentials:', e);
                            }
                        }
                    },
                    clearCredentials: function() {
                        if (typeof tizen !== 'undefined' && tizen.preference) {
                            try {
                                tizen.preference.remove('tv_username');
                                tizen.preference.remove('tv_password');
                            } catch (e) {
                                console.warn('Failed to clear credentials:', e);
                            }
                        }
                    }
                };
                
                console.log('Tizen TV optimizations loaded');
            })();
        `;
        
        try {
            this.webview.contentWindow.eval(script);
        } catch (e) {
            console.warn('Failed to inject optimizations:', e);
        }
    }
    
    performAutoLogin() {
        const loginScript = `
            // Auto-login for TV with credential checking
            setTimeout(() => {
                // First check if already logged in with valid token
                if (localStorage.getItem('authToken') && localStorage.getItem('currentUser')) {
                    fetch('/api/series', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') } })
                        .then(response => {
                            if (response.ok) {
                                console.log('Existing token valid, skipping login');
                                if (typeof updateUI === 'function') updateUI();
                                document.querySelector('main').style.display = 'block';
                                if (typeof loadSeries === 'function') loadSeries();
                                return;
                            } else {
                                console.log('Token invalid, proceeding with login');
                                performTVLogin();
                            }
                        })
                        .catch(() => performTVLogin());
                } else {
                    performTVLogin();
                }
                
                function performTVLogin() {
                    if (document.getElementById('loginUsername')) {
                        // Try saved credentials first
                        var savedUsername = '';
                        var savedPassword = '';
                        
                        try {
                            if (typeof tizen !== 'undefined' && tizen.preference) {
                                savedUsername = tizen.preference.getValue('tv_username') || '';
                                savedPassword = tizen.preference.getValue('tv_password') || '';
                            }
                        } catch (e) {
                            console.warn('Failed to load saved credentials:', e);
                        }
                        
                        if (savedUsername && savedPassword) {
                            document.getElementById('loginUsername').value = savedUsername;
                            document.getElementById('loginPassword').value = savedPassword;
                        } else {
                            // Use default TV credentials
                            document.getElementById('loginUsername').value = 'TV-${this.deviceId.substr(-8)}';
                            document.getElementById('loginPassword').value = 'TVPass123!';
                        }
                        
                        setTimeout(() => {
                            if (typeof login === 'function') login();
                        }, 500);
                    }
                }
            }, 1000);
        `;
        
        try {
            this.webview.contentWindow.eval(loginScript);
        } catch (e) {
            console.warn('Failed to perform auto-login:', e);
        }
    }
    
    handleRemoteKey(keyName) {
        console.log('Remote key:', keyName);
        
        // Forward key events to webview
        const keyEvent = {
            ArrowUp: 38,
            ArrowDown: 40,
            ArrowLeft: 37,
            ArrowRight: 39,
            Enter: 13,
            Return: 8,
            ColorF0Red: 82
        };
        
        if (keyName === 'ColorF0Red') {
            this.tv.exit();
            return;
        }
        
        // Reset inactivity timer on any key press
        this.resetInactivityTimer();
        
        const keyCode = keyEvent[keyName];
        if (keyCode) {
            try {
                const event = new this.webview.contentWindow.KeyboardEvent('keydown', {
                    keyCode: keyCode,
                    which: keyCode,
                    bubbles: true
                });
                this.webview.contentDocument.dispatchEvent(event);
            } catch (e) {
                console.warn('Failed to forward key event:', e);
            }
        }
    }
}

// Handle messages from webview
window.addEventListener('message', (event) => {
    if (event.data.type === 'exit') {
        if (typeof tizen !== 'undefined' && tizen.application) {
            tizen.application.getCurrentApplication().exit();
        }
    }
});

    startInactivityTimer() {
        this.stopInactivityTimer();
        this.inactivityTimer = setTimeout(() => {
            // Check if video is playing before sleeping
            try {
                const isVideoPlaying = this.webview.contentWindow.eval(`
                    (function() {
                        var video = document.querySelector('video');
                        return video && !video.paused && !video.ended;
                    })()
                `);
                
                if (!isVideoPlaying) {
                    console.log('Inactivity timeout - exiting app');
                    this.tv.exit();
                } else {
                    // Video is playing, restart timer
                    this.startInactivityTimer();
                }
            } catch (e) {
                // If we can't check video status, exit anyway
                this.tv.exit();
            }
        }, this.INACTIVITY_TIMEOUT);
    }
    
    stopInactivityTimer() {
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
            this.inactivityTimer = null;
        }
    }
    
    resetInactivityTimer() {
        this.startInactivityTimer();
    }
}

// Initialize app when page loads
window.addEventListener('load', () => {
    new TizenWebViewApp();
});