// Local Storage Management

import { STORAGE_CODE_KEY, STORAGE_RESULT_KEY, STORAGE_MODE_KEY, STORAGE_STYLES_KEY } from './config.js';

const EDITOR_STATE_KEY = 'cv-editor-state';
const CURSOR_JS_KEY = 'cv-editor-cursor-javascript';
const CURSOR_CSS_KEY = 'cv-editor-cursor-css';
const DRAFT_JS_KEY = 'cv-editor-draft-javascript';
const DRAFT_CSS_KEY = 'cv-editor-draft-css';

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

// Editor State Persistence

export function saveEditorState(state) {
    localStorage.setItem(EDITOR_STATE_KEY, JSON.stringify(state));
}

export function loadEditorState() {
    const saved = localStorage.getItem(EDITOR_STATE_KEY);
    if (!saved) return null;

    try {
        return JSON.parse(saved);
    } catch (e) {
        console.error('Failed to parse editor state:', e);
        return null;
    }
}

// Draft Management

function getDraftKey(mode) {
    const draftKeys = {
        'javascript': DRAFT_JS_KEY,
        'css': DRAFT_CSS_KEY
    };
    return draftKeys[mode];
}

export function saveDraft(mode, content) {
    const key = getDraftKey(mode);
    if (key) {
        localStorage.setItem(key, content);
    }
}

export function loadDraft(mode) {
    const key = getDraftKey(mode);
    return key ? localStorage.getItem(key) : null;
}

export function clearDraft(mode) {
    const key = getDraftKey(mode);
    if (key) {
        localStorage.removeItem(key);
    }
}

export function hasDraft(mode) {
    const key = getDraftKey(mode);
    return key ? localStorage.getItem(key) !== null : false;
}

export function clearAllDrafts() {
    localStorage.removeItem(DRAFT_JS_KEY);
    localStorage.removeItem(DRAFT_CSS_KEY);
}

// Cursor Position Management

function getCursorKey(mode) {
    const cursorKeys = {
        'javascript': CURSOR_JS_KEY,
        'css': CURSOR_CSS_KEY
    };
    return cursorKeys[mode];
}

export function saveCursorPosition(mode, position) {
    const key = getCursorKey(mode);
    if (key && position) {
        localStorage.setItem(key, JSON.stringify(position));
    }
}

export function loadCursorPosition(mode) {
    const key = getCursorKey(mode);
    if (!key) return null;

    const saved = localStorage.getItem(key);
    if (!saved) return null;

    try {
        return JSON.parse(saved);
    } catch (e) {
        console.error('Failed to parse cursor position:', e);
        return null;
    }
}

export function clearCursorPosition(mode) {
    const key = getCursorKey(mode);
    if (key) {
        localStorage.removeItem(key);
    }
}

export function clearAllCursorPositions() {
    localStorage.removeItem(CURSOR_JS_KEY);
    localStorage.removeItem(CURSOR_CSS_KEY);
}
