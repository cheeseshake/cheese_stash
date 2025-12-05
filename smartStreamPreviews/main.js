(function () {
    'use strict';

    // CONFIGURATION
    const HOVER_DELAY_MS = 300;
    const PLAY_DURATION_SEC = 3;
    const START_PERCENT = 10;
    const STEP_PERCENT = 10;

    // --- GLOBAL STATE ---
    // We track these to ensure only one video plays at a time
    let currentlyPlaying = null;
    let latestHovered = null;

    // Helper: Enforce Single Player Mode
    function playExclusive(videoEl) {
        // 1. If another video is playing, pause it
        if (currentlyPlaying && currentlyPlaying !== videoEl) {
            currentlyPlaying.pause();
        }
        
        // 2. Play the new one
        const p = videoEl.play();
        if (p) {
            p.then(() => {
                currentlyPlaying = videoEl;
            }).catch(e => {
                // Auto-play might be blocked or interrupted
                // console.warn("Playback interrupted", e);
            });
        }
    }

    // --- 1. CORE LOGIC ---
    function attachSmartLogic(videoEl) {
        if (videoEl.dataset.smartLogicAttached) return;
        videoEl.dataset.smartLogicAttached = "true";

        // Internal State (Local to this video)
        const state = {
            pct: START_PERCENT,
            isStream: false,
            hoverTimeout: null // Local timer is safer
        };

        // A. Check availability
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

        // C. Hover Enter
        videoEl.addEventListener("mouseenter", function(e) {
            // Update Global Tracker
            latestHovered = this;

            // Stop immediate native Stash playback
            this.pause();
            e.stopImmediatePropagation();

            // Clear any existing local timer
            if (state.hoverTimeout) clearTimeout(state.hoverTimeout);

            // Start Timer
            state.hoverTimeout = setTimeout(() => {
                // INTEGRITY CHECK:
                // Only play if this video is STILL the last one the user hovered.
                // This prevents multiple videos from starting if you move mouse quickly.
                if (latestHovered !== this) return;

                // Prepare position if stream
                if (state.isStream && this.duration) {
                    const targetTime = this.duration * (state.pct / 100);
                    if (Math.abs(this.currentTime - targetTime) > 1) {
                        this.currentTime = targetTime;
                    }
                }

                playExclusive(this);

            }, HOVER_DELAY_MS);
        }, true); // Capture phase

        // D. Hover Leave
        videoEl.addEventListener("mouseleave", function() {
            if (state.hoverTimeout) {
                clearTimeout(state.hoverTimeout);
                state.hoverTimeout = null;
            }
            this.pause();
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

        // We use 'mouseenter' on the WALL ITEM to spawn the video
        wallItem.addEventListener('mouseenter', () => {
            let video = wallItem.querySelector('.smart-wall-video');
            
            if (!video) {
                video = document.createElement('video');
                video.className = "smart-wall-video";
                video.src = `/scene/${sceneId}/preview`; 
                video.loop = true;
                video.muted = true;
                
                // Styling to match Wall Item
                video.style.position = "absolute";
                video.style.top = "0";
                video.style.left = "0";
                video.style.width = "100%";
                video.style.height = "100%";
                video.style.objectFit = "contain";
                video.style.zIndex = "5";
                video.style.backgroundColor = "#000";

                // Match Image Dimensions if possible
                const img = wallItem.querySelector('img');
                if (img) {
                    video.width = img.width;
                    video.height = img.height;
                }

                wallItem.appendChild(video);
                attachSmartLogic(video);
            }

            // Force the video to recognize the hover immediately
            // (Because the video sits ON TOP of the wall item, the wall item gets the 
            // mouseenter first, creates the video, and the video might need a nudge)
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

                // Grid Videos
                if (node.matches && node.matches('.scene-card-preview-video')) {
                    attachSmartLogic(node);
                } else if (node.querySelectorAll) {
                    node.querySelectorAll('.scene-card-preview-video').forEach(attachSmartLogic);
                }

                // Wall Items
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

    console.log("✅ Smart Stream Previews (Robust Mode) Loaded");
})();