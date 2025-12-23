console.log("RD Plugin: Script Loaded (Fetch Mode)");

(function () {
    'use strict';

    const PLUGIN_ID = "realDebridDeleter";
    const TASK_NAME = "Delete From Cloud";
    const BUTTON_ID = "rd-delete-plugin-btn";

    // --- 1. NETWORK HELPER (Fetch Mode) ---
    async function runPluginTask(mode, payload) {
        // We construct the GraphQL query manually, which is guaranteed to work
        const mutation = `
            mutation RunTask($plugin_id: ID!, $task_name: String!, $args: [PluginArgInput!]) {
                runPluginTask(plugin_id: $plugin_id, task_name: $task_name, args: $args)
            }
        `;

        // Format arguments for Stash (everything must be a string)
        const args = [
            { key: "mode", value: { str: mode } },
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
            console.log(`RD Plugin: Sending task '${mode}'...`, variables);

            const response = await fetch('/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: mutation, variables: variables })
            });

            const json = await response.json();

            if (json.errors) {
                console.error("RD Plugin GraphQL Error:", json.errors);
                return { error: json.errors[0].message };
            }

            const resultString = json.data.runPluginTask;

            // Parse the Sandwich: ###JSON_START### ... ###JSON_END###
            const regex = /###JSON_START###([\s\S]*?)###JSON_END###/;
            const match = resultString.match(regex);

            if (match && match[1]) {
                return JSON.parse(match[1]);
            } else {
                console.warn("RD Plugin: No JSON markers found in output:", resultString);
                // Fallback: try parsing raw string in case logging was disabled
                try { return JSON.parse(resultString); } catch(e) {}
                return { error: "Invalid output from backend. Check Stash Logs." };
            }
        } catch (e) {
            console.error("RD Plugin Network Error:", e);
            return { error: e.message };
        }
    }

    // --- 2. BUTTON LOGIC ---
    async function handleButtonClick(sceneId) {
        const btn = document.getElementById(BUTTON_ID);
        const originalHtml = btn.innerHTML;
        
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
            btn.remove(); 
        }
    }

    // --- 3. INJECTOR ---
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