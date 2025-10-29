// Editor Management

import { cvData, defaultMessage } from './config.js';
import { CVDataSchema } from './validation.js';
import { loadSavedData, saveCVData, saveEditorMode, clearSavedData } from './storage.js';
import { saveEditorState, loadEditorState, saveDraft, loadDraft, clearDraft, hasDraft, saveCursorPosition, loadCursorPosition } from './storage.js';
import { renderCV } from './cv-renderer.js';
import { toggleFullscreen } from './ui-utils.js';
import { applyStyles, getCurrentStyles, resetStyles } from './styles.js';
import { toggleEditorPane, isEditorPaneOpen } from './split-pane.js';
import { emit, on } from './observable.js';

let editor;
let editorMode = 'javascript';
let autoSaveTimeout;

export function getEditor() {
    return editor;
}

export function getEditorMode() {
    return editorMode;
}

const defaultValue = () => {

    const data = JSON.stringify(cvData, null, 4);

    return `${defaultMessage}\n\nreturn ${data};`;
}

export async function initializeEditor() {
    const savedData = loadSavedData();
    const editorState = loadEditorState();

    // Default to javascript mode, or use saved mode if it's valid (javascript/css only)
    if (savedData.mode && (savedData.mode === 'javascript' || savedData.mode === 'css')) {
        editorMode = savedData.mode;
    } else {
        editorMode = 'javascript';
    }

    require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } });
    require(['vs/editor/editor.main'], async function () {
        let initialValue;
        let initialLanguage;

        // Try to load draft first, fall back to saved/default
        const draft = loadDraft(editorMode);

        if (draft) {
            // Use draft content
            initialValue = draft;
            initialLanguage = editorMode === 'css' ? 'css' : 'javascript';
        } else if (editorMode === 'css') {
            // CSS mode - load styles asynchronously
            initialValue = await getCurrentStyles();
            initialLanguage = 'css';
        } else if (savedData.code && savedData.result) {
            // Validate that code and result are in sync before using saved code
            // This prevents loading corrupt code from localStorage
            try {
                const fn = new Function(savedData.code);
                const codeResult = fn();

                // If code executes and produces the same result, use it
                if (JSON.stringify(codeResult) === JSON.stringify(savedData.result)) {
                    initialValue = savedData.code;
                    initialLanguage = 'javascript';
                } else {
                    // Code and result are out of sync - regenerate from result (source of truth)
                    console.warn('localStorage code/result mismatch detected, regenerating from result');
                    const dataToUse = savedData.result;
                    initialValue = defaultValue();
                    initialLanguage = 'javascript';
                    // Fix localStorage immediately
                    localStorage.setItem('cv-data-code', initialValue);
                }
            } catch (e) {
                // Code is invalid - regenerate from result
                console.warn('Invalid code in localStorage, regenerating from result', e);
                const dataToUse = savedData.result;
                initialValue = defaultValue();
                initialLanguage = 'javascript';
                // Fix localStorage immediately
                localStorage.setItem('cv-data-code', initialValue);
            }
        } else if (savedData.code) {
            // No result to validate against, use saved code as-is
            initialValue = savedData.code;
            initialLanguage = 'javascript';
        } else {
            // Generate default code
            const dataToUse = savedData.result || cvData;
            initialValue = defaultValue();
            initialLanguage = 'javascript';
        }

        editor = monaco.editor.create(document.getElementById('editorContainer'), {
            value: initialValue,
            language: initialLanguage,
            theme: 'vs-dark',
            automaticLayout: true,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 4,
            insertSpaces: true
        });

        // Setup auto-save on content change
        editor.onDidChangeModelContent(() => {
            autoSaveDraft();
        });

        // Setup cursor position tracking
        editor.onDidChangeCursorPosition(() => {
            const position = editor.getPosition();
            const scrollTop = editor.getScrollTop();
            saveCursorPosition(editorMode, { position, scrollTop });
        });

        // Restore cursor position for current mode
        const savedCursor = loadCursorPosition(editorMode);
        if (savedCursor) {
            if (savedCursor.position) {
                editor.setPosition(savedCursor.position);
            }
            if (savedCursor.scrollTop !== undefined) {
                editor.setScrollTop(savedCursor.scrollTop);
            }
            // Focus the editor
            editor.focus();
        }

        // Update mode toggle UI
        updateModeToggle();
        updateModeIndicators();

        // Restore editor state (compatibility with old system)
        // Note: split-pane now handles open state, but we keep this for fullscreen
        if (editorState) {
            if (editorState.isFullscreen) {
                const container = document.querySelector('.split-view-container');
                container.classList.add('fullscreen');
                const fabIcon = document.getElementById('fabFullscreenIcon');
                if (fabIcon) fabIcon.className = 'fas fa-compress';
            }
        }
    });

    return savedData;
}

async function getCommittedValue(mode) {
    if (mode === 'css') {
        return await getCurrentStyles();
    } else {
        const savedData = loadSavedData();
        if (savedData.code) {
            return savedData.code;
        } else {
            // Generate default JavaScript code
            const dataToUse = savedData.result || cvData;
            return defaultValue();
        }
    }
}

function autoSaveDraft() {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(async () => {
        const content = editor.getValue();
        const committedValue = await getCommittedValue(editorMode);

        // Only save draft if content differs from committed
        if (content !== committedValue) {
            saveDraft(editorMode, content);
        } else {
            clearDraft(editorMode);
        }

        updateModeIndicators();
    }, 500);
}

function updateModeIndicators() {
    document.querySelectorAll('.editor-tab').forEach(tab => {
        const mode = tab.dataset.mode;
        const baseName = mode === 'javascript' ? 'JavaScript' : 'Styles';
        const tabLabel = tab.querySelector('.tab-label');
        if (tabLabel) {
            tabLabel.textContent = hasDraft(mode) ? `${baseName} ●` : baseName;
        }
    });
}

export function toggleEditor() {
    const container = document.querySelector('.split-view-container');

    // If in fullscreen, exit fullscreen first
    if (container.classList.contains('fullscreen')) {
        toggleFullscreen();
    }

    // Use split-pane toggle
    toggleEditorPane();

    // Save editor state (for compatibility)
    saveEditorState({
        isOpen: isEditorPaneOpen(),
        isFullscreen: container.classList.contains('fullscreen')
    });
}

export async function setEditorMode(mode) {
    if (!editor) return;

    const previousMode = editorMode;

    // Save draft for current mode before switching (only if it differs from committed)
    const currentValue = editor.getValue();
    const committedValue = await getCommittedValue(previousMode);

    if (currentValue !== committedValue) {
        saveDraft(previousMode, currentValue);
    } else {
        // Content matches committed, clear any existing draft
        clearDraft(previousMode);
    }

    editorMode = mode;
    saveEditorMode(mode);

    let newValue;

    try {
        // Check if new mode has a draft
        const draft = loadDraft(mode);

        if (draft) {
            // Use draft content
            newValue = draft;
        } else if (mode === 'css') {
            // Switching to CSS mode - load styles asynchronously
            newValue = await getCurrentStyles();
        } else {
            // Switching from CSS to JavaScript - use saved data
            const savedData = loadSavedData();
            const dataToUse = savedData.result || cvData;
            newValue = defaultValue();
        }

        // Set language
        monaco.editor.setModelLanguage(editor.getModel(), mode === 'css' ? 'css' : 'javascript');
        editor.setValue(newValue);

        // Save the converted code (only for non-CSS modes and when not using draft)
        if (mode !== 'css' && !draft) {
            localStorage.setItem('cv-data-code', newValue);
        }

        // Restore cursor position for new mode
        const savedCursor = loadCursorPosition(mode);
        if (savedCursor) {
            if (savedCursor.position) {
                editor.setPosition(savedCursor.position);
            }
            if (savedCursor.scrollTop !== undefined) {
                editor.setScrollTop(savedCursor.scrollTop);
            }
        }

        // Focus editor after mode switch
        editor.focus();

        updateModeToggle();
        updateModeIndicators();

        // Emit mode change event
        emit('editor:mode-change', { mode, previousMode });
    } catch (e) {

        emit('editor:mode-change:error',{
            message: `Cannot convert to ${mode.toUpperCase()}: ${e.message}`
        });

        editorMode = previousMode; // Revert on error
    }
}

function updateModeToggle() {
    document.querySelectorAll('.editor-tab').forEach(tab => {
        if (tab.dataset.mode === editorMode) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
}

export function applyChanges() {
    if (!editor) return;

    // Cancel any pending auto-save
    clearTimeout(autoSaveTimeout);

    const code = editor.getValue();

    try {
        if (editorMode === 'css') {
            // Apply CSS styles
            applyStyles(code);
        } else {
            // Apply CV data (JavaScript mode)
            const fn = new Function(code);
            const data = fn();

            // Validate with Zod
            const result = CVDataSchema.safeParse(data);

            if (!result.success) {
                // Format Zod errors for display
                const errors = result.error.issues.map(issue =>
                    `${issue.path.join('.')}: ${issue.message}`
                ).join('\n');
                throw new Error(`Validation failed:\n${errors}`);
            }

            saveCVData(code, result.data);
            renderCV(result.data);
        }

        // Clear draft after successful apply
        clearDraft(editorMode);
        updateModeIndicators();

        // Emit save event
        emit('cv:save', { mode: editorMode });

    } catch (e) {

        emit('editor:save:error', {
            message: e.message
        });
    }
}

export async function resetData() {
    if (!editor) return;

    const confirmMessage = editorMode === 'css'
        ? 'Reset to default styles? This will clear your saved changes and draft.'
        : 'Reset to default data? This will clear your saved changes and draft.';

    if (confirm(confirmMessage)) {
        if (editorMode === 'css') {
            const defaultValue = await resetStyles();
            editor.setValue(defaultValue);
        } else {
            clearSavedData();

            const resetValue = defaultValue();

            editor.setValue(resetValue);
            renderCV(cvData);
        }

        // Clear draft after reset
        clearDraft(editorMode);
        updateModeIndicators();
        applyChanges();

        // Emit reset event
        emit('cv:reset', { mode: editorMode });
    }
}

// Listen for fullscreen events to save state
on('editor:fullscreen', ({ data }) => {
    saveEditorState({
        isOpen: isEditorPaneOpen(),
        isFullscreen: data.isFullscreen
    });
});
