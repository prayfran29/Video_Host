import requests
import subprocess
import time
import sys
import os

def check_cloudflare_status():
    """Check if Cloudflare is up by testing the tunnel endpoint"""
    try:
        response = requests.get("https://magnushackhost.win", timeout=10)
        return response.status_code == 200
    except:
        return False

def is_tunnel_running():
    """Check if cloudflared tunnel is already running"""
    try:
        result = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq cloudflared.exe'], 
                              capture_output=True, text=True, shell=True)
        return 'cloudflared.exe' in result.stdout
    except:
        return False

def start_tunnel():
    """Start the cloudflared tunnel in background"""
    config_path = os.path.join(os.path.dirname(__file__), '..', 'config', 'cloudflared.yml')
    cmd = f'cloudflared tunnel --config "{config_path}" run hackhost-tunnel'
    
    print("Starting Cloudflare tunnel...")
    subprocess.Popen(cmd, shell=True, creationflags=subprocess.CREATE_NO_WINDOW)

def main():
    print("Cloudflare monitor started. Press Ctrl+C to stop.")
    
    try:
        while True:
            print(f"Checking at {time.strftime('%H:%M:%S')}...")
            
            if check_cloudflare_status():
                print("✅ Cloudflare is up")
            else:
                print("❌ Cloudflare down - checking tunnel...")
                if not is_tunnel_running():
                    start_tunnel()
                    print("🚀 Tunnel started")
                else:
                    print("⚠️ Tunnel already running")
            
            print("Waiting 2 minutes...\n")
            time.sleep(120)
    except KeyboardInterrupt:
        print("\nStopping monitor...")

if __name__ == "__main__":
    main()