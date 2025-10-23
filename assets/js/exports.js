// Import/Export Functionality

import { loadSavedData, saveCVData, saveEditorMode } from './storage.js';
import { loadSavedStyles, saveStyles } from './storage.js';
import { renderCV } from './cv-renderer.js';
import { applyStyles } from './styles.js';
import { getEditorMode, getEditor } from './editor.js';
import { showError, showSuccess, hideError } from './ui-utils.js';

export function exportCV() {
    try {
        const savedData = loadSavedData();
        const savedStyles = loadSavedStyles();
        const mode = getEditorMode();

        let content = '';

        // Add CV data section
        if (savedData.code) {
            const dataHeader = mode === 'javascript' ? '[cv-data js]' : '[cv-data json]';
            content += `${dataHeader}\n${savedData.code}\n\n`;
        } else if (savedData.result) {
            content += `[cv-data json]\n${JSON.stringify(savedData.result, null, 4)}\n\n`;
        }

        // Add styles section if exists
        if (savedStyles) {
            content += `[cv-styles]\n${savedStyles}\n`;
        }

        // Create and download file
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cv-export.cvml';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        hideError();
    } catch (error) {
        showError(`Export failed: ${error.message}`);
    }
}

export function importCV() {
    // Create file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.cvml';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const content = await file.text();

            // Parse sections using regex
            const dataJsonMatch = content.match(/\[cv-data json\]\n([\s\S]*?)(?=\n\[|$)/);
            const dataJsMatch = content.match(/\[cv-data js\]\n([\s\S]*?)(?=\n\[|$)/);
            const stylesMatch = content.match(/\[cv-styles\]\n([\s\S]*?)$/);

            let cvData = null;
            let cvMode = 'json';

            // Extract CV data
            if (dataJsMatch) {
                // Try JavaScript mode first (since it can have comments)
                const jsCode = dataJsMatch[1].trim();
                const fn = new Function(jsCode);
                cvData = fn();
                cvMode = 'javascript';

                // Save to localStorage
                saveCVData(jsCode, cvData);
                saveEditorMode('javascript');
            } else if (dataJsonMatch) {
                const jsonCode = dataJsonMatch[1].trim();
                cvData = JSON.parse(jsonCode);
                cvMode = 'json';

                // Save to localStorage
                saveCVData(jsonCode, cvData);
                saveEditorMode('json');
            }

            // Extract and apply styles
            if (stylesMatch) {
                const styles = stylesMatch[1].trim();
                saveStyles(styles);
                applyStyles(styles);
            }

            // Render CV if data was found
            if (cvData) {
                renderCV(cvData);

                // Update editor if open
                const editor = getEditor();
                if (editor) {
                    if (getEditorMode() === 'css') {
                        // If in CSS mode, just refresh when switching modes
                    } else {
                        // Update editor with imported data
                        const editorValue = cvMode === 'json'
                            ? JSON.stringify(cvData, null, 4)
                            : dataJsMatch[1].trim();
                        editor.setValue(editorValue);
                    }
                }

                hideError();

                // Show success message briefly
                showSuccess('Import successful!');
                setTimeout(() => {
                    hideError();
                }, 2000);
            } else {
                throw new Error('No valid CV data found in file');
            }

        } catch (error) {
            showError(`Import failed: ${error.message}`);
        }
    };

    input.click();
}
