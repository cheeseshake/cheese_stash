import os
import sys
import json
import requests

# CONFIGURATION
STASH_URL = "http://localhost:9999/graphql"
PLUGIN_ID = "realDebridDeleter"

def get_stash_headers():
    # Stash automatically injects this Environment Variable when running a plugin
    api_key = os.environ.get('STASH_API_KEY')
    headers = {
        "Content-Type": "application/json"
    }
    if api_key:
        headers["ApiKey"] = api_key
    return headers

def get_rd_api_key():
    query = """
    query Configuration {
      configuration {
        plugins
      }
    }
    """
    try:
        # USE HEADERS HERE
        r = requests.post(STASH_URL, json={'query': query}, headers=get_stash_headers())
        
        # DEBUG: unexpected response handling
        if r.status_code != 200:
            print(f"Error: Stash returned status {r.status_code}", file=sys.stderr)
            # print(f"Response: {r.text}", file=sys.stderr) # Uncomment if desperate
            return None

        data = r.json().get('data', {}).get('configuration', {}).get('plugins', {})
        return data.get(PLUGIN_ID, {}).get('rd_api_key')
        
    except json.JSONDecodeError:
        print(f"Error: Stash response was not valid JSON. (Status: {r.status_code})", file=sys.stderr)
        return None
    except Exception as e:
        print(f"Error fetching settings: {e}", file=sys.stderr)
        return None

def get_scene_filename(scene_id):
    query = """
    query FindScene($id: ID!) {
      findScene(id: $id) {
        files {
          basename
        }
      }
    }
    """
    try:
        # USE HEADERS HERE TOO
        r = requests.post(STASH_URL, json={'query': query, 'variables': {'id': scene_id}}, headers=get_stash_headers())
        data = r.json().get('data', {}).get('findScene', {})
        if data and data.get('files'):
            return data['files'][0]['basename']
    except Exception as e:
        print(f"Error querying Stash: {e}", file=sys.stderr)
    return None

def delete_stash_scene(scene_id):
    query = """
    mutation SceneDestroy($id: ID!) {
      sceneDestroy(input: {id: $id, delete_file: false, delete_generated: true})
    }
    """
    # USE HEADERS HERE TOO
    r = requests.post(STASH_URL, json={'query': query, 'variables': {'id': scene_id}}, headers=get_stash_headers())
    if r.status_code == 200:
        print(f"Scene {scene_id} deleted from Stash database.")
    else:
        print("Failed to delete from Stash.", file=sys.stderr)

def delete_rd_torrent(filename, token):
    headers = {'Authorization': f'Bearer {token}'}
    
    # 1. Search
    r = requests.get('https://api.real-debrid.com/rest/1.0/torrents?limit=100', headers=headers)
    if r.status_code != 200:
        print(f"Error contacting RD: {r.text}", file=sys.stderr)
        return False

    torrents = r.json()
    target_id = None
    clean_name = os.path.splitext(filename)[0].lower()
    
    # 2. Fuzzy Match
    for t in torrents:
        t_name = t['filename'].lower()
        if clean_name in t_name or t_name in clean_name:
            target_id = t['id']
            break
            
    if not target_id:
        print(f"Could not find a matching torrent in RD for: {filename}", file=sys.stderr)
        return False
        
    # 3. Delete
    del_r = requests.delete(f"https://api.real-debrid.com/rest/1.0/torrents/delete/{target_id}", headers=headers)
    if del_r.status_code == 204:
        print(f"Successfully deleted torrent {target_id} from RealDebrid.")
        return True
    else:
        print(f"Failed to delete torrent: {del_r.text}", file=sys.stderr)
        return False

if __name__ == "__main__":
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError:
        print("Error: No input data received.", file=sys.stderr)
        sys.exit(1)

    # Robust Argument Fetching
    scene_id = input_data.get('scene_id')
    if not scene_id:
        scene_id = input_data.get('args', {}).get('scene_id')

    if not scene_id:
        print(f"Error: No Scene ID found in input.", file=sys.stderr)
        sys.exit(1)

    token = get_rd_api_key()
    if not token:
        print("Error: RealDebrid API Key not set. Please check Plugin Settings.", file=sys.stderr)
        sys.exit(1)
        
    print(f"Processing delete for Scene ID: {scene_id}...")
    
    filename = get_scene_filename(scene_id)
    if filename:
        if delete_rd_torrent(filename, token):
            delete_stash_scene(scene_id)
        else:
            print("Skipping Stash deletion because RD delete failed.")
    else:
        print("Scene has no files linked.", file=sys.stderr)