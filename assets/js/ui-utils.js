// UI Utility Functions

export function showError(message) {
    const errorEl = document.getElementById('editorError');
    errorEl.textContent = message;
    errorEl.classList.add('show');
    errorEl.classList.remove('success');
}

export function showSuccess(message) {
    const errorEl = document.getElementById('editorError');
    errorEl.textContent = message;
    errorEl.classList.add('show', 'success');
}

export function hideError() {
    const errorEl = document.getElementById('editorError');
    errorEl.textContent = '';
    errorEl.classList.remove('show', 'success');
}

export function toggleFullscreen() {
    const panel = document.getElementById('editorPanel');
    const icon = document.getElementById('fullscreenIcon');
    panel.classList.toggle('fullscreen');

    // Update icon
    if (panel.classList.contains('fullscreen')) {
        icon.className = 'fas fa-compress';
    } else {
        icon.className = 'fas fa-expand';
    }
}
