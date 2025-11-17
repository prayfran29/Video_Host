import os
import requests
from PIL import Image

def auto_download_posters():
    videos_dir = "D:\\videos"
    
    for root, dirs, files in os.walk(videos_dir):
        video_files = [f for f in files if f.lower().endswith(('.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'))]
        
        if video_files:
            series_name = os.path.basename(root)
            img_path = os.path.join(root, "img.jpg")
            
            # Check if no image exists OR if it's a placeholder
            needs_poster = False
            
            if not os.path.exists(img_path):
                print(f"No image found for: {series_name}")
                needs_poster = True
            else:
                # Check if existing image is a placeholder
                try:
                    img = Image.open(img_path)
                    colors = img.getcolors(maxcolors=256*256*256)
                    if colors:
                        dominant_color = max(colors, key=lambda item: item[0])[1]
                        if isinstance(dominant_color, tuple) and len(dominant_color) >= 3:
                            r, g, b = dominant_color[:3]
                            is_placeholder_blue = (70 <= r <= 80 and 140 <= g <= 150 and 220 <= b <= 230)
                            is_placeholder_size = img.size == (300, 450)
                            
                            if is_placeholder_blue and is_placeholder_size:
                                print(f"Placeholder detected for: {series_name}")
                                needs_poster = True
                except:
                    pass
            
            if needs_poster:
                print(f"Getting poster for: {series_name}")
                
                # Try OMDB API for movie first
                try:
                    search_url = f"http://www.omdbapi.com/?apikey=33ae93ad&t={series_name}&type=movie"
                    response = requests.get(search_url, timeout=10)
                    
                    if response.status_code == 200:
                        data = response.json()
                        if data.get('Response') == 'True' and 'Poster' in data:
                            poster_url = data['Poster']
                            if poster_url != 'N/A':
                                poster_response = requests.get(poster_url, timeout=10)
                                if poster_response.status_code == 200:
                                    with open(img_path, 'wb') as f:
                                        f.write(poster_response.content)
                                    print(f"✅ Downloaded movie poster: {series_name}")
                                    continue
                    
                    # Try as TV series if movie failed
                    search_url = f"http://www.omdbapi.com/?apikey=33ae93ad&t={series_name}&type=series"
                    response = requests.get(search_url, timeout=10)
                    
                    if response.status_code == 200:
                        data = response.json()
                        if data.get('Response') == 'True' and 'Poster' in data:
                            poster_url = data['Poster']
                            if poster_url != 'N/A':
                                poster_response = requests.get(poster_url, timeout=10)
                                if poster_response.status_code == 200:
                                    with open(img_path, 'wb') as f:
                                        f.write(poster_response.content)
                                    print(f"✅ Downloaded TV poster: {series_name}")
                                    continue
                    
                    # Fallback to Lorem Picsum if no poster found
                    print(f"No OMDB poster found, using generic image for: {series_name}")
                    seed = hash(series_name) % 1000
                    img_url = f"https://picsum.photos/seed/{seed}/300/450"
                    
                    response = requests.get(img_url, timeout=10)
                    if response.status_code == 200:
                        with open(img_path, 'wb') as f:
                            f.write(response.content)
                        print(f"✅ Downloaded generic image: {series_name}")
                    
                except Exception as e:
                    print(f"❌ Error for {series_name}: {e}")

if __name__ == "__main__":
    auto_download_posters()