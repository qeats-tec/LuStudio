import type { ChatMessage, AIFileAction } from '../types';

export interface AISettings {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export const PROVIDER_PRESETS: { id: string; label: string; baseUrl: string; defaultModel: string; keyPrefix: string; helpUrl: string }[] = [
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'google/gemini-2.0-flash-exp:free', keyPrefix: 'sk-or-', helpUrl: 'https://openrouter.ai/keys' },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini', keyPrefix: 'sk-', helpUrl: 'https://platform.openai.com/api-keys' },
  { id: 'gemini', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', defaultModel: 'gemini-2.0-flash', keyPrefix: 'AIza', helpUrl: 'https://aistudio.google.com/app/apikey' },
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile', keyPrefix: 'gsk_', helpUrl: 'https://console.groq.com/keys' },
  { id: 'custom', label: 'Custom', baseUrl: '', defaultModel: '', keyPrefix: '', helpUrl: '' },
];

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message: string };
}

export async function callAI(settings: AISettings, messages: ChatMessage[], systemPrompt?: string): Promise<string> {
  if (!settings.apiKey) throw new Error('No API key set. Open Settings and paste your API key.');
  if (!settings.model) throw new Error('No model set. Open Settings and choose a model.');
  if (!settings.baseUrl) throw new Error('No API base URL set. Open Settings and choose a provider.');

  const apiMessages: { role: string; content: string }[] = [];
  if (systemPrompt) apiMessages.push({ role: 'system', content: systemPrompt });
  for (const msg of messages) {
    if (msg.pending || msg.error) continue;
    apiMessages.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content });
  }

  const url = `${settings.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${settings.apiKey}`,
  };
  // OpenRouter recommends these headers
  if (settings.baseUrl.includes('openrouter')) {
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'LuStudio';
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: settings.model,
      messages: apiMessages,
      temperature: 0.7,
      max_tokens: 8192,
    }),
  });

  const data: ChatCompletionResponse = await res.json().catch(() => ({}));

  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `API error (HTTP ${res.status}). Check your API key, model, and provider.`);
  }

  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('AI returned an empty response.');
  return text.trim();
}

export function parseAIFileActions(text: string): AIFileAction[] {
  const actions: AIFileAction[] = [];
  const regex = /```(\w+)?\s*(?:file:)?\s*([^\n]*?)\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const lang = match[1] || '';
    let pathStr = match[2]?.trim() || '';
    const content = match[3];
    if (!pathStr || (!pathStr.includes('.') && !pathStr.includes('/'))) {
      if (lang && (lang.includes('.') || lang.includes('/'))) pathStr = lang; else continue;
    }
    const fileName = pathStr.split('/').pop() || pathStr;
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const langMap: Record<string, string> = { tsx: 'tsx', ts: 'typescript', jsx: 'jsx', js: 'javascript', json: 'json', css: 'css', html: 'html', md: 'markdown' };
    actions.push({ path: pathStr, content: content.trimEnd(), language: langMap[ext] ?? lang ?? 'plaintext' });
  }
  return actions;
}

export function buildSystemPrompt(fileList: string[]): string {
  return `You are LuStudio AI, an expert programming assistant embedded in a cloud IDE. You can WRITE and EDIT files directly.

When the user asks you to build, create, or modify code, you MUST output code blocks with file paths in this exact format:

\`\`\`tsx src/App.tsx
// code here
\`\`\`

The first line after the triple backticks is the file path (relative to project root), followed by a newline and the file content. Use this format for EVERY file you create or modify.

Current project files:
${fileList.length > 0 ? fileList.join('\n') : '(empty project)'}

Rules:
- Always include the file path in the code block header.
- For modifications, output the COMPLETE file content, not just the diff.
- Be concise in explanations between code blocks.
- Default to React + Vite + Tailwind CSS unless told otherwise.`;
}
