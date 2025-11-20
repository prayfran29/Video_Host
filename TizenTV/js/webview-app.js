class TizenWebViewApp {
    constructor() {
        this.tv = new TizenTV();
        this.webview = document.getElementById('webview');
        this.loading = document.getElementById('loading');
        this.deviceId = this.tv.getDeviceId();
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.loadWebsite();
    }
    
    setupEventListeners() {
        document.addEventListener('tvkey', (e) => {
            this.handleRemoteKey(e.detail.keyName);
        });
        
        this.webview.addEventListener('load', () => {
            this.onWebViewLoaded();
        });
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
            // Auto-login for TV
            setTimeout(() => {
                if (document.getElementById('loginUsername')) {
                    document.getElementById('loginUsername').value = 'TV-${this.deviceId.substr(-8)}';
                    document.getElementById('loginPassword').value = 'TVPass123!';
                    setTimeout(() => {
                        if (typeof login === 'function') login();
                    }, 500);
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

// Initialize app when page loads
window.addEventListener('load', () => {
    new TizenWebViewApp();
});