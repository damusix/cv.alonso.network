// Main Entry Point

import { cvData } from './config.js';
import { renderCV } from './cv-renderer.js';
import { initializeEditor, toggleEditor, setEditorMode, applyChanges, resetData } from './editor.js';
import { initializeActionMenu, toggleActionMenu, openEditor, printCV } from './action-menu.js';
import { initializeKeyboardShortcuts } from './keyboard.js';
import { toggleFullscreen } from './ui-utils.js';
import { loadAndApplyStyles } from './styles.js';
import { initializeModal, showHelpModal, showPromptModal, showPrivacyModal, closeModal, copyModalMarkdown, isFirstVisit, markVisited } from './modal.js';
import { exportCV, importCV } from './exports.js';
import { initializeSplitPane, restoreEditorPaneState } from './split-pane.js';
import { initializeToasts, notify } from './toast.js';

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

    // Initialize split pane
    initializeSplitPane();

    // Restore editor pane state
    restoreEditorPaneState();

    // Initialize toast notifications
    initializeToasts();

    // Show help modal on first visit
    if (isFirstVisit()) {
        showHelpModal();
        markVisited();
    }

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
    window.showPromptModal = showPromptModal;
    window.showPrivacyModal = showPrivacyModal;
    window.closeModal = closeModal;
    window.copyModalMarkdown = copyModalMarkdown;
    window.exportCV = exportCV;
    window.importCV = importCV;
    window.notify = notify;
})();
