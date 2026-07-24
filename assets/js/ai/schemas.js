// AI Schemas — Zod schema for the edit_cv tool patch, plus CV validation re-exports

import { z } from 'https://cdn.jsdelivr.net/npm/zod@3.23.8/+esm';
import { PersonalSchema, SectionItemSchema, SectionSchema } from '../validation.js?v=2026.07.24.8';
export {
    CVDataSchema,
    PersonalSchema,
    SectionItemSchema,
    SectionSchema,
    LinkSchema
} from '../validation.js?v=2026.07.24.8';

export const AiPartialUpdateSchema = z.object({
    operation: z.enum(['set', 'insert', 'delete']).default('set').describe("'set' replaces the value at the path. 'insert' splices a new element into the array at the given index. 'delete' removes the element at the path from its parent array (e.g. path 'sections.2' with 'delete' removes the third section). Use 'insert' when adding, 'set' when editing, 'delete' when removing."),
    path: z.string().describe("Dot-notation path into the CV data object where the update should be applied. Examples: 'personal' for contact info, 'summary' for the summary, 'sections.0' for the first section, 'sections.2.items.1' for the second item in the third section"),
    data: z.union([
        PersonalSchema,
        SectionSchema,
        SectionItemSchema,
        z.array(SectionSchema),
        z.array(SectionItemSchema),
        z.string(),
        z.null(),
    ]).optional().describe("The data to set at the specified path. Required for 'set' and 'insert'. Not needed for 'delete'.")
});
