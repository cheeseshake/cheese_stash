(function () {
    'use strict';

    const PLUGIN_ID = "realDebridDeleter";
    const TASK_NAME = "Delete From Cloud";
    const BUTTON_ID = "rd-delete-plugin-btn";

    // 1. Wait for Stash API
    const waitForApi = () => {
        if (!window.PluginApi || !window.PluginApi.React || !window.PluginApi.patch) {
            setTimeout(waitForApi, 200);
            return;
        }
        init();
    };

    const init = () => {
        const { React, patch, runTask } = window.PluginApi;

        // 2. Helper to run Python and parse "Sandwich" JSON
        const runPythonTask = async (mode, payload) => {
            try {
                // Stash expects args as string values
                const args = {
                    "mode": mode,
                    ...Object.keys(payload).reduce((acc, key) => {
                        const val = payload[key];
                        acc[key] = typeof val === 'object' ? JSON.stringify(val) : String(val);
                        return acc;
                    }, {})
                };

                // Run the task via Stash Internal API
                const result = await runTask(PLUGIN_ID, TASK_NAME, args);

                // Check for markers in the output string
                const regex = /###JSON_START###([\s\S]*?)###JSON_END###/;
                const match = result.match(regex);

                if (match && match[1]) {
                    return JSON.parse(match[1]);
                } else {
                    console.error("RD Plugin: No JSON markers found.", result);
                    return { error: "Invalid output from plugin. Check Stash logs." };
                }
            } catch (e) {
                console.error("RD Plugin Error:", e);
                return { error: e.message };
            }
        };

        // 3. The Button Component
        const DeleteButton = ({ sceneId }) => {
            const [loading, setLoading] = React.useState(false);
            const [statusText, setStatusText] = React.useState("Cloud Delete");

            const handleClick = async () => {
                setLoading(true);
                setStatusText("Checking...");

                // STEP 1: CHECK
                const report = await runPythonTask("check", { scene_id: sceneId });

                if (report.error || !report.torrent_id) {
                    alert("Scan Failed: " + (report.error || "Unknown Error"));
                    setLoading(false);
                    setStatusText("Cloud Delete");
                    return;
                }

                // STEP 2: USER CONFIRMATION
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
                    setLoading(false);
                    setStatusText("Cloud Delete");
                    return;
                }

                // STEP 3: EXECUTE
                setStatusText("Deleting...");
                const result = await runPythonTask("delete", {
                    torrent_id: report.torrent_id,
                    scene_ids: scenesToDelete
                });

                if (result.error) {
                    alert("Delete Failed: " + result.error);
                    setStatusText("Error");
                } else {
                    alert(`🗑️ Success! Deleted ${result.deleted_scenes} scenes.`);
                    // Ideally we would redirect or refresh here, but we'll just disable the button
                    setStatusText("Deleted");
                }
                setLoading(false);
            };

            return React.createElement(
                "button",
                {
                    key: BUTTON_ID,
                    className: "btn btn-danger",
                    onClick: handleClick,
                    disabled: loading || statusText === "Deleted",
                    style: { marginLeft: "10px" },
                    title: "Delete from RealDebrid & Stash"
                },
                React.createElement("span", { className: loading ? "fa fa-spinner fa-spin" : "fa fa-trash" }),
                " ",
                statusText
            );
        };

        // 4. Inject Button
        patch.after("SceneToolbar", function (components, props) {
            if (!props.scene || !props.scene.id) return;
            if (components.some(c => c && c.key === BUTTON_ID)) return;

            components.push(
                React.createElement(DeleteButton, { sceneId: props.scene.id })
            );
        });
        
        // Backup injection for other skins/layouts
        patch.after("SceneHeader", function (components, props) {
            if (!props.scene || !props.scene.id) return;
            if (components.some(c => c && c.key === BUTTON_ID)) return;
            components.push(React.createElement(DeleteButton, { sceneId: props.scene.id }));
        });
    };

    waitForApi();
})();