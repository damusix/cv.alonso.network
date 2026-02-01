// Split Pane Management


let isDragging = false;
let startX = 0;
let startLeftWidth = 0;

export function initializeSplitPane() {
    const divider = document.getElementById('divider');
    const cvPane = document.getElementById('cvPane');
    const editorPane = document.getElementById('editorPane');
    const splitContainer = document.querySelector('.split-view-container');

    if (!divider || !cvPane || !editorPane) return;

    // Load saved pane width from localStorage
    const savedLeft = loadPaneWidth();
    if (savedLeft != null) {
        applyPaneWidths(savedLeft);
    }

    // Mouse events for dragging
    divider.addEventListener('mousedown', startDragging);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDragging);

    // Touch events for mobile dragging (if divider is visible)
    divider.addEventListener('touchstart', startDragging);
    document.addEventListener('touchmove', drag);
    document.addEventListener('touchend', stopDragging);

    function startDragging(e) {
        // Only allow dragging on desktop
        if (window.innerWidth <= 768) return;

        isDragging = true;
        divider.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        startX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
        startLeftWidth = cvPane.offsetWidth;

        e.preventDefault();
    }

    function drag(e) {
        if (!isDragging) return;

        const currentX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
        const deltaX = currentX - startX;
        const containerWidth = splitContainer.offsetWidth;
        const newLeftWidth = startLeftWidth + deltaX;

        // Enforce minimum widths (300px for each pane)
        const minWidth = 300;
        const maxLeftWidth = containerWidth - divider.offsetWidth - minWidth;
        if (newLeftWidth < minWidth || newLeftWidth > maxLeftWidth) return;

        const leftPercent = (newLeftWidth / containerWidth) * 100;
        applyPaneWidths(leftPercent);
    }

    function stopDragging() {
        if (!isDragging) return;

        isDragging = false;
        divider.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        // Save left pane width to localStorage
        const leftPercent = (cvPane.offsetWidth / splitContainer.offsetWidth) * 100;
        savePaneWidth(leftPercent);
    }
}

function applyPaneWidths(leftPercent) {
    const cvPane = document.getElementById('cvPane');
    const editorPane = document.getElementById('editorPane');

    cvPane.style.flex = `0 0 ${leftPercent}%`;
    editorPane.style.flex = '1';
}

function savePaneWidth(leftWidth) {
    localStorage.setItem('cv-split-pane-widths', JSON.stringify({ leftWidth }));
}

function loadPaneWidth() {
    const saved = localStorage.getItem('cv-split-pane-widths');
    if (!saved) return null;

    try {
        const parsed = JSON.parse(saved);
        return parsed.leftWidth ?? null;
    } catch {
        return null;
    }
}

export function toggleEditorPane() {
    const editorPane = document.getElementById('editorPane');

    // Desktop: No toggle - always visible (do nothing)
    if (window.innerWidth > 768) {
        return;
    }

    // Mobile: toggle fullscreen editor
    editorPane.classList.toggle('open');
    localStorage.setItem('cv-editor-pane-open', editorPane.classList.contains('open'));
}

export function isEditorPaneOpen() {
    const editorPane = document.getElementById('editorPane');
    return editorPane && editorPane.classList.contains('open');
}

export function restoreEditorPaneState() {
    // Desktop: Always show split-screen with saved widths
    if (window.innerWidth > 768) {
        const savedLeft = loadPaneWidth();
        applyPaneWidths(savedLeft ?? 50);
    }

    // Mobile: Restore open state if previously open
    const saved = localStorage.getItem('cv-editor-pane-open');
    if (saved === 'true' && window.innerWidth <= 768) {
        const editorPane = document.getElementById('editorPane');
        editorPane.classList.add('open');
    }
}
