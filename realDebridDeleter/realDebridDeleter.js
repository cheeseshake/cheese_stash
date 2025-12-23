console.log("RD Plugin: Script Loaded");

(function () {
    'use strict';

    const PLUGIN_ID = "realDebridDeleter";
    const TASK_NAME = "Delete From Cloud";
    const BUTTON_ID = "rd-delete-plugin-btn";

    // --- 1. NETWORK HELPER (Handles the Sandwich JSON) ---
    async function runPluginTask(mode, payload) {
        if (!window.PluginApi) {
            console.error("RD Plugin: PluginApi not ready");
            return { error: "Stash API not ready" };
        }
        
        const { runTask } = window.PluginApi;

        try {
            // Prepare arguments
            const args = {
                "mode": mode,
                ...Object.keys(payload).reduce((acc, key) => {
                    const val = payload[key];
                    // Python expects strings for all args
                    acc[key] = typeof val === 'object' ? JSON.stringify(val) : String(val);
                    return acc;
                }, {})
            };

            console.log(`RD Plugin: Sending task '${mode}'...`, args);
            
            // Run the task
            const resultString = await runTask(PLUGIN_ID, TASK_NAME, args);

            // Parse the Sandwich: ###JSON_START### ... ###JSON_END###
            const regex = /###JSON_START###([\s\S]*?)###JSON_END###/;
            const match = resultString.match(regex);

            if (match && match[1]) {
                return JSON.parse(match[1]);
            } else {
                console.warn("RD Plugin: No JSON markers found in output:", resultString);
                return { error: "Invalid output from backend. Check Stash Logs." };
            }
        } catch (e) {
            console.error("RD Plugin Error:", e);
            return { error: e.message };
        }
    }

    // --- 2. BUTTON LOGIC ---
    async function handleButtonClick(sceneId) {
        const btn = document.getElementById(BUTTON_ID);
        const originalHtml = btn.innerHTML;
        
        // Helper to reset button state
        const resetBtn = () => {
            btn.style.opacity = "1";
            btn.innerHTML = originalHtml;
        };

        btn.style.opacity = "0.7";
        btn.innerHTML = '<span class="fa fa-spinner fa-spin"></span> Checking...';

        // STEP 1: CHECK
        const report = await runPluginTask("check", { scene_id: sceneId });

        if (report.error || !report.torrent_id) {
            alert("Scan Failed: " + (report.error || "Unknown Error"));
            resetBtn();
            return;
        }

        // STEP 2: CONFIRM
        let confirmMsg = "";
        let scenesToDelete = [sceneId];

        if (report.is_pack) {
            const others = report.related_scenes;
            confirmMsg = `⚠️ PACK DETECTED ⚠️\n\n`;
            confirmMsg += `Torrent: ${report.torrent_name}\n`;
            confirmMsg += `Contains ${report.video_file_count} video files.\n`;

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

        // STEP 3: EXECUTE
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
            btn.remove(); // Remove button to indicate success
        }
    }

    // --- 3. INJECTOR (The Reliable Brute Force Method) ---
    // We check every 500ms if the button is missing and inject it.
    setInterval(() => {
        // A. Check if we are on a scene page
        const path = window.location.pathname;
        const match = path.match(/\/scenes\/(\d+)$/);
        if (!match) return;
        const sceneId = match[1];

        // B. Check if button exists
        const existingBtn = document.getElementById(BUTTON_ID);
        if (existingBtn) {
            // Ensure it matches current scene (navigation handling)
            if (existingBtn.dataset.sceneId !== sceneId) {
                existingBtn.remove();
            } else {
                return; // All good, do nothing
            }
        }

        // C. Find a home for the button
        // We look for standard toolbar classes
        const toolbar = document.querySelector('.scene-toolbar-group') || 
                        document.querySelector('.ml-auto') ||
                        document.querySelector('.SceneHeader-toolbar'); // Newer stash themes

        if (toolbar) {
            console.log("RD Plugin: Injecting Button for Scene", sceneId);
            
            const btn = document.createElement('button');
            btn.id = BUTTON_ID;
            btn.dataset.sceneId = sceneId;
            btn.className = "btn btn-danger";
            btn.title = "Delete from RealDebrid & Stash";
            btn.style.marginLeft = "10px";
            btn.onclick = () => handleButtonClick(sceneId);
            btn.innerHTML = '<span class="fa fa-trash"></span> Cloud Delete';

            // Insert at the beginning of the toolbar
            toolbar.insertBefore(btn, toolbar.firstChild);
        }
    }, 500);

})();