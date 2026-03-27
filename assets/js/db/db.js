// Database Layer — Dexie wrapper for IndexedDB persistence

import { z } from 'https://cdn.jsdelivr.net/npm/zod@3.23.8/+esm';
import { assert } from '../utils.js';

const Dexie = (await import('https://cdn.jsdelivr.net/npm/dexie@4.0.11/+esm')).default;

// ─── Validation Schemas ──────────────────────────────────────────────────────

const MessageInputSchema = z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    documentIds: z.array(z.number()).optional()
});

const ProviderSettingsSchema = z.object({
    apiKey: z.string(),
    smallModel: z.string().min(1),
    responseModel: z.string().min(1)
});

const ProviderNameSchema = z.enum(['openai', 'anthropic', 'google-genai']);

// ─── Database Class ──────────────────────────────────────────────────────────

class CvGenDb {

    constructor() {
        this.db = new Dexie('CvGenerator');
        this.db.version(1).stores({
            chats: '++id, title, createdAt, updatedAt',
            messages: '++id, chatId, role, content, timestamp',
            settings: 'key'
        });
        this.db.version(2).stores({
            chats: '++id, title, createdAt, updatedAt',
            messages: '++id, chatId, role, content, timestamp',
            settings: 'key'
        });
        this.db.version(3).stores({
            chats: '++id, title, createdAt, updatedAt',
            messages: '++id, chatId, role, content, timestamp',
            settings: 'key',
            documents: '++id, name, type, size, createdAt'
        });
    }

    // ─── Chat Operations ─────────────────────────────────────────────────

    async loadChat(id) {
        assert(typeof id === 'number' && id > 0, 'Chat ID must be a positive number');
        const chat = await this.db.chats.get(id);
        if (!chat) return null;
        const messages = await this.getMessages(id);
        return { ...chat, messages };
    }

    async getMessages(chatId) {
        assert(typeof chatId === 'number' && chatId > 0, 'Chat ID must be a positive number');
        return this.db.messages
            .where('chatId')
            .equals(chatId)
            .sortBy('timestamp');
    }

    async getAllChats() {
        return this.db.chats.orderBy('updatedAt').reverse().toArray();
    }

    async createChat(title) {
        if (title !== undefined) {
            assert(typeof title === 'string', 'Chat title must be a string');
        }
        const now = Date.now();
        const id = await this.db.chats.add({
            title: title || 'New Chat',
            createdAt: now,
            updatedAt: now
        });
        return this.db.chats.get(id);
    }

    async saveMessage(chatId, input) {
        assert(typeof chatId === 'number' && chatId > 0, 'Chat ID must be a positive number');
        const { role, content, documentIds } = MessageInputSchema.parse(input);
        const timestamp = Date.now();
        const record = { chatId, role, content, timestamp };
        if (documentIds?.length) record.documentIds = documentIds;
        const id = await this.db.messages.add(record);
        await this.db.chats.update(chatId, { updatedAt: timestamp });
        return this.db.messages.get(id);
    }

    async setTitle(id, title) {
        assert(typeof id === 'number' && id > 0, 'Chat ID must be a positive number');
        assert(typeof title === 'string' && title.length > 0, 'Title must be a non-empty string');
        return this.db.chats.update(id, { title });
    }

    async setSummary(chatId, summary) {
        assert(typeof chatId === 'number' && chatId > 0, 'Chat ID must be a positive number');
        return this.db.chats.update(chatId, { summary });
    }

    async getSummary(chatId) {
        assert(typeof chatId === 'number' && chatId > 0, 'Chat ID must be a positive number');
        const chat = await this.db.chats.get(chatId);
        return chat?.summary || null;
    }

    async deleteChat(id) {
        assert(typeof id === 'number' && id > 0, 'Chat ID must be a positive number');
        await this.db.messages.where('chatId').equals(id).delete();
        return this.db.chats.delete(id);
    }

    async deleteMessage(id) {
        assert(typeof id === 'number' && id > 0, 'Message ID must be a positive number');
        return this.db.messages.delete(id);
    }

    async deleteMessagesFrom(chatId, messageId) {
        assert(typeof chatId === 'number' && chatId > 0, 'Chat ID must be a positive number');
        assert(typeof messageId === 'number' && messageId > 0, 'Message ID must be a positive number');
        const msg = await this.db.messages.get(messageId);
        if (!msg) return;
        await this.db.messages
            .where('chatId').equals(chatId)
            .and(m => m.timestamp >= msg.timestamp)
            .delete();
    }

    async clearAllChats() {
        await this.db.messages.clear();
        return this.db.chats.clear();
    }

    // ─── Settings Operations ─────────────────────────────────────────────

    async setProviderSettings(provider, settings) {
        ProviderNameSchema.parse(provider);
        const { apiKey, smallModel, responseModel } = ProviderSettingsSchema.parse(settings);
        return this.db.settings.put({
            key: `provider:${provider}`,
            value: { apiKey, smallModel, responseModel }
        });
    }

    async setActiveProvider(provider) {
        ProviderNameSchema.parse(provider);
        return this.db.settings.put({ key: 'activeProvider', value: provider });
    }

    async getSettings() {
        const rows = await this.db.settings.toArray();
        const settings = {};
        for (const row of rows) {
            settings[row.key] = row.value;
        }
        return settings;
    }

    async hasValidSettings() {
        const settings = await this.getSettings();
        const active = settings.activeProvider;
        if (!active) return false;
        const provider = settings[`provider:${active}`];
        return !!(provider && provider.apiKey);
    }

    // ─── Document Operations ────────────────────────────────────────────

    async addDocument({ name, type, size, data }) {
        assert(typeof name === 'string' && name.length > 0, 'Document name required');
        assert(typeof data === 'string', 'Document data must be a string');
        const id = await this.db.documents.add({
            name, type, size, data,
            summary: null,
            createdAt: Date.now()
        });
        return this.db.documents.get(id);
    }

    async updateDocumentSummary(id, summary, extractedText) {
        assert(typeof id === 'number' && id > 0, 'Document ID must be a positive number');
        const update = { summary };
        if (extractedText !== undefined) update.extractedText = extractedText;
        return this.db.documents.update(id, update);
    }

    async getAllDocuments() {
        return this.db.documents.orderBy('createdAt').reverse().toArray();
    }

    async deleteDocument(id) {
        assert(typeof id === 'number' && id > 0, 'Document ID must be a positive number');
        return this.db.documents.delete(id);
    }

    async getDocumentSummaries() {
        const docs = await this.db.documents.toArray();
        return docs
            .filter(d => d.summary)
            .map(d => ({ id: d.id, name: d.name, summary: d.summary }));
    }
}

export const db = new CvGenDb();
