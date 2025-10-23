// Local Storage Management

import { STORAGE_CODE_KEY, STORAGE_RESULT_KEY, STORAGE_MODE_KEY, STORAGE_STYLES_KEY } from './config.js';

export function loadSavedData() {
    const savedCode = localStorage.getItem(STORAGE_CODE_KEY);
    const savedResult = localStorage.getItem(STORAGE_RESULT_KEY);
    const savedMode = localStorage.getItem(STORAGE_MODE_KEY);

    // Always use the saved result for rendering (if available)
    let resultData = null;
    if (savedResult) {
        try {
            resultData = JSON.parse(savedResult);
        } catch (e) {
            console.error('Failed to parse saved result:', e);
        }
    }

    return {
        code: savedCode,
        result: resultData,
        mode: savedMode
    };
}

export function saveCVData(code, result) {
    localStorage.setItem(STORAGE_CODE_KEY, code);
    localStorage.setItem(STORAGE_RESULT_KEY, JSON.stringify(result));
}

export function saveEditorMode(mode) {
    localStorage.setItem(STORAGE_MODE_KEY, mode);
}

export function clearSavedData() {
    localStorage.removeItem(STORAGE_CODE_KEY);
    localStorage.removeItem(STORAGE_RESULT_KEY);
}

export function loadSavedStyles() {
    return localStorage.getItem(STORAGE_STYLES_KEY);
}

export function saveStyles(css) {
    localStorage.setItem(STORAGE_STYLES_KEY, css);
}

export function clearSavedStyles() {
    localStorage.removeItem(STORAGE_STYLES_KEY);
}
