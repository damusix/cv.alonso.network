// Action Menu Controls

import { toggleEditor } from './editor.js';

export function toggleActionMenu() {
    const menu = document.getElementById('actionMenu');
    menu.classList.toggle('show');
}

export function openEditor() {
    toggleActionMenu(); // Close menu
    if (!document.getElementById('editorPanel').classList.contains('open')) {
        toggleEditor(); // Open editor
    }
}

export function printCV() {
    toggleActionMenu(); // Close menu
    window.print();
}

export function initializeActionMenu() {
    // Close menu when clicking outside
    document.addEventListener('click', function(e) {
        const menu = document.getElementById('actionMenu');
        const container = document.querySelector('.action-menu-container');

        if (menu.classList.contains('show') && !container.contains(e.target)) {
            toggleActionMenu();
        }
    });
}
