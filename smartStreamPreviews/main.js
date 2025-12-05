(function () {
    'use strict';

    // CONFIGURATION
    const HOVER_DELAY_MS = 300;
    const PLAY_DURATION_SEC = 3;
    const START_PERCENT = 10;
    const STEP_PERCENT = 10;

    // --- GLOBAL STATE (The Singleton Pattern) ---
    let activeVideo = null;       // The video currently playing
    let pendingPlayTimeout = null; // The timer waiting to start a video

    // Helper: Stop the currently playing video (if any)
    function killActiveVideo() {
        if (activeVideo) {
            activeVideo.pause();
            
            // Optional: If it was a dynamically injected Wall video, you could remove it here
            // activeVideo.remove(); 
            
            activeVideo = null;
        }
    }

    // --- 1. CORE LOGIC ---
    function attachSmartLogic(videoEl) {
        if (videoEl.dataset.smartLogicAttached) return;
        videoEl.dataset.smartLogicAttached = "true";

        // Internal State for this specific video
        const state = {
            pct: START_PERCENT,
            isStream: false
        };

        // A. Check availability (Head Request)
        fetch(videoEl.src, { method: 'HEAD' })
            .then((res) => {
                if (res.status !== 200) {
                    videoEl.src = videoEl.src.replace("/preview", "/stream");
                    videoEl.muted = true;
                    state.isStream = true;
                }
            })
            .catch(() => {});

        // B. Time Update Loop
        videoEl.addEventListener("timeupdate", function() {
            if (!state.isStream || !this.duration) return;

            const segmentStartTime = this.duration * (state.pct / 100);
            const segmentEndTime = segmentStartTime + PLAY_DURATION_SEC;

            if (this.currentTime >= segmentEndTime) {
                state.pct += STEP_PERCENT;
                if (state.pct >= 95) state.pct = START_PERCENT;
                this.currentTime = this.duration * (state.pct / 100);
            }
        });

        // C. Hover Enter (The Critical Logic)
        videoEl.addEventListener("mouseenter", function(e) {
            // 1. Kill any pending timer from a previous hover
            if (pendingPlayTimeout) {
                clearTimeout(pendingPlayTimeout);
                pendingPlayTimeout = null;
            }

            // 2. Stop immediate native playback
            this.pause();
            e.stopImmediatePropagation();

            // 3. Start ONE global timer
            pendingPlayTimeout = setTimeout(() => {
                // Stop whatever was playing before
                killActiveVideo();

                // Prepare this video
                if (state.isStream && this.duration) {
                    const targetTime = this.duration * (state.pct / 100);
                    if (Math.abs(this.currentTime - targetTime) > 1) {
                        this.currentTime = targetTime;
                    }
                }

                // Set as active and play
                activeVideo = this;
                const p = this.play();
                if (p) p.catch(() => {}); 

            }, HOVER_DELAY_MS);
        }, true); 

        // D. Hover Leave
        videoEl.addEventListener("mouseleave", function() {
            // If I leave BEFORE the timer fired, kill the timer.
            // This prevents the video from starting if I moved my mouse away quickly.
            if (pendingPlayTimeout) {
                clearTimeout(pendingPlayTimeout);
                pendingPlayTimeout = null;
            }

            // Pause this specific video if it was playing
            if (activeVideo === this) {
                this.pause();
                activeVideo = null;
            }
        });
    }

    // --- 2. WALL ITEM ADAPTER ---
    function processWallItem(wallItem) {
        if (wallItem.dataset.smartPreviewProcessed) return;
        wallItem.dataset.smartPreviewProcessed = "true";

        const link = wallItem.querySelector('a[href^="/scenes/"]');
        if (!link) return;
        
        const match = link.getAttribute('href').match(/\/scenes\/(\d+)/);
        if (!match) return;
        const sceneId = match[1];

        wallItem.addEventListener('mouseenter', () => {
            // Clear global timeout immediately here too, just in case
            if (pendingPlayTimeout) clearTimeout(pendingPlayTimeout);

            let video = wallItem.querySelector('.smart-wall-video');
            
            // Create if missing
            if (!video) {
                video = document.createElement('video');
                video.className = "smart-wall-video";
                video.src = `/scene/${sceneId}/preview`; 
                video.loop = true;
                video.muted = true;
                
                video.style.position = "absolute";
                video.style.top = "0";
                video.style.left = "0";
                video.style.width = "100%";
                video.style.height = "100%";
                video.style.objectFit = "contain";
                video.style.zIndex = "5";
                video.style.background = "#000";

                const img = wallItem.querySelector('img');
                if (img) {
                    video.width = img.width;
                    video.height = img.height;
                }
                
                wallItem.appendChild(video);
                attachSmartLogic(video);
            }

            // Manually trigger the enter logic on the video element
            video.dispatchEvent(new Event('mouseenter'));

        }, { once: false });

        wallItem.addEventListener('mouseleave', () => {
             const v = wallItem.querySelector('.smart-wall-video');
             if (v) {
                 v.dispatchEvent(new Event('mouseleave'));
             }
        });
    }

    // --- 3. OBSERVER ---
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType !== 1) return;

                if (node.matches && node.matches('.scene-card-preview-video')) {
                    attachSmartLogic(node);
                } else if (node.querySelectorAll) {
                    node.querySelectorAll('.scene-card-preview-video').forEach(attachSmartLogic);
                }

                if (node.matches && node.matches('.wall-item')) {
                    processWallItem(node);
                } else if (node.querySelectorAll) {
                    node.querySelectorAll('.wall-item').forEach(processWallItem);
                }
            });
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    document.querySelectorAll('.scene-card-preview-video').forEach(attachSmartLogic);
    document.querySelectorAll('.wall-item').forEach(processWallItem);

    console.log("✅ Smart Stream Previews (Single Player Mode) Loaded");
})();