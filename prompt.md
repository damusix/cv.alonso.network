# Generate My CV Data


I need help generating CV data for a CV Generator application. Please create well-structured CV data based on my professional information.

If you need more information from me, please ask clarifying questions about my work experience, education, skills, and anything else you need to create a complete CV.

---

## What I Need From You


Generate my CV data in **JavaScript format**.

Provide JavaScript code that returns my CV data object. This is useful for dynamic content like calculating years of experience:

    // Calculate dynamic values
    const startYear = 2016;
    const currentYear = new Date().getFullYear();
    const yearsExp = currentYear - startYear;

    return {
      personal: {
        name: "Full Name",
        title: "Professional Title",
        email: "email@example.com",
        phone: "+1234567890",
        location: "City, Country",
        links: [
          { name: "GitHub", url: "https://github.com/username", icon: "fab fa-github" }
        ]
      },
      summary: `Software engineer with ${yearsExp}+ years of experience`,
      sections: [
        // ... sections array
      ]
    };

**Important:** JavaScript code **must end with a `return` statement** that returns the CV data object.

---

## Data Structure Requirements


### Personal Information (Required)

- **name** (string, required): My full name
- **title** (string, optional): My professional title or role
- **email** (string, required): My email address
- **phone** (string, required): My phone number with country code
- **location** (string, required): My city and country
- **links** (array, optional): My social/professional links
    - `name` (string): Display name
    - `url` (string): Valid URL
    - `icon` (string, optional): Font Awesome icon class

### Summary (Optional)

- Markdown-formatted professional summary about me
- Use **bold**, *italic*, `code`, and [links](url) for emphasis
- Keep it concise (2-4 sentences)

### Sections (Required)

Include at least one section. Common sections:

- **Experience**: My work history
- **Education**: My academic background
- **Skills**: My technical/professional skills
- **Projects**: My portfolio projects
- **Certifications**: My professional certifications
- **Publications**: My papers, articles, talks

Each section must have:

- **id** (string, required): Unique identifier (lowercase, no spaces)
- **heading** (string, required): Display title
- **items** (array, required): At least one item

Each item supports:

- **title** (string, required): Main title
- **subtitle** (string, optional): Secondary info (company, institution)
- **period** (object, optional): Time period
    - `start` (string): Start date (YYYY or YYYY-MM)
    - `end` (string): End date or "Present"
- **location** (string, optional): Geographic location
- **content** (array, optional): Markdown-formatted bullet points
- **tags** (array, optional): Skills, technologies, keywords

---

## How to Write My CV Content


Please use these best practices when creating my CV content:

1. **Use action verbs**: "Developed", "Led", "Implemented", "Increased"
2. **Quantify my achievements**: Include numbers, percentages, metrics
3. **Highlight impact**: Focus on results, not just responsibilities
4. **Tailor content**: Prioritize relevant experience for my target role
5. **Keep concise**: Aim for 1-2 pages worth of content

### Markdown Usage

- Use **bold** for emphasis on key achievements
- Use *italic* for role clarifications or context
- Use `code` formatting for technologies, commands, or technical terms
- Use [links](url) sparingly for portfolios or publications

### Common Sections Order

1. Personal Information (automatic header)
2. Summary
3. Experience
4. Education
5. Skills
6. Projects (optional)
7. Certifications (optional)
8. Publications (optional)

---

## Font Awesome Icons


When adding my links, use Font Awesome icon classes. Common examples:

- GitHub: `fab fa-github`
- LinkedIn: `fab fa-linkedin`
- Twitter/X: `fab fa-x-twitter`
- Portfolio: `fas fa-globe`
- Email: `fas fa-envelope`
- Phone: `fas fa-phone`
- Location: `fas fa-location-dot`

Browse all icons at [fontawesome.com/icons](https://fontawesome.com/icons)

---

## Complete Example


Here's what a full CV data structure looks like in JavaScript format:

    // Calculate years of experience
    const startYear = 2016;
    const currentYear = new Date().getFullYear();
    const yearsExp = currentYear - startYear;

    return {
      personal: {
        name: "Jane Anderson",
        title: "Senior Software Engineer",
        email: "jane.anderson@email.com",
        phone: "+1 (555) 123-4567",
        location: "San Francisco, CA",
        links: [
          { name: "GitHub", url: "https://github.com/janeanderson", icon: "fab fa-github" },
          { name: "LinkedIn", url: "https://linkedin.com/in/janeanderson", icon: "fab fa-linkedin" },
          { name: "Portfolio", url: "https://janeanderson.dev", icon: "fas fa-globe" }
        ]
      },
      summary: `Experienced software engineer with **${yearsExp}+ years** building scalable web applications. Specialized in *frontend architecture* and developer experience. Led teams of 5-10 engineers across multiple product launches.`,
      sections: [
        {
          id: "experience",
          heading: "Work Experience",
          items: [
            {
              title: "TechCorp Inc.",
              subtitle: "Senior Software Engineer",
              period: { start: "Jan 2021", end: "Present" },
              location: "San Francisco, CA",
              content: [
                "Led migration from **React 16** to **React 18**, improving render performance by 40%",
                "Architected component library used by *12 product teams*",
                "Mentored 5 junior engineers and conducted technical interviews",
                "Implemented CI/CD pipeline reducing deployment time from 45min to `8min`"
              ]
            },
            {
              title: "StartupXYZ",
              subtitle: "Frontend Engineer",
              period: { start: "Mar 2018", end: "Dec 2020" },
              location: "Remote",
              content: [
                "Built responsive dashboard application serving **50K+ daily active users**",
                "Reduced initial bundle size by 60% through *code splitting* and lazy loading",
                "Collaborated with designers to implement design system in `Figma` and `React`"
              ]
            },
            {
              title: "WebDev Agency",
              subtitle: "Junior Developer",
              period: { start: "Jun 2016", end: "Feb 2018" },
              location: "New York, NY",
              content: [
                "Developed client websites using HTML, CSS, JavaScript, and WordPress",
                "Improved site performance and SEO rankings for 15+ client projects"
              ]
            }
          ]
        },
        {
          id: "education",
          heading: "Education",
          items: [
            {
              title: "University of California, Berkeley",
              subtitle: "Bachelor of Science in Computer Science",
              period: { start: "2012", end: "2016" },
              location: "Berkeley, CA",
              content: [
                "GPA: 3.8/4.0",
                "Relevant coursework: Data Structures, Algorithms, Web Development, Databases"
              ]
            }
          ]
        },
        {
          id: "skills",
          heading: "Technical Skills",
          items: [
            {
              title: "Languages & Frameworks",
              tags: ["JavaScript", "TypeScript", "React", "Next.js", "Node.js", "Python", "HTML/CSS"]
            },
            {
              title: "Tools & Technologies",
              tags: ["Git", "Docker", "AWS", "PostgreSQL", "Redis", "GraphQL", "REST APIs"]
            },
            {
              title: "Practices",
              tags: ["Agile", "Test-Driven Development", "CI/CD", "Code Review", "Technical Documentation"]
            }
          ]
        },
        {
          id: "certifications",
          heading: "Certifications",
          items: [
            {
              title: "AWS Certified Solutions Architect",
              subtitle: "Amazon Web Services",
              period: { start: "2022" }
            },
            {
              title: "Professional Scrum Master I",
              subtitle: "Scrum.org",
              period: { start: "2020" }
            }
          ]
        }
      ]
    };

---

## What to Check Before Giving Me the Output


Please verify:

- Valid email format
- Valid URLs for all links
- All required fields are present (name, email, phone, location)
- At least one section with at least one item
- JavaScript code ends with `return` statement
- No syntax errors in JavaScript

---

Thank you for helping me create a professional CV! Once you generate the data, I'll copy it and paste it into the CV Generator editor.
