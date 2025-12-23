import os
import sys
import json
import requests

# CONFIGURATION
STASH_URL = "http://localhost:9999/graphql"
PLUGIN_ID = "realDebridDeleter"  # Must match the ID used in index.yml

def get_rd_api_key():
    # Query Stash Plugin Settings to get the key user entered in UI
    query = """
    query Configuration {
      configuration {
        plugins
      }
    }
    """
    try:
        r = requests.post(STASH_URL, json={'query': query})
        if r.status_code != 200:
            return None
            
        data = r.json().get('data', {}).get('configuration', {}).get('plugins', {})
        
        # Stash returns all plugin settings. We look for ours.
        plugin_settings = data.get(PLUGIN_ID, {})
        return plugin_settings.get('rd_api_key')
        
    except Exception as e:
        print(f"Error fetching settings from Stash: {e}", file=sys.stderr)
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
        r = requests.post(STASH_URL, json={'query': query, 'variables': {'id': scene_id}})
        data = r.json()['data']['findScene']
        if data and data['files']:
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
    r = requests.post(STASH_URL, json={'query': query, 'variables': {'id': scene_id}})
    if r.status_code == 200:
        print("Scene deleted from Stash database.")
    else:
        print("Failed to delete from Stash.", file=sys.stderr)

def delete_rd_torrent(filename, token):
    headers = {'Authorization': f'Bearer {token}'}
    
    # 1. Search for the torrent
    r = requests.get('https://api.real-debrid.com/rest/1.0/torrents?limit=100', headers=headers)
    if r.status_code != 200:
        print(f"Error contacting RD: {r.text}", file=sys.stderr)
        return False

    torrents = r.json()
    target_id = None
    clean_name = os.path.splitext(filename)[0].lower()
    
    # 2. Match filename to torrent name
    for t in torrents:
        t_name = t['filename'].lower()
        if clean_name in t_name or t_name in clean_name:
            target_id = t['id']
            break
            
    if not target_id:
        print(f"Could not find a matching torrent in RD history for: {filename}", file=sys.stderr)
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
    if len(sys.argv) < 2:
        print("Error: No Scene ID provided.", file=sys.stderr)
        sys.exit(1)

    token = get_rd_api_key()
    if not token:
        print("Error: RealDebrid API Key not set. Please go to Settings -> Plugins -> RealDebrid Deleter.", file=sys.stderr)
        sys.exit(1)
        
    scene_id = sys.argv[1]
    print(f"Processing delete for Scene ID: {scene_id}...")
    
    filename = get_scene_filename(scene_id)
    if filename:
        if delete_rd_torrent(filename, token):
            delete_stash_scene(scene_id)
        else:
            print("Skipping Stash deletion because RD delete failed.")
    else:
        print("Scene has no files linked.", file=sys.stderr)