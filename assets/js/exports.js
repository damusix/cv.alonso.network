// Import/Export Functionality

import { loadSavedData, saveCVData, saveEditorMode } from './storage.js';
import { loadSavedStyles, saveStyles } from './storage.js';
import { getDocumentTitle, renderCV } from './cv-renderer.js';
import { applyStyles } from './styles.js';
import { getEditorMode, getEditor } from './editor.js';
import { emit } from './observable.js';

export function exportCV() {
    try {
        const savedData = loadSavedData();
        const savedStyles = loadSavedStyles();
        const mode = getEditorMode();

        let content = '';

        // Add CV data section
        if (savedData.code) {
            content += `[cv-data js]\n${savedData.code}\n\n`;
        }

        // Add styles section if exists
        if (savedStyles) {
            content += `[cv-styles]\n${savedStyles}\n`;
        }

        // Create and download file
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const title = getDocumentTitle(savedData.result?.personal);

        a.href = url;
        a.download = `${title}.cvml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Emit export event
        emit('cv:export', { filename: `${title}.cvml`, mode });

    } catch (error) {

        emit('cv:export:error', {
            message: error.message
        });
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
            const dataJsMatch = content.match(/\[cv-data js\]\n([\s\S]*?)(?=\n\[|$)/);
            const stylesMatch = content.match(/\[cv-styles\]\n([\s\S]*?)$/);

            let cvData = null;
            let cvCode = null;

            // Extract CV data (JavaScript mode only)
            if (dataJsMatch) {
                cvCode = dataJsMatch[1].trim();
                const fn = new Function(cvCode);
                cvData = fn();

                // Save to localStorage
                saveCVData(cvCode, cvData);
                saveEditorMode('javascript');
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
                        // Update editor with imported JavaScript code
                        editor.setValue(cvCode);
                    }
                }

                // Emit import event
                emit('cv:import', { filename: file.name, mode: 'javascript' });
            } else {
                throw new Error('No valid CV data found in file');
            }

        } catch (error) {

            emit('cv:import:error', {
                message: error.message
            });
        }
    };

    input.click();
}
