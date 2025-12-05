(function () {
    'use strict';

    // CONFIGURATION
    const HOVER_DELAY_MS = 300;     // CHANGED: Reduced from 500 to 300
    const PLAY_DURATION_SEC = 3;    // CHANGED: Reduced to 3 seconds
    const START_PERCENT = 10;
    const STEP_PERCENT = 10;

    function processPreviewVideo(element) {
        // Prevent running on the same element twice
        if (element.dataset.previewChecked) return;
        element.dataset.previewChecked = "true";

        // Check if the preview exists
        fetch(element.src, { method: 'HEAD' })
            .then((res) => {
                if (res.status !== 200) {
                    const streamSrc = element.src.replace("/preview", "/stream");
                    
                    // 1. Force Mute (Important for full streams)
                    element.muted = true;
                    
                    // Setup internal state
                    element.dataset.currentPercent = START_PERCENT;
                    let hoverTimeout = null;

                    // 2. Playback Loop Logic
                    element.addEventListener("timeupdate", function() {
                        if (!this.duration) return;
                        
                        // Parse current percentage state
                        let pct = parseInt(this.dataset.currentPercent || START_PERCENT);
                        
                        // Calculate the end time for this segment
                        const segmentStartTime = this.duration * (pct / 100);
                        const segmentEndTime = segmentStartTime + PLAY_DURATION_SEC;

                        // If we have played past the window
                        if (this.currentTime >= segmentEndTime) {
                            // Increment percentage
                            pct += STEP_PERCENT;
                            if (pct >= 95) pct = START_PERCENT; // Wrap around
                            
                            // Update state and jump
                            this.dataset.currentPercent = pct;
                            this.currentTime = this.duration * (pct / 100);
                        }
                    });

                    // 3. Hover Delay Logic
                    element.addEventListener("mouseenter", function(e) {
                        // Stop Stash from playing immediately
                        this.pause();
                        e.stopImmediatePropagation();

                        // Start the timer
                        hoverTimeout = setTimeout(() => {
                            const pct = parseInt(this.dataset.currentPercent || START_PERCENT);
                            if (this.duration) {
                                // Jump to the correct spot before playing
                                const targetTime = this.duration * (pct / 100);
                                if (Math.abs(this.currentTime - targetTime) > 1) {
                                    this.currentTime = targetTime;
                                }
                            }
                            this.play();
                        }, HOVER_DELAY_MS);
                    }, true); // Capture phase

                    element.addEventListener("mouseleave", function() {
                        if (hoverTimeout) {
                            clearTimeout(hoverTimeout);
                            hoverTimeout = null;
                        }
                        this.pause();
                        // Reset to start of current segment so it doesn't resume mid-loop next time
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

                    // Swap the source to the full stream
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
                    if (node.matches && node.matches(".scene-card-preview-video")) {
                        processPreviewVideo(node);
                    } else if (node.querySelectorAll) {
                        node.querySelectorAll(".scene-card-preview-video").forEach(processPreviewVideo);
                    }
                }
            });
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
    
    // Initial run
    document.querySelectorAll(".scene-card-preview-video").forEach(processPreviewVideo);
    
    console.log("✅ Smart Stream Previews (Legacy Mode) Loaded");
})();
