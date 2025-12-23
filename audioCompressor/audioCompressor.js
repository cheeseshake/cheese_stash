console.log("Audio Compressor: Script Loaded (Portal Mode)");

(function () {
    'use strict';

    const SETTING_KEY = "stash_audio_compressor_level"; 
    const BUTTON_ID = "audio-compressor-btn";
    const MENU_ID = "audio-compressor-menu";

    // --- ICONS ---
    // Added specific style attributes to match Stash's native icon sizing
    const ICON_WAVE = `
        <svg aria-hidden="true" focusable="false" data-prefix="fas" data-icon="wave-square" 
             class="svg-inline--fa fa-wave-square fa-icon" role="img" 
             xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"
             style="height: 1em; width: 1.25em; vertical-align: -0.125em; pointer-events: none;">
            <path fill="currentColor" d="M568 64H402.3c-18.4 0-35.3 8.3-46.7 23L269.4 227.8 179.8 86.8C162.7 59.9 133.5 44 101.7 44H8C3.6 44 0 47.6 0 52v48c0 4.4 3.6 8 8 8h93.7c9.5 0 18.2 4.7 23.3 12.7l116.3 183.1c17 26.9 46.2 42.8 78 42.8H480l69.7-109.6c5.1-8 13.8-12.7 23.3-12.7H632c4.4 0 8-3.6 8-8v-48c0-4.4-3.6-8-8-8H568zM269.4 284.2l86.1 140.9c11.3 14.7 28.3 23 46.7 23H568c4.4 0 8-3.6 8-8v-48c0-4.4-3.6-8-8-8h-5.2c-9.5 0-18.2-4.7-23.3-12.7L469.7 259.9c-17-26.9-46.2-42.8-78-42.8H223l-69.7 109.6c-5.1 8-13.8 12.7-23.3 12.7H8c-4.4 0-8 3.6-8 8v48c0 4.4 3.6 8 8 8h93.7c18.4 0 35.3-8.3 46.7-23l86.2-135.7z"></path>
        </svg>`;

    // --- STATE ---
    let currentContext = null;
    let currentGainNode = null;
    let currentVideoEl = null;

    // --- AUDIO ENGINE (Unchanged) ---
    function initAudioGraph(videoEl) {
        if (currentVideoEl === videoEl && currentContext) return; 

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioContext();
            const source = ctx.createMediaElementSource(videoEl);
            const preGain = ctx.createGain();
            const compressor = ctx.createDynamicsCompressor();

            compressor.threshold.value = -24; 
            compressor.knee.value = 30;       
            compressor.ratio.value = 12;      
            compressor.attack.value = 0.003;  
            compressor.release.value = 0.25;  

            source.connect(preGain);
            preGain.connect(compressor);
            compressor.connect(ctx.destination);

            currentContext = ctx;
            currentGainNode = preGain;
            currentVideoEl = videoEl;

            applyGainLevel(getSavedLevel());

        } catch (e) {
            console.error("Audio Compressor: Init Failed", e);
        }
    }

    function applyGainLevel(dB) {
        if (!currentGainNode || !currentContext) return;
        if (currentContext.state === 'suspended') currentContext.resume();

        const linearGain = Math.pow(10, dB / 20);
        currentGainNode.gain.setTargetAtTime(linearGain, currentContext.currentTime, 0.1);
        updateButtonVisuals(dB);
    }

    // --- DATA ---
    function getSavedLevel() {
        return parseInt(localStorage.getItem(SETTING_KEY) || "0", 10);
    }

    function setSavedLevel(dB) {
        localStorage.setItem(SETTING_KEY, dB);
        applyGainLevel(dB);
        closeMenu();
    }

    function updateButtonVisuals(dB) {
        const btn = document.getElementById(BUTTON_ID);
        if (!btn) return;

        if (dB > 0) {
            btn.classList.add('btn-primary');
            btn.classList.remove('btn-secondary');
            btn.style.opacity = "1";
        } else {
            btn.classList.add('btn-secondary');
            btn.classList.remove('btn-primary');
            btn.style.opacity = "0.7"; // Dimmed when off
        }
    }

    // --- PORTAL MENU LOGIC (The Fix) ---
    function closeMenu() {
        const menu = document.getElementById(MENU_ID);
        if (menu) menu.remove();
        document.removeEventListener('click', handleOutsideClick);
    }

    function handleOutsideClick(e) {
        const menu = document.getElementById(MENU_ID);
        const btn = document.getElementById(BUTTON_ID);
        if (menu && !menu.contains(e.target) && !btn.contains(e.target)) {
            closeMenu();
        }
    }

    function openMenu() {
        // If already open, close it
        if (document.getElementById(MENU_ID)) {
            closeMenu();
            return;
        }

        const btn = document.getElementById(BUTTON_ID);
        if (!btn) return;

        // Create Menu attached to BODY (avoids overflow/clipping issues)
        const menu = document.createElement('div');
        menu.id = MENU_ID;
        menu.className = "dropdown-menu show";
        menu.style.position = "absolute";
        menu.style.zIndex = "99999"; // On top of everything
        menu.style.minWidth = "140px";

        // Calculate Position
        const rect = btn.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        // Position menu below button, aligned to the right edge of button
        menu.style.top = (rect.bottom + scrollTop + 5) + "px";
        menu.style.left = (rect.right - 140) + "px"; // Align right edge (140 is minWidth)

        const levels = [
            { label: "Off (Original)", val: 0 },
            { label: "Low (+10dB)", val: 10 },
            { label: "Med (+15dB)", val: 15 },
            { label: "High (+20dB)", val: 20 }
        ];

        levels.forEach(lvl => {
            const item = document.createElement('a');
            item.className = "dropdown-item";
            item.href = "#";
            item.innerText = lvl.label;
            
            // Highlight active
            if (getSavedLevel() === lvl.val) {
                item.classList.add('active');
            }

            item.onclick = (e) => {
                e.preventDefault();
                setSavedLevel(lvl.val);
            };
            menu.appendChild(item);
        });

        document.body.appendChild(menu);
        
        // Add listener to close when clicking elsewhere
        setTimeout(() => {
            document.addEventListener('click', handleOutsideClick);
        }, 0);
    }

    // --- INJECTOR ---
    function injectUI(videoEl) {
        if (document.getElementById(BUTTON_ID)) return;

        // Create Container
        const container = document.createElement('div');
        container.style.display = "inline-block";
        container.style.marginLeft = "4px"; 
        container.style.verticalAlign = "middle";

        // Create Button
        const btn = document.createElement('button');
        btn.id = BUTTON_ID;
        // Match Stash's native button classes
        btn.className = "minimal btn btn-secondary"; 
        btn.title = "Audio Compressor / Normalizer";
        btn.innerHTML = ICON_WAVE;
        
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation(); // Stop Stash from catching the click
            openMenu();
        };

        container.appendChild(btn);

        // --- PLACEMENT: Right after Stars ---
        const stars = document.querySelector('.rating-stars');
        
        if (stars && stars.parentNode) {
            stars.parentNode.insertBefore(container, stars.nextSibling);
        } else {
            // Fallback
            const toolbar = document.querySelector('.ScenePlayer-toolbar-right') || 
                            document.querySelector('.scene-toolbar-group');
            if (toolbar) toolbar.appendChild(container);
        }

        updateButtonVisuals(getSavedLevel());
    }

    // --- MAIN LOOP ---
    setInterval(() => {
        const video = document.querySelector('video');
        if (!video) return;

        if (!video.dataset.audioCompressorHooked) {
            video.dataset.audioCompressorHooked = "true";
            initAudioGraph(video);
        }

        injectUI(video);

    }, 1000);

})();