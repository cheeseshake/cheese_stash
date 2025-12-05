(function () {
    'use strict';

    // CONFIGURATION
    const HOVER_DELAY_MS = 300;
    const PLAY_DURATION_SEC = 3;
    const START_PERCENT = 10;
    const STEP_PERCENT = 10;

    // --- 1. CORE LOGIC (Handles the video behavior) ---
    function attachSmartLogic(videoEl) {
        if (videoEl.dataset.smartLogicAttached) return;
        videoEl.dataset.smartLogicAttached = "true";

        // Internal State
        const state = {
            pct: START_PERCENT,
            hoverTimeout: null,
            isStream: false
        };

        // A. Check availability (Head Request)
        // If this is a newly injected wall video, src might be set to preview initially.
        // We check if it exists. If not, swap to stream.
        fetch(videoEl.src, { method: 'HEAD' })
            .then((res) => {
                if (res.status !== 200) {
                    // Switch to stream
                    videoEl.src = videoEl.src.replace("/preview", "/stream");
                    videoEl.muted = true; // Force mute streams
                    state.isStream = true;
                }
            })
            .catch(() => {});

        // B. Time Update (The 10% -> 20% Loop)
        videoEl.addEventListener("timeupdate", function() {
            // Only loop if it's falling back to a full stream (or if you want previews to loop too, remove checks)
            // Usually previews are short enough to just play, but let's apply logic if it's a stream.
            if (!state.isStream) return;
            if (!this.duration) return;

            const segmentStartTime = this.duration * (state.pct / 100);
            const segmentEndTime = segmentStartTime + PLAY_DURATION_SEC;

            if (this.currentTime >= segmentEndTime) {
                state.pct += STEP_PERCENT;
                if (state.pct >= 95) state.pct = START_PERCENT;
                
                this.currentTime = this.duration * (state.pct / 100);
            }
        });

        // C. Hover Enter (Start Timer)
        videoEl.addEventListener("mouseenter", function(e) {
            // Stop immediate playback
            this.pause();
            e.stopImmediatePropagation();

            state.hoverTimeout = setTimeout(() => {
                // If it's a stream, jump to the correct % before playing
                if (state.isStream && this.duration) {
                    const targetTime = this.duration * (state.pct / 100);
                    if (Math.abs(this.currentTime - targetTime) > 1) {
                        this.currentTime = targetTime;
                    }
                }
                const p = this.play();
                if (p) p.catch(() => {}); // Catch autoplay rejections
            }, HOVER_DELAY_MS);
        }, true); // Capture phase is critical

        // D. Hover Leave (Cleanup)
        videoEl.addEventListener("mouseleave", function() {
            if (state.hoverTimeout) {
                clearTimeout(state.hoverTimeout);
                state.hoverTimeout = null;
            }
            this.pause();
            // Reset position logic if desired
            if (state.isStream && this.duration) {
                this.currentTime = this.duration * (state.pct / 100);
            }
        });
    }

    // --- 2. WALL ITEM ADAPTER ---
    function processWallItem(wallItem) {
        if (wallItem.dataset.smartPreviewProcessed) return;
        wallItem.dataset.smartPreviewProcessed = "true";

        // Find the ID from the link
        const link = wallItem.querySelector('a[href^="/scenes/"]');
        if (!link) return;
        
        const match = link.getAttribute('href').match(/\/scenes\/(\d+)/);
        if (!match) return;
        const sceneId = match[1];

        // We only create the video when the user Hovers (Performance)
        wallItem.addEventListener('mouseenter', () => {
            // Check if video already exists
            if (wallItem.querySelector('.smart-wall-video')) return;

            // Create Video
            const video = document.createElement('video');
            video.className = "smart-wall-video";
            // Default to preview, the logic will swap to stream if 404
            video.src = `/scene/${sceneId}/preview`; 
            video.loop = true;
            video.muted = true;
            
            // CSS to overlay exactly on top of the image
            video.style.position = "absolute";
            video.style.top = "0";
            video.style.left = "0";
            video.style.width = "100%";
            video.style.height = "100%";
            video.style.objectFit = "contain"; // or 'cover' depending on preference
            video.style.zIndex = "5";
            video.style.background = "#000";

            // Attach core logic
            attachSmartLogic(video);

            // Inject
            // We insert before the first child to ensure it sits correctly in the stack context
            // actually, usually appending is safer for z-index
            const img = wallItem.querySelector('img');
            if (img) {
                // Match image dimensions exactly
                video.width = img.width;
                video.height = img.height;
            }
            wallItem.appendChild(video);

            // Trigger the mouseenter logic we just attached
            video.dispatchEvent(new Event('mouseenter'));

        }, { once: false });

        // Cleanup on leave (Optional: remove video to save RAM?)
        // For now, let's keep it so if they hover again it's instant.
        // If you want to remove it: add a mouseleave to the wallItem to video.remove()
        wallItem.addEventListener('mouseleave', () => {
             const v = wallItem.querySelector('.smart-wall-video');
             if (v) {
                 v.pause();
                 v.dispatchEvent(new Event('mouseleave'));
                 // Optional: v.remove(); // Uncomment to destroy video on leave
             }
        });
    }

    // --- 3. OBSERVER ---
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType !== 1) return;

                // A. Check for GRID videos
                if (node.matches && node.matches('.scene-card-preview-video')) {
                    attachSmartLogic(node);
                } else if (node.querySelectorAll) {
                    node.querySelectorAll('.scene-card-preview-video').forEach(attachSmartLogic);
                }

                // B. Check for WALL items
                if (node.matches && node.matches('.wall-item')) {
                    processWallItem(node);
                } else if (node.querySelectorAll) {
                    node.querySelectorAll('.wall-item').forEach(processWallItem);
                }
            });
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Initial Run
    document.querySelectorAll('.scene-card-preview-video').forEach(attachSmartLogic);
    document.querySelectorAll('.wall-item').forEach(processWallItem);

    console.log("✅ Smart Stream Previews (Grid + Wall Injection) Loaded");
})();