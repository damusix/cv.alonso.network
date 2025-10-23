// Modal Dialog Management

let modal = null;
let modalContent = null;

export function initializeModal() {
    modal = document.getElementById('helpModal');
    modalContent = document.getElementById('modalContent');

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

export async function showModal(markdownUrl) {
    if (!modal) return;

    try {
        // Fetch markdown file
        const response = await fetch(markdownUrl);
        if (!response.ok) {
            throw new Error(`Failed to load: ${response.status}`);
        }

        const markdownText = await response.text();

        // Convert markdown to HTML using markdown-it
        const md = window.markdownit({
            html: true,
            breaks: true,
            linkify: true
        });

        const htmlContent = md.render(markdownText);

        // Set content and show modal
        modalContent.innerHTML = htmlContent;
        modal.showModal();
    } catch (error) {
        console.error('Error loading modal content:', error);
        modalContent.innerHTML = `<p style="color: #991b1b;">Failed to load content: ${error.message}</p>`;
        modal.showModal();
    }
}

export function closeModal() {
    if (modal) {
        modal.close();
    }
}

export function showHelpModal() {
    showModal('readme.md');
}
