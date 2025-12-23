console.log("RD Plugin: Script Loaded (Dead Drop Mode)");

(function () {
    'use strict';

    const PLUGIN_ID = "realDebridDeleter";
    const TASK_NAME = "Delete From Cloud";
    const BUTTON_ID = "rd-delete-plugin-btn";

    // --- 1. NETWORK HELPER ---
    
    // Generates a simple random ID for the file handoff
    function generateReqId() {
        return Date.now().toString() + "_" + Math.floor(Math.random() * 10000);
    }

// ... inside realDebridDeleter.js ...

    async function waitForFile(reqId, maxAttempts = 20) {
        // CRITICAL FIX: Stash serves plugin files at /plugin/<id>/
        // We also add ?t=timestamp to bypass browser caching.
        const fileUrl = `/plugin/${PLUGIN_ID}/rd_response_${reqId}.json?t=${Date.now()}`;
        
        for (let i = 0; i < maxAttempts; i++) {
            try {
                // Try to fetch the file
                const response = await fetch(fileUrl, { cache: "no-store" });
                
                if (response.ok) {
                    const data = await response.json();
                    console.log("RD Plugin: Response file found!", data);
                    return data;
                } else {
                    console.log(`RD Plugin: Poll ${i+1}/${maxAttempts} - File not ready (404)`);
                }
            } catch (e) {
                // Ignore network errors while polling
            }
            
            // Wait 1 second before next try
            await new Promise(r => setTimeout(r, 1000));
        }
        
        return { error: "Timeout waiting for plugin response file." };
    }

    // ... rest of the file ...

    async function runPluginTask(mode, payload) {
        const reqId = generateReqId();
        
        const mutation = `
            mutation RunTask($plugin_id: ID!, $task_name: String!, $args: [PluginArgInput!]) {
                runPluginTask(plugin_id: $plugin_id, task_name: $task_name, args: $args)
            }
        `;

        const args = [
            { key: "mode", value: { str: mode } },
            { key: "req_id", value: { str: reqId } }, // Sending the ID to Python
            ...Object.keys(payload).map(key => {
                const val = payload[key];
                const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
                return { key: key, value: { str: valStr } };
            })
        ];

        const variables = {
            plugin_id: PLUGIN_ID,
            task_name: TASK_NAME,
            args: args
        };

        try {
            console.log(`RD Plugin: Triggering task '${mode}' with ID ${reqId}...`);

            // Fire and forget (mostly) - we just need to know it started
            const response = await fetch('/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: mutation, variables: variables })
            });
            
            const json = await response.json();
            
            // If Stash returns an immediate error (like "Plugin not found"), catch it here.
            if (json.errors) {
                return { error: json.errors[0].message };
            }

            // Now we poll for the file that Python creates
            console.log("RD Plugin: Polling for response file...");
            return await waitForFile(reqId);

        } catch (e) {
            console.error("RD Plugin Network Error:", e);
            return { error: e.message };
        }
    }

    // --- 2. BUTTON LOGIC (Unchanged) ---
    async function handleButtonClick(sceneId) {
        const btn = document.getElementById(BUTTON_ID);
        const originalHtml = btn.innerHTML;
        
        const resetBtn = () => {
            btn.style.opacity = "1";
            btn.innerHTML = originalHtml;
        };

        btn.style.opacity = "0.7";
        btn.innerHTML = '<span class="fa fa-spinner fa-spin"></span> Checking...';

        const report = await runPluginTask("check", { scene_id: sceneId });

        if (report.error || !report.torrent_id) {
            alert("Scan Failed: " + (report.error || "Unknown Error"));
            resetBtn();
            return;
        }

        let confirmMsg = "";
        let scenesToDelete = [sceneId];

        if (report.is_pack) {
            const others = report.related_scenes;
            confirmMsg = `⚠️ PACK DETECTED ⚠️\n\nTorrent: ${report.torrent_name}\nFiles: ${report.video_file_count}\n`;
            if (others.length > 0) {
                confirmMsg += `\nAlso deleting ${others.length} other Stash scenes:\n`;
                others.forEach(s => confirmMsg += `- ${s.title}\n`);
                scenesToDelete = scenesToDelete.concat(others.map(s => s.id));
            } else {
                confirmMsg += `\n(No other Stash scenes found in this folder)\n`;
            }
            confirmMsg += `\nDelete ALL from Cloud & Stash?`;
        } else {
            confirmMsg = `Delete single file?\n\n${report.torrent_name}`;
        }

        if (!confirm(confirmMsg)) {
            resetBtn();
            return;
        }

        btn.innerHTML = '<span class="fa fa-spinner fa-spin"></span> Deleting...';
        const result = await runPluginTask("delete", {
            torrent_id: report.torrent_id,
            scene_ids: scenesToDelete
        });

        if (result.error) {
            alert("Delete Failed: " + result.error);
            btn.innerHTML = '<span class="fa fa-exclamation-triangle"></span> Error';
        } else {
            alert(`🗑️ Success! Deleted ${result.deleted_scenes} scenes.`);
            btn.remove(); 
        }
    }

    // --- 3. INJECTOR (Unchanged) ---
    setInterval(() => {
        const path = window.location.pathname;
        const match = path.match(/\/scenes\/(\d+)$/);
        if (!match) return;
        const sceneId = match[1];

        const existingBtn = document.getElementById(BUTTON_ID);
        if (existingBtn) {
            if (existingBtn.dataset.sceneId !== sceneId) existingBtn.remove();
            else return;
        }

        const toolbar = document.querySelector('.scene-toolbar-group') || 
                        document.querySelector('.ml-auto') ||
                        document.querySelector('.SceneHeader-toolbar');

        if (toolbar) {
            const btn = document.createElement('button');
            btn.id = BUTTON_ID;
            btn.dataset.sceneId = sceneId;
            btn.className = "btn btn-danger";
            btn.title = "Delete from RealDebrid & Stash";
            btn.style.marginLeft = "10px";
            btn.onclick = () => handleButtonClick(sceneId);
            btn.innerHTML = '<span class="fa fa-trash"></span> Cloud Delete';
            toolbar.insertBefore(btn, toolbar.firstChild);
        }
    }, 500);

})();