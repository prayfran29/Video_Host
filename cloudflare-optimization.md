# Cloudflare Dashboard Navigation Guide

## Step-by-Step Instructions

### 1. Login & Select Domain
1. Go to dash.cloudflare.com
2. Click on **magnushackhost.win** domain

### 2. Speed Settings
**Location**: Left sidebar → **Speed** → **Optimization**
- Auto Minify: Toggle ON (HTML, CSS, JavaScript)
- Brotli: Toggle ON
- Early Hints: Toggle ON

### 3. Caching Rules
**Location**: Left sidebar → **Rules** → **Page Rules**
- Click **Create Page Rule**
- Rule 1: `magnushackhost.win/videos/*`
  - Cache Level: Cache Everything
  - Edge Cache TTL: 1 month
  - Browser Cache TTL: 1 day
- Rule 2: `magnushackhost.win/api/*`
  - Cache Level: Bypass

### 4. Network Settings
**Location**: Left sidebar → **Network**
- HTTP/2: Toggle ON
- HTTP/3 (with QUIC): Toggle ON
- 0-RTT Connection Resumption: Toggle ON
- WebSockets: Toggle ON
- HTTP/2 to Origin: Toggle ON

### 5. Polish (Image Optimization)
**Location**: Left sidebar → **Speed** → **Optimization**
- Polish: Select **Lossless**
- WebP: Toggle ON

### 6. Security Settings
**Location**: Left sidebar → **Security** → **Settings**
- Security Level: Medium
- Challenge Passage: 30 minutes

## Expected Improvements
- 30-50% faster video loading
- Better mobile performance
- Reduced bandwidth usage
- Improved thumbnail loading

## Restart Tunnel
After updating cloudflared.yml:
```bash
# Stop current tunnel
cloudflared tunnel stop hackhost-tunnel

# Start with new config
cloudflared tunnel run hackhost-tunnel
```