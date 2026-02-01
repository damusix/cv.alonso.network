// Zod Schema Validation

import { z } from 'https://cdn.jsdelivr.net/npm/zod@3.23.8/+esm';

export const LinkSchema = z.object({
    name: z.string().min(1, "Link name is required").describe("The display name of the link"),
    url: z.string().url().describe("The full URL of the link"),
    icon: z.string().optional().describe("Optional fontawesome icon class name for the link. Example: fas fa-github")
}).strict();

export const PersonalSchema = z.object({
    name: z.string().min(1, "Name is required").describe("Full name of the person"),
    title: z.string().optional().describe("Professional title, e.g. 'Senior Software Engineer'"),
    email: z.string().email("Invalid email address").describe("Email address"),
    phone: z.string().min(1, "Phone is required").describe("Phone number"),
    location: z.string().min(1, "Location is required").describe("City, State/Country"),
    links: z.array(LinkSchema).optional().describe("Professional links (GitHub, LinkedIn, portfolio)")
}).strict();

export const SectionItemSchema = z.object({
    title: z.string().min(1, "Item title is required").describe("Title of the item"),
    subtitle: z.string().optional().describe("Optional subtitle for the item"),
    period: z.object({
        start: z.string().optional().describe("Start date or period"),
        end: z.string().optional().describe("End date or period")
    }).strict().optional().describe("Time period for the item"),
    location: z.string().optional().describe("Location of the item"),
    content: z.array(z.string()).optional().describe("Content paragraphs or bullet points"),
    tags: z.array(z.string()).optional().describe("Tags or keywords associated with the item")
}).strict();

export const SectionSchema = z.object({
    id: z.string().min(1, "Section ID is required").describe("Unique identifier for the section"),
    heading: z.string().min(1, "Section heading is required").describe("Heading or title of the section"),
    items: z.array(SectionItemSchema).min(1, "Section must have at least one item").describe("Array of items within the section")
}).strict();

export const CVDataSchema = z.object({
    personal: PersonalSchema.describe("Personal information block for the CV"),
    summary: z.string().optional().describe("Professional summary paragraph"),
    sections: z.array(SectionSchema).min(1, "CV must have at least one section").describe("Array of CV sections")
}).strict();
