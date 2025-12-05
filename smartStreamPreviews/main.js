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

        // A. Check availability
        fetch(videoEl.src, { method: 'HEAD' })
            .then((res) => {
                if (res.status !== 200) {
                    videoEl.src = videoEl.src.replace("/preview", "/stream");
                    videoEl.muted = true;
                }
            })
            .catch(() => {});

        // B. Time Update Loop (Jump Logic)
        videoEl.addEventListener("timeupdate", function() {
            if (!this.duration) return;

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
            latestHovered = this;
            this.pause();
            e.stopImmediatePropagation();

            if (state.hoverTimeout) clearTimeout(state.hoverTimeout);

            state.hoverTimeout = setTimeout(() => {
                if (latestHovered !== this) return;

                if (this.duration) {
                    const targetTime = this.duration * (state.pct / 100);
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

        // E. Initial Metadata Load
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

        // 1. Mouse Enter on the WALL ITEM (Container)
        wallItem.addEventListener('mouseenter', () => {
            let video = wallItem.querySelector('.smart-wall-video');
            
            if (!video) {
                video = document.createElement('video');
                video.className = "smart-wall-video";
                video.src = `/scene/${sceneId}/preview`; 
                video.loop = true;
                video.muted = true;
                
                // --- CRITICAL CHANGE: POINTER EVENTS NONE ---
                // This makes the video "invisible" to clicks. 
                // Clicks pass through to the Wall Item below (restoring navigation).
                video.style.pointerEvents = "none"; 
                
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

            // Since the video ignores mouse events (pointer-events: none),
            // we must MANUALLY tell it "The mouse has entered you"
            video.dispatchEvent(new Event('mouseenter'));

        }, { once: false });

        // 2. Mouse Leave on the WALL ITEM
        wallItem.addEventListener('mouseleave', () => {
             const v = wallItem.querySelector('.smart-wall-video');
             if (v) {
                 // Manually tell the video "The mouse has left"
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

    console.log("✅ Smart Stream Previews (Pointer-Events Fix) Loaded");
})();