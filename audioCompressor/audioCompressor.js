console.log("Audio Compressor: Script Loaded");

(function () {
    'use strict';

    const SETTING_KEY = "stash_audio_compressor_level"; // 0, 10, 15, 20
    const BUTTON_ID = "audio-compressor-btn";
    const MENU_ID = "audio-compressor-menu";

    // --- ICONS ---
    const ICON_WAVE = `
        <svg aria-hidden="true" focusable="false" data-prefix="fas" data-icon="wave-square" class="svg-inline--fa fa-wave-square fa-icon" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512">
            <path fill="currentColor" d="M568 64H402.3c-18.4 0-35.3 8.3-46.7 23L269.4 227.8 179.8 86.8C162.7 59.9 133.5 44 101.7 44H8C3.6 44 0 47.6 0 52v48c0 4.4 3.6 8 8 8h93.7c9.5 0 18.2 4.7 23.3 12.7l116.3 183.1c17 26.9 46.2 42.8 78 42.8H480l69.7-109.6c5.1-8 13.8-12.7 23.3-12.7H632c4.4 0 8-3.6 8-8v-48c0-4.4-3.6-8-8-8H568zM269.4 284.2l86.1 140.9c11.3 14.7 28.3 23 46.7 23H568c4.4 0 8-3.6 8-8v-48c0-4.4-3.6-8-8-8h-5.2c-9.5 0-18.2-4.7-23.3-12.7L469.7 259.9c-17-26.9-46.2-42.8-78-42.8H223l-69.7 109.6c-5.1 8-13.8 12.7-23.3 12.7H8c-4.4 0-8 3.6-8 8v48c0 4.4 3.6 8 8 8h93.7c18.4 0 35.3-8.3 46.7-23l86.2-135.7z"></path>
        </svg>`;

    // --- STATE ---
    let currentContext = null;
    let currentSource = null;
    let currentGainNode = null;
    let currentCompressor = null;
    let currentVideoEl = null;

    // --- AUDIO ENGINE ---

    function initAudioGraph(videoEl) {
        if (currentVideoEl === videoEl && currentContext) return; 

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioContext();
            const source = ctx.createMediaElementSource(videoEl);
            const preGain = ctx.createGain();
            const compressor = ctx.createDynamicsCompressor();

            // Config Compressor for "Night Mode" Limiting
            compressor.threshold.value = -24; 
            compressor.knee.value = 30;       
            compressor.ratio.value = 12;      
            compressor.attack.value = 0.003;  
            compressor.release.value = 0.25;  

            // Connect Chain
            source.connect(preGain);
            preGain.connect(compressor);
            compressor.connect(ctx.destination);

            currentContext = ctx;
            currentSource = source;
            currentGainNode = preGain;
            currentCompressor = compressor;
            currentVideoEl = videoEl;

            console.log("Audio Compressor: Graph Initialized");
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

    // --- UI HELPERS ---

    function getSavedLevel() {
        return parseInt(localStorage.getItem(SETTING_KEY) || "0", 10);
    }

    function setSavedLevel(dB) {
        localStorage.setItem(SETTING_KEY, dB);
        applyGainLevel(dB);
        toggleMenu(false); 
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
            btn.style.opacity = "0.7";
        }
    }

    function toggleMenu(forceState = null) {
        const menu = document.getElementById(MENU_ID);
        if (!menu) return;

        const isHidden = menu.style.display === 'none';
        const newState = forceState !== null ? forceState : !isHidden;

        menu.style.display = newState ? 'block' : 'none';
    }

    // --- INJECTOR ---

    function createMenu() {
        const menu = document.createElement('div');
        menu.id = MENU_ID;
        menu.className = "dropdown-menu show"; 
        menu.style.display = "none";
        menu.style.position = "absolute";
        menu.style.marginTop = "0.5rem";
        menu.style.right = "0"; 
        menu.style.minWidth = "120px";
        menu.style.zIndex = "2000"; // Increased Z-Index to prevent overlap issues

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
            item.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                setSavedLevel(lvl.val);
            };
            menu.appendChild(item);
        });

        return menu;
    }

    function injectUI(videoEl) {
        if (document.getElementById(BUTTON_ID)) return;

        // Container
        const container = document.createElement('div');
        container.style.position = "relative";
        container.style.display = "inline-block";
        container.style.marginLeft = "10px"; // Spacing from the stars

        // Button
        const btn = document.createElement('button');
        btn.id = BUTTON_ID;
        btn.className = "minimal btn btn-secondary";
        btn.title = "Audio Compressor / Normalizer";
        btn.innerHTML = ICON_WAVE;
        btn.onclick = (e) => {
            e.preventDefault();
            toggleMenu();
        };

        // Menu
        const menu = createMenu();

        container.appendChild(btn);
        container.appendChild(menu);
        
        // --- PLACEMENT LOGIC ---
        // Try to find the Stars component
        const stars = document.querySelector('.rating-stars');
        
        if (stars && stars.parentNode) {
            // Insert AFTER the stars
            // insertBefore(newNode, referenceNode.nextSibling) acts as insertAfter
            stars.parentNode.insertBefore(container, stars.nextSibling);
        } else {
            // Fallback: End of toolbar
            const toolbar = document.querySelector('.ScenePlayer-toolbar-right') || 
                            document.querySelector('.scene-toolbar-group') || 
                            document.querySelector('.ml-auto');
            if (toolbar) {
                toolbar.appendChild(container);
            }
        }

        // Click outside listener
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                toggleMenu(false);
            }
        });
        
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