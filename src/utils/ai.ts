import type { ChatMessage, AIFileAction, AIStructuredAction } from '../types';

export interface AISettings {
  apiKey: string;
  model: string;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message: string };
}

export async function callAI(settings: AISettings, messages: ChatMessage[], systemPrompt?: string): Promise<string> {
  if (!settings.apiKey) throw new Error('No API key set. Click Settings to add one.');
  if (!settings.model) throw new Error('No model set. Enter a model ID like google/gemma-4-31b-it:free');

  const apiMessages: { role: string; content: string }[] = [];
  if (systemPrompt) apiMessages.push({ role: 'system', content: systemPrompt });
  for (const msg of messages) {
    if (msg.pending || msg.error) continue;
    apiMessages.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content });
  }

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'LuStudio',
    },
    body: JSON.stringify({
      model: settings.model,
      messages: apiMessages,
      temperature: 0.7,
      max_tokens: 8192,
    }),
  });

  const data: ChatCompletionResponse = await res.json().catch(() => ({}));

  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `API error (HTTP ${res.status}). Check your API key and model.`);
  }

  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('AI returned an empty response.');
  return text.trim();
}

const LANG_MAP: Record<string, string> = {
  tsx: 'tsx', ts: 'typescript', jsx: 'jsx', js: 'javascript',
  json: 'json', css: 'css', html: 'html', md: 'markdown',
  py: 'python', go: 'go', rs: 'rust', txt: 'plaintext',
};

function langForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return LANG_MAP[ext] ?? 'plaintext';
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
      if (lang && (lang.includes('.') || lang.includes('/'))) pathStr = lang;
      else continue;
    }
    const fileName = pathStr.split('/').pop() || pathStr;
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    actions.push({ path: pathStr, content: content.trimEnd(), language: LANG_MAP[ext] ?? lang ?? 'plaintext' });
  }
  return actions;
}

/**
 * Parse structured JSON actions from AI response.
 * Looks for JSON objects wrapped in <lustudio-action> tags or fenced ```json blocks
 * matching the shape { action: "create_folder" | "create_file", ... }.
 */
export function parseAIStructuredActions(text: string): AIStructuredAction[] {
  const actions: AIStructuredAction[] = [];

  // Tag-wrapped JSON: <lustudio-action>{...}</lustudio-action>
  const tagRegex = /<lustudio-action>([\s\S]*?)<\/lustudio-action>/g;
  // Fenced json: ```json\n{...}\n```
  const fenceRegex = /```json\s*\n([\s\S]*?)```/g;

  const candidates: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = tagRegex.exec(text)) !== null) candidates.push(m[1].trim());
  while ((m = fenceRegex.exec(text)) !== null) candidates.push(m[1].trim());

  for (const raw of candidates) {
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) {
        if (!item || typeof item !== 'object' || typeof item.action !== 'string') continue;
        if (item.action === 'create_folder' && typeof item.name === 'string' && typeof item.path === 'string') {
          actions.push({ action: 'create_folder', name: item.name, path: item.path });
        } else if (
          item.action === 'create_file' &&
          typeof item.name === 'string' &&
          typeof item.path === 'string' &&
          typeof item.content === 'string'
        ) {
          actions.push({
            action: 'create_file',
            name: item.name,
            path: item.path,
            content: item.content,
            language: typeof item.language === 'string' ? item.language : langForPath(item.path),
          });
        }
      }
    } catch {
      /* not valid JSON, skip */
    }
  }
  return actions;
}

export function buildSystemPrompt(fileList: string[]): string {
  return `You are LuStudio AI, an expert programming assistant embedded in a cloud IDE. You can WRITE and EDIT files directly.

## File creation format
When the user asks you to build, create, or modify code, output code blocks with file paths in this exact format:

\`\`\`tsx src/App.tsx
// code here
\`\`\`

The first line after the triple backticks is the file path (relative to project root), followed by a newline and the file content. Use this format for EVERY file you create or modify.

## Folder & file creation commands
When the user explicitly asks to CREATE A FOLDER or CREATE A FILE with a specific name/path (e.g. "components klasörü oluştur", "create a utils folder", "utils/helper.js dosyasını yarat", "make a file called config.json"), respond with a structured JSON action wrapped in <lustudio-action> tags INSTEAD of (or in addition to) a normal code block. Use exactly one of these shapes:

For a folder:
<lustudio-action>
{"action":"create_folder","name":"components","path":"/"}
</lustudio-action>

For a file:
<lustudio-action>
{"action":"create_file","name":"helper.js","path":"utils/helper.js","content":"// helper code here","language":"javascript"}
</lustudio-action>

Rules for structured actions:
- "path" is relative to project root. For folders it may end with "/" or omit it.
- For create_file, "content" must contain the full file content as a JSON string (escape newlines as \\n).
- "language" is optional; if omitted it is inferred from the file extension.
- You may output multiple <lustudio-action> blocks in one response.
- Only use structured actions when the user explicitly requests folder/file creation. For general code generation, use the fenced code block format above.

Current project files:
${fileList.length > 0 ? fileList.join('\n') : '(empty project)'}

General rules:
- Always include the file path in the code block header.
- For modifications, output the COMPLETE file content, not just the diff.
- Be concise in explanations between code blocks.
- Default to React + Vite + Tailwind CSS unless told otherwise.`;
}
