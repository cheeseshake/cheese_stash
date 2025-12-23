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

# --- OUTPUT HELPERS ---
def log(msg):
    """Prints to stderr (Stash Logs)."""
    sys.stderr.write(f"[RD-Plugin] {msg}\n")
    sys.stderr.flush()

def send_response(payload, req_id):
    """
    LOG SCRAPER ARCHITECTURE: 
    Write JSON to STDERR wrapped in unique tags.
    """
    if not req_id:
        log("CRITICAL: No Request ID provided.")
        sys.exit(1)

    json_str = json.dumps(payload)
    tag = f"###RD_RES_{req_id}###"
    
    # Print sandwich to logs
    sys.stderr.write(f"{tag}{json_str}{tag}\n")
    sys.stderr.flush()
    sys.exit(0)

def error_exit(msg, req_id=None):
    log(f"ERROR: {msg}")
    if req_id:
        send_response({"error": msg}, req_id)
    sys.exit(1)

# --- CONFIG & NETWORK ---
def get_api_key_from_config():
    if not os.path.exists(CONFIG_PATH): return None
    try:
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip().startswith('api_key:'):
                    return line.split(':', 1)[1].strip().strip('"').strip("'")
    except: pass
    return None

def get_stash_headers():
    headers = {"Content-Type": "application/json"}
    api_key = os.environ.get('STASH_API_KEY') or get_api_key_from_config()
    if api_key: headers["ApiKey"] = api_key
    return headers

def get_rd_api_key():
    query = "query Configuration { configuration { plugins } }"
    try:
        r = requests.post(STASH_URL, json={'query': query}, headers=get_stash_headers())
        if r.status_code != 200: return None
        data = r.json().get('data', {}).get('configuration', {}).get('plugins', {})
        return data.get(PLUGIN_ID, {}).get('rd_api_key')
    except: return None

# --- LOGIC ---
def get_scene_details(scene_id):
    query = """query FindScene($id: ID!) { findScene(id: $id) { id title files { path basename } } }"""
    try:
        r = requests.post(STASH_URL, json={'query': query, 'variables': {'id': scene_id}}, headers=get_stash_headers())
        return r.json().get('data', {}).get('findScene')
    except: return None

def find_sibling_scenes(folder_path):
    # Ensure no trailing slash for the query
    clean_search_path = folder_path.rstrip(os.sep)
    
    log(f"DEBUG: Searching Stash for siblings in: {clean_search_path}")

    query = """query FindScenesByPath($filter: SceneFilterType!) { 
        findScenes(scene_filter: $filter) { 
            scenes { id title files { path } } 
        } 
    }"""
    
    variables = {"filter": {"path": {"value": clean_search_path, "modifier": "INCLUDES"}}}
    
    try:
        r = requests.post(STASH_URL, json={'query': query, 'variables': variables}, headers=get_stash_headers())
        data = r.json()
        
        # Log raw response for debugging
        # log(f"DEBUG: Stash Raw Response: {json.dumps(data)}") 

        scenes = data.get('data', {}).get('findScenes', {}).get('scenes', [])
        log(f"DEBUG: Stash Query found {len(scenes)} potential matches.")

        siblings = []
        match_prefix = clean_search_path + os.sep
        
        for s in scenes:
            if not s['files']: continue
            path = s['files'][0]['path']
            
            # Log why we accept/reject each file
            # is_direct_child = os.path.dirname(path) == clean_search_path
            # is_nested_child = path.startswith(match_prefix)
            
            if os.path.dirname(path) == clean_search_path or path.startswith(match_prefix):
                 siblings.append({'id': s['id'], 'title': s['title']})
            else:
                 # log(f"DEBUG: Rejecting sibling {s['id']} path mismatch: {path}")
                 pass
                 
        log(f"DEBUG: Final sibling count: {len(siblings)}")
        return siblings
    except Exception as e:
        log(f"DEBUG: Error finding siblings: {e}")
        return []

def get_torrent_info(filename, full_path, token):
    headers = {'Authorization': f'Bearer {token}'}
    folder_name = os.path.basename(os.path.dirname(full_path))
    file_name = os.path.basename(full_path)
    
    search_term = folder_name
    if folder_name.lower() in ['__all__', 'cloud', 'data', 'realdebrid', 'zurg', 'movies', 'shows', 'default']:
        search_term = file_name

    log(f"Searching RD for: {search_term}")
    try:
        r = requests.get('https://api.real-debrid.com/rest/1.0/torrents?limit=100', headers=headers)
        if r.status_code != 200: return None
        torrents = r.json()
    except: return None

    target = None
    clean_search = search_term.lower()
    clean_file = os.path.splitext(file_name)[0].lower()

    for t in torrents:
        t_name = t['filename'].lower()
        if clean_search == t_name or clean_file in t_name:
            target = t
            break
            
    if not target: return None

    try:
        r2 = requests.get(f"https://api.real-debrid.com/rest/1.0/torrents/info/{target['id']}", headers=headers)
        if r2.status_code == 200: return r2.json()
    except: pass
    
    return target

# --- MODES ---
def execute_delete_mode(input_data, token, req_id):
    log("Entering Delete Mode")
    torrent_id = input_data.get('torrent_id')
    scene_ids_raw = input_data.get('scene_ids', '[]')
    
    try:
        scene_ids = json.loads(scene_ids_raw)
    except:
        scene_ids = [scene_ids_raw] if scene_ids_raw else []
    
    if not torrent_id or torrent_id == "undefined":
        error_exit("Missing valid torrent_id.", req_id)

    log(f"Deleting Torrent ID: {torrent_id}")
    headers = {'Authorization': f'Bearer {token}'}
    del_r = requests.delete(f"https://api.real-debrid.com/rest/1.0/torrents/delete/{torrent_id}", headers=headers)
    
    if del_r.status_code not in [204, 200]:
        error_exit(f"RD Delete Failed ({del_r.status_code})", req_id)

    query = """mutation SceneDestroy($id: ID!) { sceneDestroy(input: {id: $id, delete_file: false, delete_generated: true}) }"""
    deleted_count = 0
    for sid in scene_ids:
        log(f"Deleting Stash Scene: {sid}")
        r = requests.post(STASH_URL, json={'query': query, 'variables': {'id': sid}}, headers=get_stash_headers())
        if r.status_code == 200: deleted_count += 1

    send_response({"status": "success", "deleted_scenes": deleted_count}, req_id)

def execute_check_mode(scene_id, token, req_id):
    log(f"Entering Check Mode for Scene {scene_id}")
    scene = get_scene_details(scene_id)
    if not scene or not scene['files']:
        error_exit("Scene has no files", req_id)

    full_path = scene['files'][0]['path']
    folder_path = os.path.dirname(full_path)
    
    torrent = get_torrent_info(scene['files'][0]['basename'], full_path, token)
    if not torrent:
        error_exit("Torrent not found in RD history (No name match)", req_id)

    files = torrent.get('files', [])
    video_count = sum(1 for f in files if os.path.splitext(f['path'])[1].lower() in VIDEO_EXTENSIONS)
    
    log(f"Found Torrent: {torrent['filename']} (Videos: {video_count})")
    
    siblings = find_sibling_scenes(folder_path)
    related_scenes = [s for s in siblings if str(s['id']) != str(scene_id)]
    
    send_response({
        "status": "check_complete",
        "torrent_id": torrent['id'],
        "torrent_name": torrent['filename'],
        "video_file_count": video_count,
        "is_pack": video_count > 1,
        "related_scenes": related_scenes, 
        "folder_path": folder_path
    }, req_id)

# --- MAIN ---
if __name__ == "__main__":
    try:
        input_data = json.load(sys.stdin)
        args = input_data.get('args', {}) if 'args' in input_data else input_data
        
        mode = args.get('mode', 'check')
        req_id = args.get('req_id')
        token = get_rd_api_key()
        
        if not token: error_exit("RD API Key missing in Plugin Settings", req_id)

        if mode == 'delete':
            execute_delete_mode(args, token, req_id)
        else:
            sid = args.get('scene_id')
            if not sid: error_exit("No Scene ID provided", req_id)
            execute_check_mode(sid, token, req_id)

    except Exception as e:
        r_id = locals().get('req_id', None)
        error_exit(f"Script Crash: {str(e)}", r_id)