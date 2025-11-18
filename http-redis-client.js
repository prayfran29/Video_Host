const fetch = require('node-fetch');

class HTTPRedisClient {
    constructor() {
        // Try different Redis host options for Docker compatibility
        const redisHost = process.env.REDIS_HOST || 'host.docker.internal';
        this.baseUrl = `http://${redisHost}:6381`;
        this.connected = true;
    }

    async connect() {
        console.log(`✓ HTTP Redis client ready at ${this.baseUrl}`);
    }

    async setSession(sessionId, data) {
        try {
            await fetch(`${this.baseUrl}/set/session:${sessionId}`, {
                method: 'POST',
                body: JSON.stringify(data),
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (err) {
            console.error('HTTP Redis setSession error:', err.message);
        }
    }

    async getSession(sessionId) {
        try {
            const response = await fetch(`${this.baseUrl}/get/session:${sessionId}`);
            if (response.status === 404) return null;
            const data = await response.text();
            return JSON.parse(data);
        } catch (err) {
            console.error('HTTP Redis getSession error:', err.message);
            return null;
        }
    }

    async deleteSession(sessionId) {
        try {
            await fetch(`${this.baseUrl}/del/session:${sessionId}`, { method: 'DELETE' });
        } catch (err) {
            console.error('HTTP Redis deleteSession error:', err.message);
        }
    }

    async blacklistToken(token) {
        try {
            await fetch(`${this.baseUrl}/set/blacklist:${token}`, {
                method: 'POST',
                body: '1'
            });
        } catch (err) {
            console.error('HTTP Redis blacklistToken error:', err.message);
        }
    }

    async isTokenBlacklisted(token) {
        try {
            const response = await fetch(`${this.baseUrl}/get/blacklist:${token}`);
            return response.status === 200;
        } catch (err) {
            console.error('HTTP Redis isTokenBlacklisted error:', err.message);
            return false;
        }
    }

    async setQRToken(token, data) {
        try {
            console.log(`Setting QR token ${token} to Redis at ${this.baseUrl}`);
            const response = await fetch(`${this.baseUrl}/set/qr:${token}`, {
                method: 'POST',
                body: JSON.stringify(data),
                headers: { 'Content-Type': 'application/json' }
            });
            console.log(`QR token set response: ${response.status}`);
            if (!response.ok) {
                console.error(`Redis setQRToken failed: ${response.status} ${response.statusText}`);
            }
        } catch (err) {
            console.error('HTTP Redis setQRToken error:', err.message);
            console.error('Full error:', err);
        }
    }

    async getQRToken(token) {
        try {
            console.log(`Getting QR token ${token} from Redis at ${this.baseUrl}`);
            const response = await fetch(`${this.baseUrl}/get/qr:${token}`);
            console.log(`QR token get response: ${response.status}`);
            if (response.status === 404) {
                console.log('QR token not found in Redis');
                return null;
            }
            const data = await response.text();
            console.log(`QR token data retrieved: ${data}`);
            return JSON.parse(data);
        } catch (err) {
            console.error('HTTP Redis getQRToken error:', err.message);
            console.error('Full error:', err);
            return null;
        }
    }

    async deleteQRToken(token) {
        try {
            await fetch(`${this.baseUrl}/del/qr:${token}`, { method: 'DELETE' });
        } catch (err) {
            console.error('HTTP Redis deleteQRToken error:', err.message);
        }
    }
}

module.exports = new HTTPRedisClient();