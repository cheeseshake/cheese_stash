(function () {
    'use strict';

    const PLUGIN_ID = "realDebridDeleter";
    const BUTTON_ID = "rd-delete-btn";

    // Wait for the correct API tools (React + patch)
    const waitForApi = () => {
        if (!window.PluginApi || !window.PluginApi.React || !window.PluginApi.patch) {
            setTimeout(waitForApi, 200);
            return;
        }
        init();
    };

    const init = () => {
        // NOTE: We now pull 'patch' instead of 'patcher'
        const { React, patch, runTask } = window.PluginApi;
        console.log(`${PLUGIN_ID}: API Ready. Patching interface...`);

        // 1. Define the Button Component
        const DeleteButton = ({ sceneId }) => {
            const handleDelete = async () => {
                if (!confirm("Are you sure you want to delete this from Stash AND RealDebrid?")) return;

                try {
                    console.log(`${PLUGIN_ID}: Triggering delete for Scene ${sceneId}`);
                    
                    // Trigger the Python Task
                    await runTask(PLUGIN_ID, "Delete From Cloud", { "scene_id": sceneId });
                    
                    alert("Delete command sent successfully.");
                } catch (err) {
                    console.error(`${PLUGIN_ID} Error:`, err);
                    alert("Error starting delete task: " + err);
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

        // 2. Patch the Interface
        // We look for 'SceneToolbar' which is the standard button area
        try {
            patch.after("SceneToolbar", function (components, props) {
                if (!props.scene || !props.scene.id) return;
                
                // Prevent duplicates
                if (components.some(c => c && c.key === BUTTON_ID)) return;

                components.push(
                    React.createElement(DeleteButton, { sceneId: props.scene.id })
                );
            });
            console.log(`${PLUGIN_ID}: Successfully patched SceneToolbar.`);
        } catch (e) {
            console.error(`${PLUGIN_ID}: Failed to patch toolbar`, e);
        }
    };

    waitForApi();
})();