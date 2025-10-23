// Zod Schema Validation

import { z } from 'https://cdn.jsdelivr.net/npm/zod@3.23.8/+esm';

export const LinkSchema = z.object({
    name: z.string(),
    url: z.string().url(),
    icon: z.string().optional()
});

export const PersonalSchema = z.object({
    name: z.string().min(1, "Name is required"),
    title: z.string().optional(),
    email: z.string().email("Invalid email address"),
    phone: z.string().min(1, "Phone is required"),
    location: z.string().min(1, "Location is required"),
    links: z.array(LinkSchema).optional()
});

export const SectionItemSchema = z.object({
    title: z.string().min(1, "Item title is required"),
    subtitle: z.string().optional(),
    period: z.object({
        start: z.string().optional(),
        end: z.string().optional()
    }).optional(),
    location: z.string().optional(),
    content: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional()
});

export const SectionSchema = z.object({
    id: z.string().min(1, "Section ID is required"),
    heading: z.string().min(1, "Section heading is required"),
    items: z.array(SectionItemSchema).min(1, "Section must have at least one item")
});

export const CVDataSchema = z.object({
    personal: PersonalSchema,
    summary: z.string().optional(),
    sections: z.array(SectionSchema).min(1, "CV must have at least one section")
});
