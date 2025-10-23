// CV Rendering Functions

import { parseMarkdown } from './markdown.js';

export function renderHeader(data) {
    document.getElementById('name').textContent = data.name;

    const titleEl = document.getElementById('title');
    if (data.title) {
        titleEl.textContent = data.title;
        titleEl.style.display = 'block';
    } else {
        titleEl.style.display = 'none';
    }

    const contactEl = document.getElementById('contact');
    contactEl.innerHTML = `
        <div class="item"><i class="fas fa-envelope"></i><a target="_blank" href="mailto:${data.email}">${data.email}</a></div>
        <div class="item"><i class="fas fa-phone"></i><a target="_blank" href="tel:${data.phone}">${data.phone}</a></div>
        <div class="item"><i class="fas fa-location-dot"></i> ${data.location}</div>
    `;

    const linksEl = document.getElementById('links');
    if (data.links && data.links.length > 0) {
        linksEl.innerHTML = data.links.map(link => {
            const icon = link.icon
                ? `<i class="${link.icon}"></i>`
                : '<i class="fas fa-link"></i>';
            return `<a href="${link.url}" target="_blank">${icon} ${link.name}</a>`;
        }).join('');
        linksEl.style.display = 'flex';
    } else {
        linksEl.style.display = 'none';
    }
}

export function renderSummary(summary) {
    const summaryEl = document.getElementById('summary');
    if (summary) {
        summaryEl.innerHTML = parseMarkdown(summary);
        summaryEl.style.display = 'block';
    } else {
        summaryEl.style.display = 'none';
    }
}

export function renderSection(section) {
    const sectionEl = document.createElement('section');
    sectionEl.id = section.id;

    const heading = document.createElement('h2');
    heading.textContent = section.heading;
    sectionEl.appendChild(heading);

    section.items.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'item';

        // Header with title and period
        const headerEl = document.createElement('div');
        headerEl.className = 'header';

        const titleEl = document.createElement('h3');
        titleEl.textContent = item.title;
        headerEl.appendChild(titleEl);

        if (item.period && (item.period.start || item.period.end)) {
            const periodEl = document.createElement('time');
            periodEl.className = 'period';
            const start = item.period.start || '';
            const end = item.period.end || 'Present';
            periodEl.textContent = start ? `${start} - ${end}` : end;
            headerEl.appendChild(periodEl);
        }

        itemEl.appendChild(headerEl);

        // Meta (subtitle and location)
        if (item.subtitle || item.location) {
            const metaEl = document.createElement('div');
            metaEl.className = 'meta';

            if (item.subtitle) {
                const subtitleEl = document.createElement('div');
                subtitleEl.className = 'subtitle';
                subtitleEl.textContent = item.subtitle;
                metaEl.appendChild(subtitleEl);
            }

            if (item.location) {
                const locationEl = document.createElement('div');
                locationEl.className = 'location';
                locationEl.textContent = item.location;
                metaEl.appendChild(locationEl);
            }

            itemEl.appendChild(metaEl);
        }

        // Content
        if (item.content && item.content.length > 0) {
            const contentEl = document.createElement('div');
            contentEl.className = 'content';

            if (item.content.length === 1) {
                const p = document.createElement('p');
                p.innerHTML = parseMarkdown(item.content[0]);
                contentEl.appendChild(p);
            } else {
                const ul = document.createElement('ul');
                item.content.forEach(point => {
                    const li = document.createElement('li');
                    li.innerHTML = parseMarkdown(point);
                    ul.appendChild(li);
                });
                contentEl.appendChild(ul);
            }

            itemEl.appendChild(contentEl);
        }

        // Tags
        if (item.tags && item.tags.length > 0) {
            const tagsEl = document.createElement('div');
            tagsEl.className = 'tags';
            item.tags.forEach(tag => {
                const tagEl = document.createElement('span');
                tagEl.className = 'tag';
                tagEl.textContent = tag;
                tagsEl.appendChild(tagEl);
            });
            itemEl.appendChild(tagsEl);
        }

        sectionEl.appendChild(itemEl);
    });

    return sectionEl;
}

export function renderCV(data) {
    renderHeader(data.personal);
    renderSummary(data.summary);

    const sectionsContainer = document.getElementById('sections');
    sectionsContainer.innerHTML = '';
    data.sections.forEach(section => {
        sectionsContainer.appendChild(renderSection(section));
    });
}
