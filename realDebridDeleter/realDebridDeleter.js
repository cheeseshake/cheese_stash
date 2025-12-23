console.log("RD DELETER: Script file has been loaded by the browser!");

(function () {
    'use strict';
    
    const PLUGIN_ID = "realDebridDeleter";
    
    // Retry loop to ensure Stash is ready
    const waitForApi = () => {
        if (!window.PluginApi || !window.PluginApi.React || !window.PluginApi.patcher) {
            console.log("RD DELETER: Waiting for PluginApi...");
            setTimeout(waitForApi, 500);
            return;
        }
        init();
    };

    const init = () => {
        const { React, patcher } = window.PluginApi;
        console.log(`RD DELETER: API Ready. initializing...`);

        const DeleteButton = ({ sceneId }) => {
            const handleDelete = async () => {
                if (!confirm("PERMANENTLY DELETE from Stash and RealDebrid?")) return;
                
                try {
                    console.log(`RD DELETER: Sending Delete Task for ${sceneId}`);
                    await window.PluginApi.runTask(PLUGIN_ID, "Delete From Cloud", { "scene_id": sceneId });
                    alert("Delete command sent. Check Server Logs for success message.");
                } catch (err) {
                    console.error("RD DELETER Error:", err);
                    alert("Error: " + err);
                }
            };

            return React.createElement(
                "button",
                {
                    className: "btn btn-danger",
                    onClick: handleDelete,
                    title: "Delete from Cloud",
                    style: { marginLeft: "10px" }
                },
                "Cloud Delete"
            );
        };

        // Patch BOTH common toolbar locations to be safe
        const patchTargets = ["SceneToolbar", "SceneHeader", "SceneDetailsHeader"];
        
        patchTargets.forEach(target => {
            try {
                patcher.after(target, function (components, props) {
                    if (!props.scene || !props.scene.id) return;
                    components.push(React.createElement(DeleteButton, { sceneId: props.scene.id }));
                });
                console.log(`RD DELETER: Patched ${target}`);
            } catch (e) {
                // Ignore errors for targets that don't exist
            }
        });
    };

    waitForApi();
})();