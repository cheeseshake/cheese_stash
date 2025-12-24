import sys
import json
import requests
import re

# Simple logger for Stash logs
def log(msg):
    sys.stderr.write(f"[Bunkr-Plugin] {msg}\n")
    sys.stderr.flush()

def extract_mp4(url):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    log(f"Scraping: {url}")
    try:
        r = requests.get(url, headers=headers, timeout=10)
        r.raise_for_status()
        html = r.text
        
        # Regex 1: Standard src="...mp4"
        match = re.search(r'src="([^"]+\.mp4)"', html)
        if match:
            return match.group(1)
            
        # Regex 2: Source tag <source src="...">
        match_source = re.search(r'<source[^>]+src="([^"]+)"', html)
        if match_source:
            return match_source.group(1)
            
        return None
    except Exception as e:
        log(f"Error scraping: {e}")
        return None

if __name__ == "__main__":
    try:
        input_data = sys.stdin.read()
        if not input_data:
            sys.exit(0)
            
        data = json.loads(input_data)
        args = data.get('args', {})
        url = args.get('url')
        
        if not url:
            print(json.dumps({"error": "No URL provided"}))
            sys.exit(0)

        mp4_link = extract_mp4(url)
        
        if mp4_link:
            log(f"Found MP4: {mp4_link}")
            print(json.dumps({"mp4": mp4_link}))
        else:
            log("No MP4 link found in page source")
            print(json.dumps({"error": "No MP4 found"}))

    except Exception as e:
        log(f"Critical Error: {e}")
        print(json.dumps({"error": str(e)}))