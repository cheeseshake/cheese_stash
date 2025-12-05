(function () {
    'use strict';

    // CONFIGURATION
    const HOVER_DELAY_MS = 300;
    const PLAY_DURATION_SEC = 3;
    const START_PERCENT = 10;
    const STEP_PERCENT = 10;

    // TARGET SELECTORS (Grid Cards + Wall Items)
    const VIDEO_SELECTORS = ".scene-card-preview-video, .wall-item-media";

    function processPreviewVideo(element) {
        // Prevent running on the same element twice
        if (element.dataset.previewChecked) return;
        element.dataset.previewChecked = "true";

        // Check if the preview exists
        fetch(element.src, { method: 'HEAD' })
            .then((res) => {
                // If 404 (Not Found) or 0 (Network Error/Adblock), switch to stream
                if (res.status !== 200) {
                    const streamSrc = element.src.replace("/preview", "/stream");
                    
                    // 1. Force Mute
                    element.muted = true;
                    
                    // Setup internal state
                    element.dataset.currentPercent = START_PERCENT;
                    let hoverTimeout = null;

                    // 2. Playback Loop Logic
                    element.addEventListener("timeupdate", function() {
                        if (!this.duration) return;
                        
                        let pct = parseInt(this.dataset.currentPercent || START_PERCENT);
                        const segmentStartTime = this.duration * (pct / 100);
                        const segmentEndTime = segmentStartTime + PLAY_DURATION_SEC;

                        if (this.currentTime >= segmentEndTime) {
                            pct += STEP_PERCENT;
                            if (pct >= 95) pct = START_PERCENT;
                            
                            this.dataset.currentPercent = pct;
                            this.currentTime = this.duration * (pct / 100);
                        }
                    });

                    // 3. Hover Delay Logic
                    element.addEventListener("mouseenter", function(e) {
                        this.pause();
                        e.stopImmediatePropagation();

                        hoverTimeout = setTimeout(() => {
                            const pct = parseInt(this.dataset.currentPercent || START_PERCENT);
                            if (this.duration) {
                                const targetTime = this.duration * (pct / 100);
                                if (Math.abs(this.currentTime - targetTime) > 1) {
                                    this.currentTime = targetTime;
                                }
                            }
                            this.play();
                        }, HOVER_DELAY_MS);
                    }, true);

                    element.addEventListener("mouseleave", function() {
                        if (hoverTimeout) {
                            clearTimeout(hoverTimeout);
                            hoverTimeout = null;
                        }
                        this.pause();
                        const pct = parseInt(this.dataset.currentPercent || START_PERCENT);
                        if (this.duration) {
                             this.currentTime = this.duration * (pct / 100);
                        }
                    });

                    // 4. Initial Setup
                    element.addEventListener("loadedmetadata", function() {
                        if (this.duration) {
                            this.currentTime = this.duration * (START_PERCENT / 100);
                        }
                    }, { once: true });

                    // Swap the source
                    element.src = streamSrc;
                }
            })
            .catch((err) => console.warn("Smart Preview Error:", err));
    }

    // Observer to handle scrolling/new items
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) {
                    // Check if the node IS a video
                    if (node.matches && node.matches(VIDEO_SELECTORS)) {
                        processPreviewVideo(node);
                    } 
                    // Check if the node CONTAINS videos (e.g., a new div of cards)
                    else if (node.querySelectorAll) {
                        node.querySelectorAll(VIDEO_SELECTORS).forEach(processPreviewVideo);
                    }
                }
            });
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
    
    // Initial run
    document.querySelectorAll(VIDEO_SELECTORS).forEach(processPreviewVideo);
    
    console.log("✅ Smart Stream Previews (Grid + Wall) Loaded");
})();