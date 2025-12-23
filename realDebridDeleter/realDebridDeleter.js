(function () {
    'use strict';

    const { React, patcher } = window.PluginApi;

    // 1. Define the Button Component
    const DeleteButton = ({ sceneId }) => {
        const handleDelete = async () => {
            if (!confirm("Are you sure you want to delete this from Stash AND RealDebrid?")) return;

            try {
                // Trigger the Python Task defined in YAML
                await window.PluginApi.runTask(
                    "realDebridDeleter", 
                    "Delete From Cloud", 
                    { "scene_id": sceneId } // Pass scene_id as input to Python
                );
                alert("Deletion started. Check logs for details.");
            } catch (err) {
                console.error(err);
                alert("Error starting delete task: " + err);
            }
        };

        return React.createElement(
            "button",
            {
                className: "btn btn-danger",
                onClick: handleDelete,
                style: { marginLeft: "10px" },
                title: "Delete from RealDebrid & Stash"
            },
            React.createElement("span", { className: "fa fa-trash" }),
            " Cloud Delete"
        );
    };

    // 2. Hook into the Scene Page Toolbar to inject our button
    patcher.after("SceneToolbar", function (components, props) {
        if (!props.scene || !props.scene.id) return;
        
        // Add our button to the toolbar list
        components.push(
            React.createElement(DeleteButton, { sceneId: props.scene.id })
        );
    });

})();