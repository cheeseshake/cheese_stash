console.log("RD Plugin: Script Loaded (Error Channel Mode)");

(function () {
    'use strict';

    const PLUGIN_ID = "realDebridDeleter";
    const TASK_NAME = "Delete From Cloud";
    const BUTTON_ID = "rd-delete-plugin-btn";

// --- 1. NETWORK HELPER (Updated to use executePluginTask) ---
    async function runPluginTask(mode, payload) {
        // We use executePluginTask to get the direct output/error back
        const mutation = `
            mutation ExecutePluginTask($plugin_id: ID!, $task_name: String!, $args: [PluginArgInput!]) {
                executePluginTask(plugin_id: $plugin_id, task_name: $task_name, args: $args) {
                    result
                }
            }
        `;

        const args = [
            { key: "mode", value: { str: mode } },
            ...Object.keys(payload).map(key => {
                const val = payload[key];
                const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
                return { key: key, value: { str: valStr } };
            })
        ];

        try {
            console.log(`RD Plugin: Executing task '${mode}'...`);

            const response = await fetch('/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    query: mutation, 
                    variables: { plugin_id: PLUGIN_ID, task_name: TASK_NAME, args: args } 
                })
            });

            const json = await response.json();
            
            // Stash returns the stderr output inside json.errors if sys.exit(1) was used
            let textToScan = "";

            if (json.errors && json.errors.length > 0) {
                textToScan = json.errors[0].message;
            } else if (json.data && json.data.executePluginTask) {
                textToScan = json.data.executePluginTask.result || "";
            }

            const regex = /###JSON_START###([\s\S]*?)###JSON_END###/;
            const match = textToScan.match(regex);

            if (match && match[1]) {
                return JSON.parse(match[1]);
            } else {
                console.error("RD Plugin: No JSON markers found. Raw Text:", textToScan);
                return { error: "Could not parse response. See Stash logs." };
            }

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