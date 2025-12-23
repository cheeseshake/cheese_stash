console.log("RD DEBUG: Inspection script loaded.");

(function () {
    'use strict';
    
    const waitForApi = () => {
        if (!window.PluginApi) {
            console.log("RD DEBUG: Waiting for PluginApi...");
            setTimeout(waitForApi, 500);
            return;
        }

        // 1. Force dump the entire object to the console
        console.log("============== STASH API DUMP ==============");
        console.log("Keys available in window.PluginApi:", Object.keys(window.PluginApi));
        console.log("Full Object:", window.PluginApi);
        console.log("============================================");

        // 2. Try to find patcher or hooks
        const api = window.PluginApi;
        
        if (api.patcher) {
            console.log("SUCCESS: Patcher found directly!");
        } else if (api.utils && api.utils.patcher) {
            console.log("FOUND: Patcher is hidden inside 'utils'!");
        } else if (api.hooks) {
            console.log("ALTERNATIVE: 'hooks' found (Newer API style).");
        } else {
            console.error("FAILURE: Patcher is completely missing.");
        }
    };

    waitForApi();
})();