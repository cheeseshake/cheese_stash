(function () {
    'use strict';

    // --- 1. Global State & Setup ---
    const tooltip = document.createElement("div");
    tooltip.id = "stash-url-tooltip";
    document.body.appendChild(tooltip);

    let hideTimeout;
    let activeIcon = null;

    // --- 2. GraphQL Fetcher ---
    async function fetchSceneUrls(sceneId) {
        const query = `
            query FindSceneUrls($id: ID!) {
                findScene(id: $id) {
                    urls
                }
            }
        `;
        try {
            const response = await fetch('/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, variables: { id: sceneId } })
            });
            const json = await response.json();
            return json.data.findScene;
        } catch (e) {
            console.error("Error fetching scene URLs", e);
            return { urls: [] };
        }
    }

    // --- 3. Tooltip Logic ---
    function hideTooltip() {
        tooltip.style.display = "none";
        activeIcon = null;
    }

    function showTooltip(element, sceneId) {
        clearTimeout(hideTimeout);
        activeIcon = element;
        
        const rect = element.getBoundingClientRect();
        
        // Desktop Smart Positioning
        if (window.innerWidth > 768) {
            tooltip.style.top = (rect.bottom + 5) + "px";
            if (rect.left + 450 > window.innerWidth) {
                tooltip.style.left = "auto";
                tooltip.style.right = (window.innerWidth - rect.right) + "px";
            } else {
                tooltip.style.left = rect.left + "px";
                tooltip.style.right = "auto";
            }
        } else {
            // Mobile
            tooltip.style.top = "";
            tooltip.style.left = "";
            tooltip.style.right = "";
        }

        tooltip.style.display = "flex";
        tooltip.innerHTML = "<div style='color:#888; padding:5px;'>Loading URLs...</div>";

        fetchSceneUrls(sceneId).then(data => {
            // If user moved away, don't update
            if (tooltip.style.display === "none") return;

            tooltip.innerHTML = ""; 
            
            if (!data || !data.urls || data.urls.length === 0) {
                tooltip.innerHTML = "<div style='padding:5px; color:#aaa;'>No URLs found</div>";
                return;
            }

            data.urls.forEach((url, index) => {
                const link = document.createElement("a");
                link.className = "url-tooltip-item";
                link.href = url;
                link.target = "_blank";
                
                link.innerHTML = `
                    <div class="url-tooltip-label">Source URL ${index + 1}</div>
                    <div>${url}</div>
                `;

                link.addEventListener("contextmenu", (e) => {
                    e.preventDefault();
                    navigator.clipboard.writeText(url);
                    const original = link.innerHTML;
                    link.innerHTML = "<div style='color:#fff; font-weight:bold; text-align:center;'>COPIED!</div>";
                    setTimeout(() => link.innerHTML = original, 800);
                });

                tooltip.appendChild(link);
            });
        });
    }

    // --- 4. Icon Creator ---
    function createIcon(sceneId, isWall = false) {
        const icon = document.createElement("div");
        icon.className = isWall ? "url-info-icon wall-url-icon" : "url-info-icon grid-url-icon";
        icon.title = "View Source URLs";
        icon.innerHTML = `
            <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
                <path d="M320 0c-17.7 0-32 14.3-32 32s14.3 32 32 32h82.7L201.4 265.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L448 109.3V192c0 17.7 14.3 32 32 32s32-14.3 32-32V32c0-17.7-14.3-32-32-32H320zM80 32C35.8 32 0 67.8 0 112V432c0 44.2 35.8 80 80 80H400c44.2 0 80-35.8 80-80V320c0-17.7-14.3-32-32-32s-32 14.3-32 32V432c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V112c0-8.8 7.2-16 16-16H192c17.7 0 32-14.3 32-32s-14.3-32-32-32H80z"/>
            </svg>
        `;

        let isTouch = false;

        icon.addEventListener('touchstart', function() { isTouch = true; }, { passive: true });

        icon.addEventListener("mouseenter", () => {
            if (!isTouch) showTooltip(icon, sceneId);
        });

        icon.addEventListener("mouseleave", () => {
            if (!isTouch) {
                hideTimeout = setTimeout(hideTooltip, 300);
            }
        });

        icon.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (tooltip.style.display === "flex" && activeIcon === icon) {
                hideTooltip();
            } else {
                showTooltip(icon, sceneId);
            }
            setTimeout(() => isTouch = false, 500);
        });
        
        return icon;
    }

    // --- 5. Optimized Node Processor ---
    function processNode(node) {
        if (node.nodeType !== 1) return; // Ignore text nodes

        // Helper to check if we already processed this
        const hasProcessed = (el) => el.querySelector('.url-info-icon');

        // A. Handle "Grid" Cards
        if (node.matches && node.matches('.scene-card')) {
            if (hasProcessed(node)) return;
            
            const popover = node.querySelector(".card-popovers");
            const sceneLink = node.querySelector("a.scene-card-link");
            
            if (popover && sceneLink) {
                const match = sceneLink.getAttribute("href").match(/\/scenes\/(\d+)/);
                if (match) {
                    popover.insertBefore(createIcon(match[1], false), popover.firstChild);
                }
            }
        } 
        
        // B. Handle "Wall" Items
        if (node.matches && node.matches('.wall-item')) {
             if (hasProcessed(node)) return;
             
             const sceneLink = node.querySelector("a[href^='/scenes/']");
             if (sceneLink) {
                const match = sceneLink.getAttribute("href").match(/\/scenes\/(\d+)/);
                if (match) {
                    node.appendChild(createIcon(match[1], true));
                }
             }
        }

        // C. Check Children (e.g. if a whole container was added)
        if (node.querySelectorAll) {
            // Find Scene Cards inside
            const cards = node.querySelectorAll('.scene-card');
            cards.forEach(card => processNode(card));

            // Find Wall Items inside
            const wallItems = node.querySelectorAll('.wall-item');
            wallItems.forEach(item => processNode(item));
        }
    }

    // --- 6. Efficient Observer ---
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                processNode(node);
            });
        });
    });

    observer.observe(document.body, { subtree: true, childList: true });
    
    // Initial Run for existing content
    document.querySelectorAll(".scene-card, .wall-item").forEach(processNode);

    console.log("✅ Scene Source Icons Loaded");

})();
