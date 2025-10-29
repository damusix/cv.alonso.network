// Modal Dialog Management

const FIRST_VISIT_KEY = 'cv-first-visit';

let modal = null;
let modalContent = null;
let modalTitle = null;
let currentMarkdownUrl = null;
let currentMarkdownText = null;

export function initializeModal() {
    modal = document.getElementById('helpModal');
    modalContent = document.getElementById('modalContent');
    modalTitle = document.getElementById('modalTitle');

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Close on ESC key (built-in, but we can add custom handling)
    modal.addEventListener('cancel', (e) => {
        e.preventDefault();
        closeModal();
    });
}

export function isFirstVisit() {
    return !localStorage.getItem(FIRST_VISIT_KEY);
}

export function markVisited() {
    localStorage.setItem(FIRST_VISIT_KEY, 'true');
}

const wasFetched = new Map();
const markdownCache = new Map();

export async function showModal(markdownUrl, title = 'Help') {
    if (!modal) return;

    currentMarkdownUrl = markdownUrl;
    modalTitle.textContent = title;

    if (wasFetched.has(markdownUrl)) {
        modalContent.innerHTML = wasFetched.get(markdownUrl);
        currentMarkdownText = markdownCache.get(markdownUrl);
        console.log('Loaded from cache, text length:', currentMarkdownText?.length);
        modal.showModal();
        return;
    }

    try {
        // Fetch markdown file
        const response = await fetch(markdownUrl);
        if (!response.ok) {
            throw new Error(`Failed to load: ${response.status}`);
        }

        const markdownText = await response.text();
        currentMarkdownText = markdownText;
        console.log('Fetched markdown, text length:', markdownText.length);

        // Convert markdown to HTML using markdown-it
        const md = window.markdownit({
            html: true,
            breaks: true,
            linkify: true
        });

        const htmlContent = md.render(markdownText);

        // Set content and show modal
        modalContent.innerHTML = htmlContent;

        // Cache the fetched content
        wasFetched.set(markdownUrl, htmlContent);
        markdownCache.set(markdownUrl, markdownText);

        modal.showModal();
    } catch (error) {
        console.error('Error loading modal content:', error);
        modalContent.innerHTML = `<p style="color: #991b1b;">Failed to load content: ${error.message}</p>`;
        currentMarkdownText = null;
        modal.showModal();
    }
}

export function closeModal() {
    if (modal) {
        modal.close();
    }
}

export function showHelpModal() {
    showModal('readme.md', 'Help');
}

export function showPromptModal() {
    showModal('prompt.md', 'LLM Prompt');
}

export function showPrivacyModal() {
    showModal('privacy.md', 'Privacy & Data Collection');
}

export async function copyModalMarkdown() {
    console.log('copyModalMarkdown called');

    if (!currentMarkdownText) {
        console.warn('No markdown content to copy');
        return;
    }

    try {
        await navigator.clipboard.writeText(currentMarkdownText);
        console.log('Markdown copied to clipboard');

        // Visual feedback
        const copyButton = document.querySelector('.copy-markdown');
        if (!copyButton) {
            console.warn('Copy button not found');
            return;
        }

        // Font Awesome JS transforms <i> into <svg>, so look for either
        const icon = copyButton.querySelector('i') || copyButton.querySelector('svg');
        if (!icon) {
            console.warn('Icon element not found in copy button');
            return;
        }

        const originalHTML = icon.outerHTML;

        // Change to check icon
        if (icon.tagName === 'I') {
            icon.className = 'fas fa-check';
        } else {
            // Replace SVG with check icon
            icon.outerHTML = '<i class="fas fa-check"></i>';
        }
        copyButton.classList.add('copied');

        // Reset after 2 seconds
        setTimeout(() => {
            const currentIcon = copyButton.querySelector('i') || copyButton.querySelector('svg');
            if (currentIcon) {
                currentIcon.outerHTML = originalHTML;
            }
            copyButton.classList.remove('copied');
        }, 2000);
    } catch (error) {
        console.error('Failed to copy markdown:', error);
        alert('Failed to copy to clipboard');
    }
}
