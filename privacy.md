# Privacy & Data Collection


## What Data We Collect


This application uses **Google Analytics** to understand how users interact with the CV Generator. We collect minimal, anonymized usage data to improve the application.

### Analytics Data


We collect:

- **Event names only** - Actions like "CV saved", "CV exported", "mode changed"
- **Basic page view information** - To understand traffic patterns
- **Anonymous usage metrics** - Anything else Google Analytics collects by default

### What We DO NOT Collect


We **never** collect:

- Your CV content or personal information
- Any data you enter into the editor
- Your name, email, phone number, or any identifying details
- Text from your CV sections or custom styles
- File contents from imports or exports
- AI chat prompts, messages, or conversation history
- API keys you configure for LLM providers

---

## How Your Data is Stored


### Local Storage Only


All your CV data is stored **exclusively in your browser** using localStorage and IndexedDB:

- Your CV content never leaves your device
- No data is sent to any Alonso Network server
- AI conversation history is stored in IndexedDB in your browser
- Clearing your browser data will permanently delete your CV and chat history
- We have no access to your CV content or AI conversations
- You can clear IndexedDB data at any time using your browser's developer tools

### No Account Required


- No sign-up or authentication
- No user profiles or cloud storage
- Complete privacy and control over your data

---

## Third-Party Services


### Google Analytics


We use Google Analytics to track anonymous usage patterns. Google may collect:

- IP address (anonymized)
- Browser and device information
- General geographic location

Read more: [Google Analytics Privacy Policy](https://policies.google.com/privacy)

### AI / LLM Providers


The AI chat assistant connects **directly from your browser** to the LLM provider you configure. Alonso Network does not proxy, intercept, or store any of this communication. When you use the AI chat:

- Prompts and responses go directly between your browser and the provider (Anthropic, OpenAI, or Google Gemini)
- Your API keys are stored locally in your browser and sent only to the respective provider
- Alonso Network never sees your prompts, responses, or API keys

Provider privacy policies:

- [Anthropic (Claude)](https://www.anthropic.com/privacy)
- [OpenAI](https://openai.com/privacy)
- [Google (Gemini)](https://policies.google.com/privacy)

### Brave Search


Web searches made through the AI assistant use the Brave Search API via [corsproxy.io](https://corsproxy.io), a public CORS proxy service. Search queries pass through corsproxy.io to reach Brave — Alonso Network does not log or store search queries or results.

Read more: [Brave Search Privacy Policy](https://search.brave.com/help/privacy-policy)

### Website Fetching


When the AI assistant fetches a website (e.g., a job posting URL you provide), it uses the browser's native Fetch API. The request goes directly from your browser to the target website. Alonso Network is not involved in these requests.

---

## Your Rights


You can:

- **Disable tracking** - Use browser extensions or privacy settings to block Google Analytics
- **Clear your data** - Clear browser localStorage to remove all CV data
- **Clear AI data** - Clear IndexedDB via browser developer tools to remove chat history and AI settings
- **Export your data** - Use the Export feature to save your CV data locally
- **Revoke AI access** - Remove your API keys from the AI settings at any time

---

## Changes to This Policy


We may update this privacy policy as the application evolves. Any changes will be reflected in this document.

---

## Contact


For questions or concerns about privacy, please open an issue on our [GitHub repository](https://github.com/damusix/cv.alonso.network/issues).

---

**Last updated:** 2026-02-01
