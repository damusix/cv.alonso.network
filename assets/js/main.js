// Main Entry Point

import { cvData } from './config.js';
import { renderCV } from './cv-renderer.js';
import { initializeEditor, toggleEditor, setEditorMode, applyChanges, resetData } from './editor.js';
import { initializeActionMenu, toggleActionMenu, openEditor, printCV } from './action-menu.js';
import { initializeKeyboardShortcuts } from './keyboard.js';
import { toggleFullscreen } from './ui-utils.js';
import { loadAndApplyStyles } from './styles.js';
import { initializeModal, showHelpModal, closeModal } from './modal.js';
import { exportCV, importCV } from './exports.js';

// Async initialization
(async function() {
    // Initialize styles first (so they apply before rendering)
    await loadAndApplyStyles();

    // Initialize with saved data if available
    const savedData = await initializeEditor();
    if (savedData.result) {
        renderCV(savedData.result);
    } else {
        renderCV(cvData);
    }

    // Initialize action menu
    initializeActionMenu();

    // Initialize keyboard shortcuts
    initializeKeyboardShortcuts();

    // Initialize modal
    initializeModal();

    // Expose functions to window for onclick handlers
    window.toggleEditor = toggleEditor;
    window.toggleActionMenu = toggleActionMenu;
    window.openEditor = openEditor;
    window.printCV = printCV;
    window.toggleFullscreen = toggleFullscreen;
    window.setEditorMode = setEditorMode;
    window.applyChanges = applyChanges;
    window.resetData = resetData;
    window.showHelpModal = showHelpModal;
    window.closeModal = closeModal;
    window.exportCV = exportCV;
    window.importCV = importCV;
})();
