// UI Utility Functions

import { emit } from './observable.js';

export function toggleFullscreen() {
    const container = document.querySelector('.split-view-container');
    const fabIcon = document.getElementById('fabFullscreenIcon');
    const editorContainer = document.getElementById('editorContainer');

    // Check if Monaco editor is focused
    const isEditorFocused = editorContainer && editorContainer.contains(document.activeElement);

    // If editor is focused, fullscreen the editor pane
    if (isEditorFocused) {
        const wasFullscreen = container.classList.contains('fullscreen');
        if (wasFullscreen) {
            container.classList.remove('fullscreen');
            if (fabIcon) fabIcon.setAttribute('class', 'fas fa-expand');
        } else {
            container.classList.remove('fullscreen-cv');
            container.classList.add('fullscreen');
            if (fabIcon) fabIcon.setAttribute('class', 'fas fa-compress');
        }

        // Emit fullscreen event
        emit('editor:fullscreen', {
            pane: 'editor',
            isFullscreen: !wasFullscreen
        });
    } else {
        // Otherwise fullscreen the CV pane
        const wasFullscreen = container.classList.contains('fullscreen-cv');
        if (wasFullscreen) {
            container.classList.remove('fullscreen-cv');
            if (fabIcon) fabIcon.setAttribute('class', 'fas fa-expand');
        } else {
            container.classList.remove('fullscreen');
            container.classList.add('fullscreen-cv');
            if (fabIcon) fabIcon.setAttribute('class', 'fas fa-compress');
        }

        // Emit fullscreen event
        emit('editor:fullscreen', {
            pane: 'cv',
            isFullscreen: !wasFullscreen
        });
    }
}
