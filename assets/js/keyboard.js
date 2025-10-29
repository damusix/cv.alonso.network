// Keyboard Shortcuts

import { toggleEditor, applyChanges } from './editor.js';
import { toggleActionMenu } from './action-menu.js';
import { toggleFullscreen } from './ui-utils.js';
import { showHelpModal } from './modal.js';

let lastEscapeTime = 0;

export function initializeKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        const panel = document.getElementById('editorPanel');
        const menu = document.getElementById('actionMenu');
        const editorContainer = document.getElementById('editorContainer');
        const isEditorOpen = panel.classList.contains('open');
        const isMenuOpen = menu.classList.contains('show');

        // Check if Monaco editor is focused
        const isEditorFocused = editorContainer && editorContainer.contains(document.activeElement);

        // CMD+S / CTRL+S to save (only when Monaco editor is focused)
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            if (isEditorFocused) {
                e.preventDefault();
                applyChanges();
            }
        }

        // CMD+E / CTRL+E to open editor (mobile only)
        if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
            e.preventDefault();
            if (isMenuOpen) {
                toggleActionMenu(); // Close menu if open
            }
            if (!isEditorOpen) {
                toggleEditor();
            }
        }

        // CMD+P / CTRL+P to print (override browser default)
        if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
            e.preventDefault();
            window.print();
        }

        // CMD+\ / CTRL+\ to toggle fullscreen
        if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
            e.preventDefault();
            toggleFullscreen();
        }

        // ESC to close menu
        if (e.key === 'Escape' && isMenuOpen) {
            toggleActionMenu();
            return;
        }

        // Double Escape within 1 second to close editor (mobile only)
        if (e.key === 'Escape' && isEditorOpen) {
            const now = Date.now();
            if (now - lastEscapeTime < 1000) {
                toggleEditor();
                lastEscapeTime = 0;
            } else {
                lastEscapeTime = now;
            }
        }

        // ? to open help modal (only when NOT typing in editor)
        if (e.key === '?' && !isEditorFocused) {
            e.preventDefault();
            showHelpModal();
        }
    });
}
