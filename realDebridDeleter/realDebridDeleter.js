console.log("RD Plugin: Script Loaded (SVG Icon Mode)");

(function () {
    'use strict';

    const PLUGIN_ID = "realDebridDeleter";
    const TASK_NAME = "Delete From Cloud";
    const BUTTON_ID = "rd-delete-plugin-btn";

    // --- ICONS (Raw SVG to ensure visibility) ---
    // Note: We use class="svg-inline--fa" and fill="currentColor" to match Stash styling
    const ICON_TRASH = `
        <svg aria-hidden="true" focusable="false" data-prefix="fas" data-icon="trash" class="svg-inline--fa fa-trash fa-icon" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512">
            <path fill="currentColor" d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 46.3-19.7 47.9-45L416 128z"></path>
        </svg>`;

    const ICON_SPINNER = `
        <svg aria-hidden="true" focusable="false" data-prefix="fas" data-icon="spinner" class="svg-inline--fa fa-spinner fa-spin fa-icon" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
            <path fill="currentColor" d="M304 48c0 26.51-21.49 48-48 48s-48-21.49-48-48 21.49-48 48-48 48 21.49 48 48zm-48 368c-26.51 0-48 21.49-48 48s21.49 48 48 48 48-21.49 48-48-21.49-48-48-48zm208-208c-26.51 0-48 21.49-48 48s21.49 48 48 48 48-21.49 48-48-21.49-48-48-48zM96 256c0-26.51-21.49-48-48-48S0 229.49 0 256s21.49 48 48 48 48-21.49 48-48zm12.922 99.078c-26.51 0-48 21.49-48 48s21.49 48 48 48 48-21.49 48-48c0-26.51-21.49-48-48-48zm294.156 0c-26.51 0-48 21.49-48 48s21.49 48 48 48 48-21.49 48-48c0-26.51-21.49-48-48-48zM108.922 60.922c-26.51 0-48 21.49-48 48s21.49 48 48 48 48-21.49 48-48-21.49-48-48-48z"></path>
        </svg>`;

    const ICON_ERROR = `
        <svg aria-hidden="true" focusable="false" data-prefix="fas" data-icon="exclamation-triangle" class="svg-inline--fa fa-exclamation-triangle fa-icon" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512">
            <path fill="red" d="M569.517 440.013C587.975 472.007 564.806 512 527.94 512H48.054c-36.937 0-59.999-40.055-41.577-71.987L246.423 23.985c18.467-32.009 64.72-31.951 83.154 0l239.94 416.028zM288 354c-25.405 0-46 20.595-46 46s20.595 46 46 46 46-20.595 46-46-20.595-46-46-46zm-43.673-165.346l7.418 136c.347 6.364 5.609 11.346 11.982 11.346h48.546c6.373 0 11.635-4.982 11.982-11.346l7.418-136c.375-6.874-5.098-12.654-11.982-12.654h-63.383c-6.884 0-12.356 5.78-11.981 12.654z"></path>
        </svg>`;

    // --- 1. NETWORK HELPER (Log Scraper) ---
    function generateReqId() {
        return Math.floor(Math.random() * 100000).toString();
    }

    async function getLatestLogs() {
        const query = `query { logs { message } }`;
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
        const variables = { plugin_id: PLUGIN_ID, task_name: TASK_NAME, args: args };

        try {
            console.log(`RD Plugin: Triggering task '${mode}' with ID ${reqId}...`);
            fetch('/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: mutation, variables: variables })
            }).catch(e => console.error("RD Plugin Task Trigger Error:", e));

            return await waitForLogResponse(reqId);
        } catch (e) {
            return { error: e.message };
        }
    }

    // --- 2. BUTTON LOGIC ---
    async function handleButtonClick(sceneId) {
        const btn = document.getElementById(BUTTON_ID);
        
        const resetBtn = () => {
            btn.innerHTML = ICON_TRASH;
            btn.style.opacity = "1";
        };

        // Loading State
        btn.innerHTML = ICON_SPINNER;
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
        btn.innerHTML = ICON_SPINNER;
        
        const result = await runPluginTask("delete", {
            torrent_id: report.torrent_id,
            scene_ids: scenesToDelete
        });

        if (result.error) {
            alert("Delete Failed: " + result.error);
            btn.innerHTML = ICON_ERROR;
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

        // TARGET: The "Play Count" (Eye) button
        const playCountBtn = document.querySelector('button[title="Play Count"]');
        let targetLocation = null;
        let insertMode = 'append';

        if (playCountBtn) {
            // Found the eye. Its parent is usually a span group. 
            const wrapper = playCountBtn.closest('span'); 
            if (wrapper) {
                targetLocation = wrapper;
                insertMode = 'before';
            }
        }

        // Fallback: Start of toolbar
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
            
            // STYLE: Native minimal look
            btn.className = "minimal btn btn-secondary"; 
            btn.title = "Delete from RealDebrid & Stash";
            btn.style.marginRight = "4px"; 
            
            btn.onclick = () => handleButtonClick(sceneId);
            
            // Inject SVG directly
            btn.innerHTML = ICON_TRASH;
            
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