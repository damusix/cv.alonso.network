// Editor Management

import { cvData } from './config.js';
import { CVDataSchema } from './validation.js';
import { loadSavedData, saveCVData, saveEditorMode, clearSavedData } from './storage.js';
import { renderCV } from './cv-renderer.js';
import { showError, hideError, toggleFullscreen } from './ui-utils.js';
import { applyStyles, getCurrentStyles, resetStyles } from './styles.js';

let editor;
let editorMode = 'json';

export function getEditor() {
    return editor;
}

export function getEditorMode() {
    return editorMode;
}

export async function initializeEditor() {
    const savedData = loadSavedData();

    if (savedData.mode) {
        editorMode = savedData.mode;
    }

    require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } });
    require(['vs/editor/editor.main'], async function () {
        let initialValue;
        let initialLanguage;

        if (editorMode === 'css') {
            // CSS mode - load styles asynchronously
            initialValue = await getCurrentStyles();
            initialLanguage = 'css';
        } else if (savedData.code) {
            // Use saved code
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

        // Update mode toggle UI
        updateModeToggle();
    });

    return savedData;
}

export function toggleEditor() {
    const panel = document.getElementById('editorPanel');
    const isOpen = panel.classList.contains('open');

    // If closing the editor and it's in fullscreen, exit fullscreen first
    if (isOpen && panel.classList.contains('fullscreen')) {
        toggleFullscreen();
    }

    panel.classList.toggle('open');
}

export async function setEditorMode(mode) {
    if (!editor) return;

    const previousMode = editorMode;
    editorMode = mode;
    saveEditorMode(mode);

    const currentValue = editor.getValue();
    let newValue;

    try {
        if (mode === 'css') {
            // Switching to CSS mode - load styles asynchronously
            newValue = await getCurrentStyles();
            monaco.editor.setModelLanguage(editor.getModel(), 'css');
        } else if (previousMode === 'css') {
            // Switching from CSS to data mode
            const dataToUse = cvData;
            newValue = mode === 'json'
                ? JSON.stringify(dataToUse, null, 4)
                : `// Edit your CV data\n// Last line must be a return statement\n\nreturn ${JSON.stringify(dataToUse, null, 4)};`;
            monaco.editor.setModelLanguage(editor.getModel(), mode);
        } else if (mode === 'json') {
            // Converting from JS to JSON
            if (previousMode === 'javascript') {
                const fn = new Function(currentValue);
                const data = fn();
                newValue = JSON.stringify(data, null, 4);
            } else {
                newValue = currentValue;
            }
            monaco.editor.setModelLanguage(editor.getModel(), mode);
        } else {
            // Converting from JSON to JS
            if (previousMode === 'json') {
                const data = JSON.parse(currentValue);
                newValue = `// Edit your CV data\n// Last line must be a return statement\n\nreturn ${JSON.stringify(data, null, 4)};`;
            } else {
                newValue = currentValue;
            }
            monaco.editor.setModelLanguage(editor.getModel(), mode);
        }

        editor.setValue(newValue);

        // Save the converted code (only for non-CSS modes)
        if (mode !== 'css') {
            localStorage.setItem('cv-data-code', newValue);
        }

        updateModeToggle();
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

        // Show success feedback (optional - could add visual feedback here)
    } catch (e) {
        showError(e.message);
    }
}

export async function resetData() {
    if (!editor) return;

    const confirmMessage = editorMode === 'css'
        ? 'Reset to default styles? This will clear your saved changes.'
        : 'Reset to default data? This will clear your saved changes.';

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
        hideError();
    }
}
