// Keyboard Shortcuts

import { toggleEditor, applyChanges, getEditorMode } from './editor.js';
import { toggleActionMenu } from './action-menu.js';
import { toggleFullscreen } from './ui-utils.js';
import { showHelpModal } from './modal.js';
import { getCurrentAiScreen } from './ai/ui.js';
import { emit, on } from './observable.js';

let lastEscapeTime = 0;

const FocusableInputs = [
    'INPUT',
    'TEXTAREA',
    'SELECT'
];

const KEYPRESS_INTERVAL = 500; // milliseconds

// Track last pressed keys
const LastPressed = {};

// Track times keys were pressed
// { [key: string]: number }
const TimesPressed = {};

const checkTimesPressed = (key, times = 2, interval = KEYPRESS_INTERVAL) => {
    const now = Date.now();

    if (
        LastPressed[key] &&
        TimesPressed[key] >= times &&
        (now - LastPressed[key] <= interval)
    ) {
        // Reset count after check
        TimesPressed[key] = 0;
        return true;
    }

    return false;
}

const pressKey = (key) => {

    const now = Date.now();

    // Reset count if last press was longer than interval ago
    if (
        !LastPressed[key] ||
        (LastPressed[key] && (now - LastPressed[key] > KEYPRESS_INTERVAL))
    ) {
        TimesPressed[key] = 0;
    }

    LastPressed[key] = now;
    TimesPressed[key] = (TimesPressed[key] || 0) + 1;
}

export function initializeKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        const { isEditorFocused, isMenuOpen } = getElements();

        pressKey(e.key);

        // CMD+S / CTRL+S to save (only when Monaco editor is focused, not in AI mode)
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            emit('editor:save');
            emit('chat:save-settings');
            e.preventDefault();
            return;
        }

        // CMD+Enter / CTRL+Enter to send AI message
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            emit('chat:send');
            e.preventDefault();
            return;
        }

        // CMD+E / CTRL+E to open editor (mobile only)
        if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
            emit('editor:mobile-toggle');
            e.preventDefault();
            return;
        }

        // CMD+P / CTRL+P to print (override browser default)
        if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
            emit('cv:print');
            e.preventDefault();
            return;
        }

        // CMD+\ / CTRL+\ to toggle fullscreen
        if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
            emit('editor:full-screen');
            e.preventDefault();
            return;
        }

        // CMD+, / CTRL+, to toggle fullscreen
        if ((e.metaKey || e.ctrlKey) && e.key === ',') {

            // Don't block actual browser shortcut if pressed more than once
            if (checkTimesPressed(e.key, 2, 1000)) return;

            e.preventDefault();
            emit('chat:go-to-settings');

            return;
        }


        // Double Escape within 1 second to close editor (mobile only)
        if (e.key === 'Escape') {
            emit('escape');
            isMenuOpen && emit('menu:close');

            e.preventDefault();
            return;
        }

        // ? to open help modal (only when NOT typing in editor)
        if (e.key === '?' && !isEditorFocused) {

            if (FocusableInputs.includes(e.target.tagName)) return;

            emit('page:help');
            e.preventDefault();
            return;
        }
    });
}

const getElements = () => {
    const panel = document.getElementById('editorPanel');
    const menu = document.getElementById('actionMenu');
    const editorContainer = document.getElementById('editorContainer');
    const isEditorOpen = panel.classList.contains('open');
    const isMenuOpen = menu.classList.contains('show');
    const mode = getEditorMode();
    const aiScreen = getCurrentAiScreen();

    // Check if Monaco editor is focused
    const isEditorFocused = editorContainer && editorContainer.contains(document.activeElement);

    return {
        panel,
        menu,
        editorContainer,
        isEditorOpen,
        isMenuOpen,
        isEditorFocused,
        mode,
        aiScreen
    };
};



on('editor:save', () => {
    const { isEditorFocused, mode } = getElements();

    if (!isEditorFocused) return;
    if (mode === 'ai') return;

    applyChanges();
});

on('editor:full-screen', () => toggleFullscreen());



on('editor:mobile-toggle', () => {
    const { isEditorOpen, isMenuOpen } = getElements();

    isMenuOpen && toggleActionMenu();
    !isEditorOpen && toggleEditor();
});


on('chat:send', () => {
    const { mode } = getElements();

    if (mode !== 'ai') return;

    document.querySelector(
        '[data-action="send-message"]'
    )?.click();
});

on('chat:save-settings', () => {
    const { mode, aiScreen } = getElements();

    if (mode !== 'ai') return;
    if (aiScreen !== 'settings') return;

    document.getElementById('aiContainer')?.querySelector(
        '[data-action="save-settings"]'
    )?.click();
});

on('chat:go-to-settings', () => {
    const { mode } = getElements();

    if (mode !== 'ai') return;

    document.getElementById('aiContainer')?.querySelector(
        '[data-action="open-settings"]'
    )?.click();
});

on('chat:close-settings', () => {
    const { mode, aiScreen } = getElements();

    if (mode !== 'ai') return;
    if (aiScreen !== 'settings') return;

    document.getElementById('aiContainer')?.querySelector(
        '[data-action="back-to-chat"]'
    )?.click();
});


on('escape', () => {

    checkTimesPressed('Escape', 2) && emit('escape:double');
    emit('chat:close-settings');
});

on('escape:double', () => {
    const { isEditorOpen, mode, aiScreen } = getElements();

    if (mode === 'ai' && aiScreen === 'chat') {

        emit('chat:abort');
        return;
    };

    if (mode === 'ai') return;
    if (!isEditorOpen) return;


    toggleEditor();
});


on('cv:print', () => window.print());

on('menu:close', () => {
    const { isMenuOpen } = getElements();

    if (!isMenuOpen) return;

    toggleActionMenu();
});

on('page:help', () => showHelpModal());
