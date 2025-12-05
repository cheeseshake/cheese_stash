(function () {
    'use strict';

    // CONFIGURATION
    const HOVER_DELAY_MS = 300;
    const PLAY_DURATION_SEC = 3;
    const START_PERCENT = 10;
    const STEP_PERCENT = 10;

    // --- GLOBAL STATE ---
    let currentlyPlaying = null;
    let latestHovered = null;

    // Helper: Enforce Single Player Mode
    function playExclusive(videoEl) {
        if (currentlyPlaying && currentlyPlaying !== videoEl) {
            currentlyPlaying.pause();
        }
        
        const p = videoEl.play();
        if (p) {
            p.then(() => {
                currentlyPlaying = videoEl;
            }).catch(e => {
                // Auto-play might be blocked
            });
        }
    }

    // --- 1. CORE LOGIC ---
    function attachSmartLogic(videoEl) {
        if (videoEl.dataset.smartLogicAttached) return;
        videoEl.dataset.smartLogicAttached = "true";

        // Internal State
        const state = {
            pct: START_PERCENT,
            hoverTimeout: null
        };

        // A. Check availability (Swaps to stream if preview missing)
        fetch(videoEl.src, { method: 'HEAD' })
            .then((res) => {
                if (res.status !== 200) {
                    videoEl.src = videoEl.src.replace("/preview", "/stream");
                    videoEl.muted = true;
                }
            })
            .catch(() => {});

        // B. Time Update Loop (THE JUMP LOGIC)
        videoEl.addEventListener("timeupdate", function() {
            if (!this.duration) return;

            // REMOVED check for isStream. Now applies to ALL videos.
            const segmentStartTime = this.duration * (state.pct / 100);
            const segmentEndTime = segmentStartTime + PLAY_DURATION_SEC;

            if (this.currentTime >= segmentEndTime) {
                state.pct += STEP_PERCENT;
                if (state.pct >= 95) state.pct = START_PERCENT;
                
                // Perform the Jump
                this.currentTime = this.duration * (state.pct / 100);
            }
        });

        // C. Hover Enter
        videoEl.addEventListener("mouseenter", function(e) {
            latestHovered = this;

            // Stop immediate native Stash playback
            this.pause();
            e.stopImmediatePropagation();

            if (state.hoverTimeout) clearTimeout(state.hoverTimeout);

            state.hoverTimeout = setTimeout(() => {
                // Check if user is still hovering this specific video
                if (latestHovered !== this) return;

                // FORCE JUMP TO START POSITION
                if (this.duration) {
                    const targetTime = this.duration * (state.pct / 100);
                    // Seek if we are far away from the target
                    if (Math.abs(this.currentTime - targetTime) > 0.5) {
                        this.currentTime = targetTime;
                    }
                }

                playExclusive(this);

            }, HOVER_DELAY_MS);
        }, true);

        // D. Hover Leave
        videoEl.addEventListener("mouseleave", function() {
            if (state.hoverTimeout) {
                clearTimeout(state.hoverTimeout);
                state.hoverTimeout = null;
            }
            this.pause();
        });

        // E. Initial Metadata Load (Crucial for Wall Items)
        // Ensures newly created videos know where to start immediately
        videoEl.addEventListener("loadedmetadata", function() {
            if (this.duration) {
                this.currentTime = this.duration * (state.pct / 100);
            }
        }, { once: true });
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
            let video = wallItem.querySelector('.smart-wall-video');
            
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
                video.style.backgroundColor = "#000";

                const img = wallItem.querySelector('img');
                if (img) {
                    video.width = img.width;
                    video.height = img.height;
                }

                wallItem.appendChild(video);
                attachSmartLogic(video);
            }

            // Nudge the video to register the hover
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

    console.log("✅ Smart Stream Previews (Universal Jump) Loaded");
})();