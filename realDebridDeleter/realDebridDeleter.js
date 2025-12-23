(function () {
    'use strict';

    const PLUGIN_ID = "realDebridDeleter";
    const BUTTON_ID = "rd-delete-btn";

    // Wait for PluginApi to be ready
    const waitForApi = () => {
        if (!window.PluginApi || !window.PluginApi.React || !window.PluginApi.patcher) {
            setTimeout(waitForApi, 200);
            return;
        }
        init();
    };

    const init = () => {
        const { React, patcher } = window.PluginApi;
        console.log(`${PLUGIN_ID}: Plugin loaded. Patching interface...`);

        // 1. Define the Button
        const DeleteButton = ({ sceneId }) => {
            const handleDelete = async () => {
                if (!confirm("Are you sure you want to delete this from Stash AND RealDebrid?")) return;

                console.log(`${PLUGIN_ID}: Triggering delete task for Scene ${sceneId}`);
                
                try {
                    // Trigger the Python Task defined in YAML
                    await window.PluginApi.runTask(
                        PLUGIN_ID, 
                        "Delete From Cloud", 
                        { "scene_id": sceneId }
                    );
                    alert("Deletion command sent! Check Stash logs/history.");
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
                React.createElement("span", { className: "fa fa-trash" }),
                " Cloud Delete"
            );
        };

        // 2. Patch the Toolbar
        // We try "SceneToolbar" (Standard) and "SceneHeader" (Older/Alternative) just in case.
        const patchToolbar = (componentName) => {
            try {
                patcher.after(componentName, function (components, props) {
                    if (!props.scene || !props.scene.id) return;

                    // Prevent duplicate buttons
                    if (components.some(c => c && c.key === BUTTON_ID)) return;

                    components.push(
                        React.createElement(DeleteButton, { sceneId: props.scene.id })
                    );
                });
                console.log(`${PLUGIN_ID}: Patched ${componentName} successfully.`);
            } catch (e) {
                console.error(`${PLUGIN_ID}: Failed to patch ${componentName}`, e);
            }
        };

        // Try to patch the standard locations
        patchToolbar("SceneToolbar");
    };

    // Start waiting
    waitForApi();
})();