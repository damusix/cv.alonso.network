// Main Entry Point

import { cvData } from './config.js?v=2026.03.27.1';
import { renderCV } from './cv-renderer.js?v=2026.03.27.1';
import { initializeEditor, toggleEditor, setEditorMode, applyChanges, resetData } from './editor.js?v=2026.03.27.1';
import { initializeActionMenu, toggleActionMenu, openEditor, printCV } from './action-menu.js?v=2026.03.27.1';
import { initializeKeyboardShortcuts } from './keyboard.js?v=2026.03.27.1';
import { toggleFullscreen } from './ui-utils.js?v=2026.03.27.1';
import { loadAndApplyStyles } from './styles.js?v=2026.03.27.1';
import { initializeModal, showHelpModal, showPromptModal, showPrivacyModal, closeModal, copyModalMarkdown, isFirstVisit, markVisited } from './modal.js?v=2026.03.27.1';
import { exportCV, importCV } from './exports.js?v=2026.03.27.1';
import { initializeSplitPane, restoreEditorPaneState } from './split-pane.js?v=2026.03.27.1';
import { initializeToasts, notify } from './toast.js?v=2026.03.27.1';
import { on } from './observable.js?v=2026.03.27.1';

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
    window.applyCvFromAI = async (...args) => {
        const { applyCvFromAI } = await import('./ai/ui.js');
        return applyCvFromAI(...args);
    };

    on('ai:cv-applied', ({ data }) => {
        if (data && data.cvData) {
            renderCV(data.cvData);
        }
    });
})();
