// CSS Styles Management

import { loadSavedStyles, saveStyles, clearSavedStyles } from './storage.js';

let defaultStyles = null;

const prefixComments = `/*
 * This is the entirety of the CSS used to style your CV.
 * You can customize the entire thing, or just the classes/variables
 * you want to affect. The default styles are included below for reference.
 */\n\n`;

async function loadDefaultStyles() {
    if (defaultStyles) return defaultStyles;

    try {
        // Fetch both base.css and cv.css
        const [baseResponse, cvResponse, printResponse] = await Promise.all([
            fetch('assets/css/base.css'),
            fetch('assets/css/cv.css'),
            fetch('assets/css/print.css')
        ]);

        const baseCSS = await baseResponse.text();
        const cvCSS = await cvResponse.text();
        const printCSS = await printResponse.text();

        // Combine them with helpful comments
        defaultStyles = [
            prefixComments,
            '/* --- base.css --- */\n',
            baseCSS,
            '\n/* --- cv.css --- */\n',
            cvCSS,
            '\n/* --- print.css --- */\n',
            printCSS
        ].join('\n');

        return defaultStyles;
    } catch (error) {
        console.error('Failed to load default styles:', error);
        return '';
    }
}

export function applyStyles(css) {
    let styleTag = document.getElementById('cv-custom-styles');

    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'cv-custom-styles';
        document.head.appendChild(styleTag);
    }

    styleTag.textContent = css;
    saveStyles(css);
}

export async function loadAndApplyStyles() {
    const savedStyles = loadSavedStyles();
    let stylesToApply;

    if (savedStyles) {
        stylesToApply = savedStyles;
    } else {
        stylesToApply = await loadDefaultStyles();
    }

    let styleTag = document.getElementById('cv-custom-styles');

    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'cv-custom-styles';
        document.head.appendChild(styleTag);
    }

    styleTag.textContent = stylesToApply;

    return stylesToApply;
}

export async function resetStyles() {
    clearSavedStyles();
    const defaults = await loadDefaultStyles();
    applyStyles(defaults);
    return defaults;
}

export async function getCurrentStyles() {
    const saved = loadSavedStyles();
    if (saved) return saved;

    return await loadDefaultStyles();
}
