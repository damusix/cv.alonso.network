// AI Schemas — Zod schemas for intent classification and CV response validation

import { z } from 'https://cdn.jsdelivr.net/npm/zod@3.23.8/+esm';
import { PersonalSchema, SectionItemSchema, SectionSchema } from '../validation.js';
export {
    CVDataSchema,
    PersonalSchema,
    SectionItemSchema,
    SectionSchema,
    LinkSchema
} from '../validation.js';

export const AiIntentSchema = z.object({
    intent: z.enum([
        'chitchat',
        'clarification',
        'full_generation',
        'partial_update',
        'style_update'
    ]).describe("The identified user intent"),
    targetSection: z.string().default('').describe("The target section for generation or update, if applicable. Empty string if not applicable. Example: 'experience', 'education'"),
    targetIndex: z.number().default(-1).describe("The target index within the section, if applicable. -1 if not applicable. Example: 0 for the first item"),
    reasoning: z.string().describe("The reasoning behind the identified intent"),
    suggestedTitle: z.string().default('').describe("A suggested title for the chat. Empty string if no update needed"),
    shouldUpdateTitle: z.boolean().describe("Whether the title for the chat should be updated"),
});

export const AiStyleUpdateSchema = z.object({
    css: z.string().describe("The complete CSS to apply. This replaces the user's entire custom stylesheet. Include all rules the user needs — both their existing customizations and the new changes."),
    summary: z.string().describe("A brief description of what was changed in the CSS"),
});

export const AiPartialUpdateSchema = z.object({
    operation: z.enum(['set', 'insert']).default('set').describe("'set' replaces the value at the path. 'insert' splices a new element into the array at the given index (e.g. path 'sections.0.items.0' with 'insert' adds a new first item without removing existing ones). Use 'insert' when adding new items/sections, 'set' when editing existing ones."),
    path: z.string().describe("Dot-notation path into the CV data object where the update should be applied. Examples: 'personal' for contact info, 'summary' for the summary, 'sections.0' for the first section, 'sections.2.items.1' for the second item in the third section"),
    data: z.union([
        PersonalSchema,
        SectionSchema,
        SectionItemSchema,
        z.array(SectionSchema),
        z.string(),
    ]).describe("The data to set at the specified path. Must match the schema for that path: PersonalSchema for 'personal', string for 'summary', SectionSchema for a section, SectionItemSchema for an item")
});
