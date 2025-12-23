console.log("RD Plugin: Script Loaded (Icon UI Mode)");

(function () {
    'use strict';

    const PLUGIN_ID = "realDebridDeleter";
    const TASK_NAME = "Delete From Cloud";
    const BUTTON_ID = "rd-delete-plugin-btn";

    // --- 1. NETWORK HELPER (Log Scraper) ---
    
    function generateReqId() {
        return Math.floor(Math.random() * 100000).toString();
    }

    async function getLatestLogs() {
        const query = `
            query {
                logs {
                    message
                }
            }
        `;
        try {
            const response = await fetch('/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query })
            });
            const json = await response.json();
            return json.data.logs || [];
        } catch (e) {
            console.error("RD Plugin: Log Fetch Error", e);
            return [];
        }
    }

    async function waitForLogResponse(reqId, maxAttempts = 30) {
        const tag = `###RD_RES_${reqId}###`;
        console.log(`RD Plugin: Scanning logs for tag: ${tag}`);

        for (let i = 0; i < maxAttempts; i++) {
            const logs = await getLatestLogs();
            
            for (const logEntry of logs) {
                const msg = logEntry.message || "";
                if (msg.includes(tag)) {
                    const parts = msg.split(tag);
                    if (parts.length >= 3) {
                        try {
                            const jsonData = JSON.parse(parts[1]);
                            console.log("RD Plugin: Log payload found!", jsonData);
                            return jsonData;
                        } catch (e) {
                            console.error("RD Plugin: Failed to parse JSON from log", e);
                        }
                    }
                }
            }
            await new Promise(r => setTimeout(r, 1000));
        }
        return { error: "Timeout: Plugin finished but no result found in logs." };
    }

    async function runPluginTask(mode, payload) {
        const reqId = generateReqId();
        
        const mutation = `
            mutation RunTask($plugin_id: ID!, $task_name: String!, $args: [PluginArgInput!]) {
                runPluginTask(plugin_id: $plugin_id, task_name: $task_name, args: $args)
            }
        `;

        const args = [
            { key: "mode", value: { str: mode } },
            { key: "req_id", value: { str: reqId } },
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
            fetch('/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: mutation, variables: variables })
            }).catch(e => console.error("RD Plugin Task Trigger Error:", e));

            return await waitForLogResponse(reqId);

        } catch (e) {
            console.error("RD Plugin Network Error:", e);
            return { error: e.message };
        }
    }

    // --- 2. BUTTON LOGIC ---
    async function handleButtonClick(sceneId) {
        const btn = document.getElementById(BUTTON_ID);
        // Save original icon to restore later
        const originalContent = '<span class="fa fa-trash"></span>';
        
        const resetBtn = () => {
            btn.classList.remove('fa-spin'); // stop spinning if valid
            btn.innerHTML = originalContent;
            btn.style.opacity = "1";
        };

        // Loading State: Replace trash icon with spinner
        btn.innerHTML = '<span class="fa fa-spinner fa-spin"></span>';
        btn.style.opacity = "0.7";

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

        // Deleting State
        btn.innerHTML = '<span class="fa fa-circle-notch fa-spin"></span>';
        
        const result = await runPluginTask("delete", {
            torrent_id: report.torrent_id,
            scene_ids: scenesToDelete
        });

        if (result.error) {
            alert("Delete Failed: " + result.error);
            btn.innerHTML = '<span class="fa fa-exclamation-triangle" style="color:red"></span>';
        } else {
            alert(`🗑️ Success! Deleted ${result.deleted_scenes} scenes.`);
            btn.remove(); 
        }
    }

    // --- 3. INJECTOR (Updated UI) ---
    setInterval(() => {
        const path = window.location.pathname;
        const match = path.match(/\/scenes\/(\d+)$/);
        if (!match) return;
        const sceneId = match[1];

        // Avoid dupes
        const existingBtn = document.getElementById(BUTTON_ID);
        if (existingBtn) {
            if (existingBtn.dataset.sceneId !== sceneId) existingBtn.remove();
            else return;
        }

        // FIND TARGET: "Play Count" (Eye Icon)
        // We look for the button with title="Play Count"
        const playCountBtn = document.querySelector('button[title="Play Count"]');
        let targetLocation = null;
        let insertMode = 'append';

        if (playCountBtn) {
            // Found the eye. Its parent is usually a div or span group. 
            // We want to insert BEFORE that group so we are to the left of the eye.
            const wrapper = playCountBtn.closest('span'); // The span wrapping the play count group
            if (wrapper) {
                targetLocation = wrapper;
                insertMode = 'before';
            }
        }

        // Fallback: If no eye icon found, put it at start of toolbar
        if (!targetLocation) {
            const toolbar = document.querySelector('.scene-toolbar-group') || 
                            document.querySelector('.ml-auto') ||
                            document.querySelector('.SceneHeader-toolbar');
            targetLocation = toolbar;
            insertMode = 'prepend';
        }

        if (targetLocation) {
            const btn = document.createElement('button');
            btn.id = BUTTON_ID;
            btn.dataset.sceneId = sceneId;
            
            // STYLE: Native Stash Icon Look
            btn.className = "minimal btn btn-secondary"; 
            btn.title = "Delete from RealDebrid & Stash";
            btn.style.marginRight = "4px"; // Tiny gap between trash and eye
            
            btn.onclick = () => handleButtonClick(sceneId);
            
            // ICON ONLY (No Text)
            btn.innerHTML = '<span class="fa fa-trash"></span>';
            
            if (insertMode === 'before') {
                targetLocation.parentElement.insertBefore(btn, targetLocation);
            } else if (insertMode === 'prepend') {
                targetLocation.insertBefore(btn, targetLocation.firstChild);
            } else {
                targetLocation.appendChild(btn);
            }
        }
    }, 500);

})();