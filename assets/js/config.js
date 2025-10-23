// Configuration and Default Data

export const STORAGE_CODE_KEY = 'cv-data-code';
export const STORAGE_RESULT_KEY = 'cv-data-result';
export const STORAGE_MODE_KEY = 'cv-editor-mode';

export const cvData = {
    personal: {
        name: 'Jane Anderson',
        title: 'Senior Software Engineer',
        email: 'jane.anderson@email.com',
        phone: '+1 (555) 123-4567',
        location: 'San Francisco, CA',
        links: [
            { name: 'GitHub', url: 'https://github.com/janeanderson', icon: 'fab fa-github' },
            { name: 'LinkedIn', url: 'https://linkedin.com/in/janeanderson', icon: 'fab fa-linkedin' },
            { name: 'Portfolio', url: 'https://janeanderson.dev', icon: 'fas fa-globe' }
        ]
    },
    summary: 'Experienced software engineer with **8+ years** building scalable web applications. Specialized in *frontend architecture* and developer experience. Led teams of 5-10 engineers across multiple product launches.',
    sections: [
        {
            id: 'experience',
            heading: 'Work Experience',
            items: [
                {
                    title: 'TechCorp Inc.',
                    subtitle: 'Senior Software Engineer',
                    period: { start: 'Jan 2021', end: 'Present' },
                    location: 'San Francisco, CA',
                    content: [
                        'Led migration from **React 16** to **React 18**, improving render performance by 40%',
                        'Architected component library used by *12 product teams*',
                        'Mentored 5 junior engineers and conducted technical interviews',
                        'Implemented CI/CD pipeline reducing deployment time from 45min to `8min`'
                    ]
                },
                {
                    title: 'StartupXYZ',
                    subtitle: 'Frontend Engineer',
                    period: { start: 'Mar 2018', end: 'Dec 2020' },
                    location: 'Remote',
                    content: [
                        'Built responsive dashboard application serving **50K+ daily active users**',
                        'Reduced initial bundle size by 60% through *code splitting* and lazy loading',
                        'Collaborated with designers to implement design system in `Figma` and `React`'
                    ]
                },
                {
                    title: 'WebDev Agency',
                    subtitle: 'Junior Developer',
                    period: { start: 'Jun 2016', end: 'Feb 2018' },
                    location: 'New York, NY',
                    content: [
                        'Developed client websites using HTML, CSS, JavaScript, and WordPress',
                        'Improved site performance and SEO rankings for 15+ client projects'
                    ]
                }
            ]
        },
        {
            id: 'education',
            heading: 'Education',
            items: [
                {
                    title: 'University of California, Berkeley',
                    subtitle: 'Bachelor of Science in Computer Science',
                    period: { start: '2012', end: '2016' },
                    location: 'Berkeley, CA',
                    content: [
                        'GPA: 3.8/4.0',
                        'Relevant coursework: Data Structures, Algorithms, Web Development, Databases'
                    ]
                }
            ]
        },
        {
            id: 'skills',
            heading: 'Technical Skills',
            items: [
                {
                    title: 'Languages & Frameworks',
                    tags: ['JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js', 'Python', 'HTML/CSS']
                },
                {
                    title: 'Tools & Technologies',
                    tags: ['Git', 'Docker', 'AWS', 'PostgreSQL', 'Redis', 'GraphQL', 'REST APIs']
                },
                {
                    title: 'Practices',
                    tags: ['Agile', 'Test-Driven Development', 'CI/CD', 'Code Review', 'Technical Documentation']
                }
            ]
        },
        {
            id: 'certifications',
            heading: 'Certifications',
            items: [
                {
                    title: 'AWS Certified Solutions Architect',
                    subtitle: 'Amazon Web Services',
                    period: { start: '2022' }
                },
                {
                    title: 'Professional Scrum Master I',
                    subtitle: 'Scrum.org',
                    period: { start: '2020' }
                }
            ]
        }
    ]
};
