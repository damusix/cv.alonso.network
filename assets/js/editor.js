// Editor Management

import { cvData } from './config.js';
import { CVDataSchema } from './validation.js';
import { loadSavedData, saveCVData, saveEditorMode, clearSavedData } from './storage.js';
import { renderCV } from './cv-renderer.js';
import { showError, hideError, toggleFullscreen } from './ui-utils.js';

let editor;
let editorMode = 'json';

export function getEditor() {
    return editor;
}

export function getEditorMode() {
    return editorMode;
}

export function initializeEditor() {
    const savedData = loadSavedData();

    if (savedData.mode) {
        editorMode = savedData.mode;
    }

    require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } });
    require(['vs/editor/editor.main'], function () {
        let initialValue;

        if (savedData.code) {
            // Use saved code
            initialValue = savedData.code;
        } else {
            // Generate default code based on mode
            const dataToUse = savedData.result || cvData;
            initialValue = editorMode === 'json'
                ? JSON.stringify(dataToUse, null, 4)
                : `// Edit your CV data\n// Last line must be a return statement\n\nreturn ${JSON.stringify(dataToUse, null, 4)};`;
        }

        editor = monaco.editor.create(document.getElementById('editorContainer'), {
            value: initialValue,
            language: editorMode,
            theme: 'vs',
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

export function setEditorMode(mode) {
    if (!editor) return;

    const previousMode = editorMode;
    editorMode = mode;
    saveEditorMode(mode);

    const currentValue = editor.getValue();
    let newValue;

    try {
        if (mode === 'json') {
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

        monaco.editor.setModelLanguage(editor.getModel(), mode);
        editor.setValue(newValue);

        // Save the converted code
        localStorage.setItem('cv-data-code', newValue);

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

        // Show success feedback (optional - could add visual feedback here)
    } catch (e) {
        showError(e.message);
    }
}

export function resetData() {
    if (!editor) return;

    if (confirm('Reset to default data? This will clear your saved changes.')) {
        clearSavedData();

        const defaultValue = editorMode === 'json'
            ? JSON.stringify(cvData, null, 4)
            : `// Edit your CV data\n// Last line must be a return statement\n\nreturn ${JSON.stringify(cvData, null, 4)};`;

        editor.setValue(defaultValue);
        renderCV(cvData);
        hideError();
    }
}
