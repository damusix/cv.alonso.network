// Editor Management

import { cvData } from './config.js';
import { CVDataSchema } from './validation.js';
import { loadSavedData, saveCVData, saveEditorMode, clearSavedData } from './storage.js';
import { saveEditorState, loadEditorState, saveDraft, loadDraft, clearDraft, hasDraft, saveCursorPosition, loadCursorPosition } from './storage.js';
import { renderCV } from './cv-renderer.js';
import { showError, hideError, toggleFullscreen as uiToggleFullscreen } from './ui-utils.js';
import { applyStyles, getCurrentStyles, resetStyles } from './styles.js';

let editor;
let editorMode = 'json';
let autoSaveTimeout;

export function getEditor() {
    return editor;
}

export function getEditorMode() {
    return editorMode;
}

export async function initializeEditor() {
    const savedData = loadSavedData();
    const editorState = loadEditorState();

    if (savedData.mode) {
        editorMode = savedData.mode;
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
            initialLanguage = editorMode === 'css' ? 'css' : editorMode;
        } else if (editorMode === 'css') {
            // CSS mode - load styles asynchronously
            initialValue = await getCurrentStyles();
            initialLanguage = 'css';
        } else if (savedData.code && savedData.result) {
            // Validate that code and result are in sync before using saved code
            // This prevents loading corrupt code from localStorage
            try {
                let codeResult;
                if (editorMode === 'json') {
                    codeResult = JSON.parse(savedData.code);
                } else {
                    const fn = new Function(savedData.code);
                    codeResult = fn();
                }

                // If code executes and produces the same result, use it
                if (JSON.stringify(codeResult) === JSON.stringify(savedData.result)) {
                    initialValue = savedData.code;
                    initialLanguage = editorMode;
                } else {
                    // Code and result are out of sync - regenerate from result (source of truth)
                    console.warn('localStorage code/result mismatch detected, regenerating from result');
                    const dataToUse = savedData.result;
                    initialValue = editorMode === 'json'
                        ? JSON.stringify(dataToUse, null, 4)
                        : `// Edit your CV data\n// Last line must be a return statement\n\nreturn ${JSON.stringify(dataToUse, null, 4)};`;
                    initialLanguage = editorMode;
                    // Fix localStorage immediately
                    localStorage.setItem('cv-data-code', initialValue);
                }
            } catch (e) {
                // Code is invalid - regenerate from result
                console.warn('Invalid code in localStorage, regenerating from result', e);
                const dataToUse = savedData.result;
                initialValue = editorMode === 'json'
                    ? JSON.stringify(dataToUse, null, 4)
                    : `// Edit your CV data\n// Last line must be a return statement\n\nreturn ${JSON.stringify(dataToUse, null, 4)};`;
                initialLanguage = editorMode;
                // Fix localStorage immediately
                localStorage.setItem('cv-data-code', initialValue);
            }
        } else if (savedData.code) {
            // No result to validate against, use saved code as-is
            initialValue = savedData.code;
            initialLanguage = editorMode;
        } else {
            // Generate default code based on mode
            const dataToUse = savedData.result || cvData;
            initialValue = editorMode === 'json'
                ? JSON.stringify(dataToUse, null, 4)
                : `// Edit your CV data\n// Last line must be a return statement\n\nreturn ${JSON.stringify(dataToUse, null, 4)};`;
            initialLanguage = editorMode;
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

        // Restore editor state
        if (editorState) {
            if (editorState.isOpen) {
                const panel = document.getElementById('editorPanel');
                panel.classList.add('open');
                // Focus editor if it's open
                if (editor) {
                    editor.focus();
                }
            }
            if (editorState.isFullscreen) {
                const panel = document.getElementById('editorPanel');
                panel.classList.add('fullscreen');
                document.getElementById('fullscreenIcon').className = 'fas fa-compress';
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
            // Generate default code
            const dataToUse = savedData.result || cvData;
            return mode === 'json'
                ? JSON.stringify(dataToUse, null, 4)
                : `// Edit your CV data\n// Last line must be a return statement\n\nreturn ${JSON.stringify(dataToUse, null, 4)};`;
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
    document.querySelectorAll('.mode-toggle button').forEach(btn => {
        const mode = btn.dataset.mode;
        const baseName = mode === 'json' ? 'JSON' :
                         mode === 'javascript' ? 'JavaScript' : 'Styles';
        btn.textContent = hasDraft(mode) ? `${baseName}*` : baseName;
    });
}

export function toggleEditor() {
    const panel = document.getElementById('editorPanel');
    const isOpen = panel.classList.contains('open');

    // If closing the editor and it's in fullscreen, exit fullscreen first
    if (isOpen && panel.classList.contains('fullscreen')) {
        toggleFullscreen();
    }

    panel.classList.toggle('open');

    // Save editor state
    saveEditorState({
        isOpen: !isOpen,
        isFullscreen: panel.classList.contains('fullscreen')
    });
}

export function toggleFullscreen() {
    const panel = document.getElementById('editorPanel');
    const isFullscreen = panel.classList.contains('fullscreen');

    // Call the UI utility function
    uiToggleFullscreen();

    // Save editor state
    saveEditorState({
        isOpen: panel.classList.contains('open'),
        isFullscreen: !isFullscreen
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
        } else if (previousMode === 'css') {
            // Switching from CSS to data mode - use saved data
            const savedData = loadSavedData();
            const dataToUse = savedData.result || cvData;
            newValue = mode === 'json'
                ? JSON.stringify(dataToUse, null, 4)
                : `// Edit your CV data\n// Last line must be a return statement\n\nreturn ${JSON.stringify(dataToUse, null, 4)};`;
        } else if (mode === 'json') {
            // Converting from JS to JSON
            if (previousMode === 'javascript') {
                const fn = new Function(currentValue);
                const data = fn();
                newValue = JSON.stringify(data, null, 4);
            } else {
                newValue = currentValue;
            }
        } else {
            // Converting from JSON to JS
            if (previousMode === 'json') {
                const data = JSON.parse(currentValue);
                newValue = `// Edit your CV data\n// Last line must be a return statement\n\nreturn ${JSON.stringify(data, null, 4)};`;
            } else {
                newValue = currentValue;
            }
        }

        // Set language
        monaco.editor.setModelLanguage(editor.getModel(), mode === 'css' ? 'css' : mode);
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
        hideError();
    } catch (e) {
        showError(`Cannot convert to ${mode.toUpperCase()}: ${e.message}`);
        editorMode = previousMode; // Revert on error
    }
}

function updateModeToggle() {
    document.querySelectorAll('.mode-toggle button').forEach(btn => {
        if (btn.dataset.mode === editorMode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

export function applyChanges() {
    if (!editor) return;

    // Cancel any pending auto-save
    clearTimeout(autoSaveTimeout);

    const code = editor.getValue();
    hideError();

    try {
        if (editorMode === 'css') {
            // Apply CSS styles
            applyStyles(code);
        } else {
            // Apply CV data
            let data;

            if (editorMode === 'json') {
                data = JSON.parse(code);
            } else {
                const fn = new Function(code);
                data = fn();
            }

            // Validate with Zod
            const result = CVDataSchema.safeParse(data);

            if (!result.success) {
                // Format Zod errors for display
                const errors = result.error.issues.map(issue =>
                    `${issue.path.join('.')}: ${issue.message}`
                ).join('\n');
                throw new Error(`Validation failed:\n${errors}`);
            }

            // Save both the code and the result to localStorage
            saveCVData(code, result.data);

            // Re-render CV
            renderCV(result.data);
        }

        // Clear draft after successful apply
        clearDraft(editorMode);
        updateModeIndicators();

        // Show success feedback (optional - could add visual feedback here)
    } catch (e) {
        showError(e.message);
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

            const defaultValue = editorMode === 'json'
                ? JSON.stringify(cvData, null, 4)
                : `// Edit your CV data\n// Last line must be a return statement\n\nreturn ${JSON.stringify(cvData, null, 4)};`;

            editor.setValue(defaultValue);
            renderCV(cvData);
        }

        // Clear draft after reset
        clearDraft(editorMode);
        updateModeIndicators();

        hideError();
    }
}
