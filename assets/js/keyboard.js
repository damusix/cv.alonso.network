// Keyboard Shortcuts

import { toggleEditor, applyChanges } from './editor.js';
import { toggleActionMenu } from './action-menu.js';
import { toggleFullscreen } from './ui-utils.js';

let lastEscapeTime = 0;

export function initializeKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        const panel = document.getElementById('editorPanel');
        const menu = document.getElementById('actionMenu');
        const isEditorOpen = panel.classList.contains('open');
        const isMenuOpen = menu.classList.contains('show');

        // CMD+S / CTRL+S to save (only when editor is open)
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            if (isEditorOpen) {
                e.preventDefault();
                applyChanges();
            }
        }

        // CMD+E / CTRL+E to open editor
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

        // CMD+\ / CTRL+\ to toggle fullscreen (only when editor is open)
        if ((e.metaKey || e.ctrlKey) && e.key === '\\' && isEditorOpen) {
            e.preventDefault();
            toggleFullscreen();
        }

        // ESC to close menu
        if (e.key === 'Escape' && isMenuOpen) {
            toggleActionMenu();
            return;
        }

        // Double Escape within 1 second to close editor
        if (e.key === 'Escape' && isEditorOpen) {
            const now = Date.now();
            if (now - lastEscapeTime < 1000) {
                toggleEditor();
                lastEscapeTime = 0;
            } else {
                lastEscapeTime = now;
            }
        }
    });
}
