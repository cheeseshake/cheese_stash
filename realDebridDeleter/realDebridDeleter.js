console.log("RD DELETER: Script loaded. Starting initialization check...");

(function () {
    'use strict';

    const PLUGIN_ID = "realDebridDeleter";
    const BUTTON_ID = "rd-delete-btn";
    let attempts = 0;

    const waitForApi = () => {
        // 1. Check if the main API object exists
        if (!window.PluginApi) {
            if (attempts % 10 === 0) console.log(`RD DELETER: window.PluginApi is missing (Attempt ${attempts})`);
            attempts++;
            setTimeout(waitForApi, 500);
            return;
        }

        // 2. Check if the libraries we need exist inside it
        const missing = [];
        if (!window.PluginApi.React) missing.push("React");
        if (!window.PluginApi.patcher) missing.push("patcher");

        if (missing.length > 0) {
            if (attempts % 10 === 0) console.log(`RD DELETER: PluginApi found, but missing: ${missing.join(", ")}`);
            attempts++;
            setTimeout(waitForApi, 500);
            return;
        }

        // 3. Success!
        console.log(`RD DELETER: API Fully Ready after ${attempts} attempts. Initializing...`);
        init();
    };

    const init = () => {
        const { React, patcher, runTask } = window.PluginApi;

        const DeleteButton = ({ sceneId }) => {
            const handleDelete = async () => {
                if (!confirm("Are you sure? This will delete the files from RealDebrid AND Stash.")) return;

                console.log(`${PLUGIN_ID}: Triggering delete for Scene ${sceneId}`);
                try {
                    // We use 'realDebridDeleter' as the pluginId (must match YAML 'exec' or folder name)
                    // We use 'Delete From Cloud' as the task name (must match YAML 'tasks' name)
                    await runTask(PLUGIN_ID, "Delete From Cloud", { "scene_id": sceneId });
                    alert("Delete command sent. Check server logs.");
                } catch (err) {
                    console.error(`${PLUGIN_ID} Error:`, err);
                    alert("Error: " + err);
                }
            };

            return React.createElement(
                "button",
                {
                    key: BUTTON_ID,
                    className: "btn btn-danger",
                    onClick: handleDelete,
                    style: { marginLeft: "10px" },
                    title: "Delete from RealDebrid & Stash"
                },
                "Cloud Delete"
            );
        };

        // Try to patch common header components
        const targets = ["SceneToolbar", "SceneHeader", "SceneDetailsHeader"];
        let patched = false;

        targets.forEach(target => {
            try {
                patcher.after(target, function (components, props) {
                    if (!props.scene || !props.scene.id) return;
                    
                    // Avoid duplicates
                    if (components.some(c => c && c.key === BUTTON_ID)) return;

                    components.push(React.createElement(DeleteButton, { sceneId: props.scene.id }));
                    patched = true;
                });
            } catch (e) {
                // Squelch errors for missing components
            }
        });

        if (patched) {
            console.log(`${PLUGIN_ID}: Successfully patched Scene interface.`);
        } else {
            console.warn(`${PLUGIN_ID}: Could not find any valid Toolbar to patch. Button will not appear.`);
            console.log("Available Components in Patcher:", patcher);
        }
    };

    waitForApi();
})();