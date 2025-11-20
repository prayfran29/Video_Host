// Tizen TV API wrapper
class TizenTV {
    constructor() {
        this.isReady = false;
        this.init();
    }
    
    init() {
        if (typeof tizen !== 'undefined') {
            this.isReady = true;
            this.registerKeys();
        } else {
            // Fallback for browser testing
            this.isReady = true;
            this.simulateKeys();
        }
    }
    
    registerKeys() {
        if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
            const keys = [
                'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
                'MediaRewind', 'MediaFastForward', 'MediaTrackPrevious', 'MediaTrackNext',
                '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
                'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'
            ];
            
            keys.forEach(key => {
                try {
                    tizen.tvinputdevice.registerKey(key);
                } catch (e) {
                    console.warn('Failed to register key:', key);
                }
            });
        }
    }
    
    simulateKeys() {
        // Simulate TV remote keys for browser testing
        document.addEventListener('keydown', (e) => {
            const event = new CustomEvent('tvkey', {
                detail: { keyName: this.mapKeyCode(e.keyCode) }
            });
            document.dispatchEvent(event);
        });
    }
    
    mapKeyCode(keyCode) {
        const keyMap = {
            37: 'ArrowLeft',
            38: 'ArrowUp', 
            39: 'ArrowRight',
            40: 'ArrowDown',
            13: 'Enter',
            8: 'Return',
            27: 'Return',
            32: 'MediaPlayPause',
            82: 'ColorF0Red',
            71: 'ColorF1Green',
            89: 'ColorF2Yellow',
            66: 'ColorF3Blue'
        };
        return keyMap[keyCode] || 'Unknown';
    }
    
    getDeviceId() {
        if (typeof tizen !== 'undefined' && tizen.systeminfo) {
            try {
                return tizen.systeminfo.getCapability('http://tizen.org/system/tizenid');
            } catch (e) {
                console.warn('Failed to get device ID');
            }
        }
        return 'TIZEN-' + Math.random().toString(36).substr(2, 8);
    }
    
    exit() {
        if (typeof tizen !== 'undefined' && tizen.application) {
            tizen.application.getCurrentApplication().exit();
        } else {
            window.close();
        }
    }
}