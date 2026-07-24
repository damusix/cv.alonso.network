// Fixture for `driver.mjs` — feed it in with `cv .claude/skills/run-cv-generator/example-cv.js`.
// Same shape the JavaScript tab expects: end with a `return` of the CV data object.
return {
    personal: {
        name: 'Grace Hopper',
        title: 'Rear Admiral, US Navy',
        email: 'grace@navy.mil',
        phone: '+1 (555) 010-0000',
        location: 'Arlington, VA',
        links: [{ name: 'Archive', url: 'https://example.com/hopper', icon: 'fas fa-globe' }]
    },
    summary: 'Built the **first compiler** and led the team that produced COBOL.',
    sections: [
        {
            id: 'experience',
            heading: 'Work Experience',
            items: [
                {
                    title: 'US Navy',
                    subtitle: 'Rear Admiral',
                    period: { start: '1943', end: '1986' },
                    location: 'Arlington, VA',
                    content: [
                        'Wrote the A-0 system, the *first* compiler',
                        'Drove standardization of `COBOL` across the fleet'
                    ],
                    tags: ['Compilers', 'COBOL', 'Standards']
                }
            ]
        }
    ]
};
