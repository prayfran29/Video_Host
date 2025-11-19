# Expose HackHost via Cloudflare Tunnel

## Setup Steps

### 1. Install Cloudflared
```bash
# Windows
winget install --id Cloudflare.cloudflared

# Or download from: https://github.com/cloudflare/cloudflared/releases
```

### 2. Login to Cloudflare
```bash
cloudflared tunnel login
```

### 3. Create Tunnel
```bash
cloudflared tunnel create hackhost-tunnel
```

### 4. Start Docker Container
```bash
docker-compose up -d
```

### 5. Run Tunnel
```bash
# Quick start (temporary URL)
cloudflared tunnel --url http://localhost:3000

# Or with custom domain (update cloudflared.yml first)
cloudflared tunnel run hackhost-tunnel
```

## Result
Your local Docker container will be accessible via:
- Temporary URL: `https://random-subdomain.trycloudflare.com`
- Custom domain: `https://hackhost.yourdomain.com` (if configured)

## Benefits
- **Secure HTTPS** - Automatic SSL certificates
- **No port forwarding** - Works behind NAT/firewall
- **Global access** - Share with anyone worldwide
- **Local development** - Keep your Docker setup unchanged