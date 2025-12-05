(function () {
    'use strict';

    // CONFIGURATION
    const HOVER_DELAY_MS = 300;      // Wait 300ms before playing
    const SEGMENT_DURATION_SEC = 3;  // Play for 3 seconds per segment
    const START_PERCENT = 10;        // Start at 10%
    const STEP_PERCENT = 10;         // Jump 10% forward every loop
    
    // Internal state tracking
    const videoState = new WeakMap();

    function handleVideo(videoEl) {
        if (videoState.has(videoEl)) return; // Already processing this video
        
        // Mark as processed immediately so we don't attach double listeners
        videoState.set(videoEl, {
            timeout: null,
            isStream: false,
            pct: START_PERCENT
        });

        // 1. CHECK IF PREVIEW EXISTS
        // We use a HEAD request to see if the preview file is actually there.
        fetch(videoEl.src, { method: 'HEAD' })
            .then(res => {
                if (res.status === 404 || res.status === 0) {
                    // Preview missing! Switch to Stream
                    console.log(`[SmartPreview] Preview missing for ${videoEl.src}, switching to stream.`);
                    videoEl.src = videoEl.src.replace("/preview", "/stream");
                    
                    const state = videoState.get(videoEl);
                    if(state) state.isStream = true;
                    
                    // Force mute the stream (full files might have loud audio)
                    videoEl.muted = true;
                }
            })
            .catch(() => { /* Ignore fetch errors */ });

        // 2. HOVER (MOUSE ENTER) LOGIC
        videoEl.addEventListener('mouseenter', (e) => {
            const state = videoState.get(videoEl);
            if (!state) return;

            // STOP Stash from playing immediately
            videoEl.pause();
            e.stopImmediatePropagation(); 
            e.preventDefault();

            // Start our delay timer
            state.timeout = setTimeout(() => {
                // Time to play!
                
                // If it is a full stream, we need to handle the seek logic
                if (state.isStream && videoEl.duration) {
                    // Calculate where we should be
                    const targetTime = videoEl.duration * (state.pct / 100);
                    
                    // Only seek if we aren't close (prevents stuttering)
                    if (Math.abs(videoEl.currentTime - targetTime) > 0.5) {
                        videoEl.currentTime = targetTime;
                    }
                }

                const playPromise = videoEl.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        // Auto-play was prevented
                    });
                }
            }, HOVER_DELAY_MS);
        }, true); // <--- TRUE is critical. Capture phase intercepts event before Stash sees it.

        // 3. HOVER EXIT (MOUSE LEAVE) LOGIC
        videoEl.addEventListener('mouseleave', (e) => {
            const state = videoState.get(videoEl);
            if (!state) return;

            // If we are still waiting for the 300ms, cancel it
            if (state.timeout) {
                clearTimeout(state.timeout);
                state.timeout = null;
            }
            
            videoEl.pause();
        }, true);

        // 4. PLAYBACK LOOP LOGIC (The 3-second jump)
        videoEl.addEventListener('timeupdate', () => {
            const state = videoState.get(videoEl);
            // Only apply this logic if it's a full stream fallback
            if (!state || !state.isStream || !videoEl.duration) return;

            const startTime = videoEl.duration * (state.pct / 100);
            const endTime = startTime + SEGMENT_DURATION_SEC;

            // If we have played past the segment
            if (videoEl.currentTime >= endTime) {
                // Increment percentage
                state.pct += STEP_PERCENT;
                
                // Loop back to start if we go past 90%
                if (state.pct >= 90) state.pct = START_PERCENT;

                // Jump
                videoEl.currentTime = videoEl.duration * (state.pct / 100);
            }
        });
    }

    // 5. OBSERVER (Watches for new content/infinite scroll)
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1) { // Element node
                    // Check if the node itself is a video card preview
                    if (node.matches && node.matches('video.scene-card-preview-video')) {
                        handleVideo(node);
                    }
                    // Check if the node contains video card previews
                    else if (node.querySelectorAll) {
                        const videos = node.querySelectorAll('video.scene-card-preview-video');
                        videos.forEach(handleVideo);
                    }
                }
            }
        }
    });

    // Start observing the body for changes
    observer.observe(document.body, { childList: true, subtree: true });

    // Handle any videos already on screen at load
    document.querySelectorAll('video.scene-card-preview-video').forEach(handleVideo);

    console.log("✅ Smart Stream Previews Loaded");
})();
