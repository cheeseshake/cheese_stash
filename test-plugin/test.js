(function () {
    'use strict';
    console.log("✅ STASH TEST PLUGIN: The repository connection is working!");
    
    // Optional: Add a tiny visual dot to the footer so you can see it on screen
    const dot = document.createElement('div');
    dot.style.position = 'fixed';
    dot.style.bottom = '5px';
    dot.style.left = '5px';
    dot.style.width = '10px';
    dot.style.height = '10px';
    dot.style.background = '#00ff00';
    dot.style.borderRadius = '50%';
    dot.style.zIndex = '99999';
    dot.title = "Test Plugin Loaded";
    document.body.appendChild(dot);
})();
