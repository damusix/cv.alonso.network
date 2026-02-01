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

const defaultValue = (overrideData) => {

    const data = JSON.stringify(overrideData || cvData, null, 4);

    return `${defaultMessage}\n\nreturn ${data};`;
}

export async function initializeEditor() {
    const savedData = loadSavedData();
    const editorState = loadEditorState();

    // Default to javascript mode, or use saved mode if it's valid
    const validModes = { javascript: true, css: true, ai: true };
    if (savedData.mode && validModes[savedData.mode]) {
        editorMode = savedData.mode;
    } else {
        editorMode = 'javascript';
    }

    // If starting in AI mode, show AI container and hide editor
    if (editorMode === 'ai') {
        document.getElementById('editorContainer').style.display = 'none';
        document.getElementById('aiContainer').style.display = 'flex';
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
                    initialValue = defaultValue(savedData.result);
                    initialLanguage = 'javascript';
                    // Fix localStorage immediately
                    localStorage.setItem('cv-data-code', initialValue);
                }
            } catch (e) {
                // Code is invalid - regenerate from result
                console.warn('Invalid code in localStorage, regenerating from result', e);
                initialValue = defaultValue(savedData.result);
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
            initialValue = defaultValue(savedData.result);
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

        // Lazy-initialize AI module if starting in AI mode
        if (editorMode === 'ai' && !window._aiInitialized) {
            const aiContainer = document.getElementById('aiContainer');
            const { initializeAI } = await import('./ai/ui.js');
            await initializeAI(aiContainer);
            window._aiInitialized = true;
        }

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
            return defaultValue(savedData.result);
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
    const baseNames = { javascript: 'JavaScript', css: 'Styles', ai: 'AI Chat' };
    document.querySelectorAll('.editor-tab').forEach(tab => {
        const mode = tab.dataset.mode;
        const baseName = baseNames[mode] || mode;
        const tabLabel = tab.querySelector('.tab-label');
        if (tabLabel) {
            tabLabel.textContent = (mode !== 'ai' && hasDraft(mode)) ? `${baseName} ●` : baseName;
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
    if (!editor && mode !== 'ai') return;

    const previousMode = editorMode;

    // Save draft for current mode before switching (only for Monaco modes)
    if (previousMode !== 'ai' && editor) {
        const currentValue = editor.getValue();
        const committedValue = await getCommittedValue(previousMode);

        if (currentValue !== committedValue) {
            saveDraft(previousMode, currentValue);
        } else {
            clearDraft(previousMode);
        }
    }

    editorMode = mode;
    saveEditorMode(mode);

    const editorContainer = document.getElementById('editorContainer');
    const aiContainer = document.getElementById('aiContainer');

    // Toggle containers
    if (mode === 'ai') {
        editorContainer.style.display = 'none';
        aiContainer.style.display = 'flex';

        // Lazy-initialize AI module
        if (!window._aiInitialized) {
            const { initializeAI } = await import('./ai/ui.js');
            await initializeAI(aiContainer);
            window._aiInitialized = true;
        }

        updateModeToggle();
        updateModeIndicators();
        emit('editor:mode-change', { mode, previousMode });
        return;
    }

    // Switching away from AI to a Monaco mode
    aiContainer.style.display = 'none';
    editorContainer.style.display = '';

    let newValue;

    try {
        const draft = loadDraft(mode);

        if (draft) {
            newValue = draft;
        } else if (mode === 'css') {
            newValue = await getCurrentStyles();
        } else {
            const savedData = loadSavedData();
            if (savedData.code) {
                newValue = savedData.code;
            } else {
                newValue = defaultValue(savedData.result);
            }
        }

        monaco.editor.setModelLanguage(editor.getModel(), mode === 'css' ? 'css' : 'javascript');
        editor.setValue(newValue);

        if (mode !== 'css' && !draft) {
            localStorage.setItem('cv-data-code', newValue);
        }

        const savedCursor = loadCursorPosition(mode);
        if (savedCursor) {
            if (savedCursor.position) {
                editor.setPosition(savedCursor.position);
            }
            if (savedCursor.scrollTop !== undefined) {
                editor.setScrollTop(savedCursor.scrollTop);
            }
        }

        editor.focus();

        updateModeToggle();
        updateModeIndicators();
        emit('editor:mode-change', { mode, previousMode });
    } catch (e) {
        emit('editor:mode-change:error', {
            message: `Cannot convert to ${mode.toUpperCase()}: ${e.message}`
        });
        editorMode = previousMode;
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
    if (!editor || editorMode === 'ai') return;

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
