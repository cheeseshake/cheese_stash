console.log("Bunkr Direct: Plugin Loaded");

(function () {
    'use strict';

    const PLUGIN_ID = "bunkrDirect";
    const ALLOWED_DOMAINS = ['bunkr.cr', 'bunkr.ru', 'bunkr.is', 'bunkr.site', 'bunkr.sk', 'bunkr.se', 'bunkr.si'];

    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const el = document.querySelector(selector);
            if (el) { resolve(el); return; }
            const observer = new MutationObserver((mutations, obs) => {
                const el = document.querySelector(selector);
                if (el) { obs.disconnect(); resolve(el); }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => { observer.disconnect(); reject(new Error(`Timeout waiting for ${selector}`)); }, timeout);
        });
    }

    function getBunkrId(url) {
        try {
            const u = new URL(url);
            if (!ALLOWED_DOMAINS.some(d => u.hostname.includes(d))) return null;
            const path = u.pathname;
            const parts = path.split('/').filter(p => p);
            return parts.length > 0 ? parts[parts.length - 1] : null;
        } catch (e) { }
        return null;
    }

    async function scrapeBunkr(embedUrl) {
        const query = `
            mutation RunTask($plugin_id: ID!, $task_name: String!, $args: [PluginArgInput!]) {
                runPluginTask(plugin_id: $plugin_id, task_name: $task_name, args: $args)
            }
        `;
        
        const variables = {
            plugin_id: PLUGIN_ID,
            task_name: "ScrapeBunkr",
            args: [{ key: "url", value: { str: embedUrl } }]
        };

        try {
            const res = await fetch('/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, variables })
            });
            const json = await res.json();
            const resultStr = json.data?.runPluginTask;
            if (!resultStr) return null;

            const result = JSON.parse(resultStr);
            return result.mp4 || null;

        } catch (e) {
            console.error("Bunkr Plugin: Task Error", e);
            return null;
        }
    }

    async function checkAndEmbed() {
        const match = window.location.pathname.match(/\/scenes\/(\d+)$/);
        if (!match) return;
        const sceneId = match[1];

        let playerContainer;
        try {
            playerContainer = await waitForElement('.ScenePlayer-video-container, .ScenePlayer-container, .VideoPlayer');
        } catch (e) { return; }

        if (document.getElementById('bunkr-direct-player')) return;

        const query = `query FindSceneData($id: ID!) { findScene(id: $id) { urls files { id } } }`;
        const res = await fetch('/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query, variables: { id: sceneId } })
        });
        const json = await res.json();
        const data = json.data?.findScene;

        if (data.files && data.files.length > 0) return; 

        const urls = data.urls || [];
        let validId = null;
        let validDomain = null;
        
        for (const url of urls) {
            const id = getBunkrId(url);
            if (id) {
                validId = id;
                validDomain = new URL(url).hostname;
                break;
            }
        }

        if (!validId) return;

        console.log(`Bunkr Plugin: Found ID ${validId}. Scraping via backend...`);
        const embedUrl = `https://${validDomain}/e/${validId}`;
        const mp4Url = await scrapeBunkr(embedUrl);

        if (!mp4Url) {
            console.error("Bunkr Plugin: Failed to extract MP4.");
            return;
        }

        console.log("Bunkr Plugin: MP4 Found. Injecting player.");

        playerContainer.innerHTML = '';
        const video = document.createElement('video');
        video.id = 'bunkr-direct-player';
        video.src = mp4Url;
        video.controls = true;
        video.style.width = "100%";
        video.style.height = "100%";
        video.style.backgroundColor = "#000";
        video.className = "bunkr-video-stream"; 
        
        playerContainer.appendChild(video);
    }

    let lastUrl = location.href; 
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            checkAndEmbed();
        }
    }).observe(document, {subtree: true, childList: true});

    checkAndEmbed();

})();