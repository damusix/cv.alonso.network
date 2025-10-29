// Toast Notifications

import { on } from './observable.js';
import { parseMarkdown } from './markdown.js';

let toastContainer = null;

export function initializeToasts() {
    toastContainer = document.querySelector('.toasts');
    if (!toastContainer) {
        console.error('Toast container not found. Add <aside class="toasts"></aside> to your HTML.');
    }
}

export function notify(message, optionsOrType) {
    if (!toastContainer) {
        console.error('Toast system not initialized. Call initializeToasts() first.');
        return;
    }

    // Parse options
    let options = {
        type: 'info',
        timeout: 5000,
        dismissable: true
    };

    if (typeof optionsOrType === 'string') {
        options.type = optionsOrType;
    } else if (typeof optionsOrType === 'object' && optionsOrType !== null) {
        options = { ...options, ...optionsOrType };
    }

    // Create toast element
    const toast = document.createElement('aside');
    toast.setAttribute(options.type, '');

    const messageEl = document.createElement('p');
    messageEl.innerHTML = parseMarkdown(message);
    toast.appendChild(messageEl);

    if (options.dismissable) {
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.setAttribute('aria-label', 'Dismiss notification');
        closeBtn.addEventListener('click', () => dismissToast(toast));
        toast.appendChild(closeBtn);
    }

    // Add to container
    toastContainer.appendChild(toast);

    // Trigger show animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Auto-dismiss after timeout
    if (options.timeout > 0) {
        setTimeout(() => {
            dismissToast(toast);
        }, options.timeout);
    }

    return toast;
}

function dismissToast(toast) {
    if (!toast || !toast.parentElement) return;

    toast.classList.remove('show');
    toast.classList.add('hide');

    // Remove from DOM after animation
    setTimeout(() => {
        if (toast.parentElement) {
            toast.parentElement.removeChild(toast);
        }
    }, 300);
}


on('cv:save', () => notify('CV saved!', 'success'));
on('cv:reset', () => notify('CV reset!', 'info'));
on('cv:import', () => notify('CV imported!', 'info'));
on('cv:export', () => notify('CV exported!', 'info'));

on(/error/, ({ event, data }) => notify(data.message, 'error'));