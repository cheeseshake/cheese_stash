import os
import sys
import json
import requests
import re

# CONFIGURATION
STASH_URL = "http://localhost:9999/graphql"
CONFIG_PATH = "/root/.stash/config.yml" 
PLUGIN_ID = "realDebridDeleter"
VIDEO_EXTENSIONS = {'.mp4', '.mkv', '.avi', '.wmv', '.mov', '.m4v', '.flv', '.webm', '.ts', '.iso'}

# --- HELPERS ---

def get_api_key_from_config():
    """Reads API Key from config.yml without external dependencies."""
    if not os.path.exists(CONFIG_PATH): return None
    try:
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            for line in f:
                clean = line.strip()
                if clean.startswith('api_key:'):
                    return clean.split(':', 1)[1].strip().strip('"').strip("'")
    except: pass
    return None

def get_stash_headers():
    """Injects Stash API Key into headers."""
    headers = {"Content-Type": "application/json"}
    api_key = os.environ.get('STASH_API_KEY') or get_api_key_from_config()
    if api_key: headers["ApiKey"] = api_key
    return headers

def get_rd_api_key():
    """Fetches the user's RD Key from Plugin Settings."""
    query = "query Configuration { configuration { plugins } }"
    try:
        r = requests.post(STASH_URL, json={'query': query}, headers=get_stash_headers())
        if r.status_code != 200: return None
        data = r.json().get('data', {}).get('configuration', {}).get('plugins', {})
        return data.get(PLUGIN_ID, {}).get('rd_api_key')
    except: return None

def get_scene_details(scene_id):
    query = """
    query FindScene($id: ID!) {
      findScene(id: $id) {
        id
        title
        files {
          path
          basename
        }
      }
    }
    """
    try:
        r = requests.post(STASH_URL, json={'query': query, 'variables': {'id': scene_id}}, headers=get_stash_headers())
        return r.json().get('data', {}).get('findScene')
    except: return None

def find_sibling_scenes(folder_path):
    """Finds all OTHER scenes in Stash that live in the same folder."""
    escaped_path = re.escape(folder_path)
    
    query = """
    query FindScenesByPath($filter: SceneFilterType!) {
      findScenes(scene_filter: $filter) {
        scenes {
          id
          title
          files {
            path
          }
        }
      }
    }
    """
    variables = {
        "filter": {
            "path": {
                "value": escaped_path,
                "modifier": "INCLUDES"
            }
        }
    }
    
    try:
        r = requests.post(STASH_URL, json={'query': query, 'variables': variables}, headers=get_stash_headers())
        scenes = r.json().get('data', {}).get('findScenes', {}).get('scenes', [])
        
        siblings = []
        for s in scenes:
            if s['files']:
                f_path = s['files'][0]['path']
                # Ensure it is a direct child of the folder
                if os.path.dirname(f_path) == folder_path:
                    siblings.append({'id': s['id'], 'title': s['title']})
        return siblings
    except Exception as e:
        print(f"Error finding siblings: {e}", file=sys.stderr)
        return []

def get_torrent_info(filename, full_path, token):
    headers = {'Authorization': f'Bearer {token}'}
    
    # 1. Identify Search Term
    folder_name = os.path.basename(os.path.dirname(full_path))
    file_name = os.path.basename(full_path)
    
    search_term = folder_name
    # Fallback if file is in a generic root folder
    if folder_name.lower() in ['__all__', 'cloud', 'data', 'realdebrid', 'zurg', 'movies', 'shows', 'default']:
        search_term = file_name

    # 2. Search RD History
    r = requests.get('https://api.real-debrid.com/rest/1.0/torrents?limit=100', headers=headers)
    if r.status_code != 200: return None

    torrents = r.json()
    target = None
    
    clean_search = search_term.lower()
    clean_file = os.path.splitext(file_name)[0].lower()

    for t in torrents:
        t_name = t['filename'].lower()
        if clean_search == t_name or clean_file in t_name:
            target = t
            break
            
    if not target: return None

    # 3. Get Details (File Count)
    r2 = requests.get(f"https://api.real-debrid.com/rest/1.0/torrents/info/{target['id']}", headers=headers)
    if r2.status_code == 200:
        return r2.json()
    
    return target

# --- MODES ---

def execute_delete_mode(input_data, token):
    torrent_id = input_data.get('torrent_id')
    scene_ids_raw = input_data.get('scene_ids', '[]')
    
    # FIX: Parse stringified JSON list from JS
    try:
        scene_ids = json.loads(scene_ids_raw)
    except:
        scene_ids = [scene_ids_raw] if scene_ids_raw else []
    
    if not torrent_id:
        print("Error: Missing torrent_id for delete mode.", file=sys.stderr)
        sys.exit(1)

    print(f"EXECUTING DELETE: Torrent {torrent_id} + {len(scene_ids)} Scenes.")

    # 1. Delete from RD
    headers = {'Authorization': f'Bearer {token}'}
    del_r = requests.delete(f"https://api.real-debrid.com/rest/1.0/torrents/delete/{torrent_id}", headers=headers)
    
    if del_r.status_code == 204:
        print("RD Torrent deleted.")
    else:
        print(f"RD Delete Failed ({del_r.status_code}). Aborting Stash delete.", file=sys.stderr)
        sys.exit(1)

    # 2. Delete from Stash
    query = """
    mutation SceneDestroy($id: ID!) {
      sceneDestroy(input: {id: $id, delete_file: false, delete_generated: true})
    }
    """
    
    for sid in scene_ids:
        r = requests.post(STASH_URL, json={'query': query, 'variables': {'id': sid}}, headers=get_stash_headers())
        if r.status_code == 200:
            print(f"Stash Scene {sid} deleted.")
        else:
            print(f"Failed to delete Stash Scene {sid}.", file=sys.stderr)

    # Return success JSON
    print(json.dumps({"status": "success", "deleted_scenes": len(scene_ids)}))

def execute_check_mode(scene_id, token):
    scene = get_scene_details(scene_id)
    if not scene or not scene['files']:
        print(json.dumps({"error": "Scene has no files"}))
        return

    full_path = scene['files'][0]['path']
    folder_path = os.path.dirname(full_path)
    
    # 1. Find Torrent Info
    torrent = get_torrent_info(scene['files'][0]['basename'], full_path, token)
    if not torrent:
        print(json.dumps({"error": "Torrent not found in RD history"}))
        return

    # 2. Count Videos in Torrent
    files = torrent.get('files', [])
    video_count = sum(1 for f in files if os.path.splitext(f['path'])[1].lower() in VIDEO_EXTENSIONS)
    
    # 3. Find Sibling Scenes in Stash
    siblings = find_sibling_scenes(folder_path)
    
    # 4. Filter Siblings (Remove current scene from list)
    related_scenes = [s for s in siblings if str(s['id']) != str(scene_id)]
    
    # Return JSON Report
    payload = {
        "status": "check_complete",
        "torrent_id": torrent['id'],
        "torrent_name": torrent['filename'],
        "video_file_count": video_count,
        "is_pack": video_count > 1,
        "related_scenes": related_scenes, 
        "folder_path": folder_path
    }
    print(json.dumps(payload))

if __name__ == "__main__":
    try:
        input_data = json.load(sys.stdin)
    except:
        sys.exit(1)

    # Support both direct input and Stash 'args' wrapper
    args = input_data.get('args', {}) if 'args' in input_data else input_data
    
    mode = args.get('mode', 'check') 
    token = get_rd_api_key()
    
    if not token:
        print("Error: RD API Key missing", file=sys.stderr)
        sys.exit(1)

    if mode == 'delete':
        execute_delete_mode(args, token)
    else:
        # Check Mode needs a starting scene ID
        sid = args.get('scene_id')
        if not sid: sys.exit(1)
        execute_check_mode(sid, token)