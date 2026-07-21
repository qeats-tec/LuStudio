// Lightweight syntax highlighter — tokenizes code into spans with CSS classes.
// Not a full parser; uses regex-based heuristics for common languages.

type Token = { type: string; value: string };

const KEYWORDS = new Set([
  'import', 'export', 'from', 'default', 'const', 'let', 'var', 'function',
  'return', 'if', 'else', 'for', 'while', 'class', 'extends', 'interface',
  'type', 'enum', 'async', 'await', 'new', 'try', 'catch', 'finally',
  'throw', 'break', 'continue', 'switch', 'case', 'do', 'in', 'of',
  'typeof', 'instanceof', 'void', 'delete', 'yield', 'static', 'public',
  'private', 'protected', 'readonly', 'implements', 'namespace', 'declare',
  'abstract', 'as', 'is', 'satisfies', 'override',
]);

const TYPES = new Set([
  'string', 'number', 'boolean', 'any', 'unknown', 'never', 'void',
  'object', 'null', 'undefined', 'symbol', 'bigint', 'true', 'false',
]);

function tokenizeTS(code: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < code.length) {
    const ch = code[i];

    // Comments — line
    if (ch === '/' && code[i + 1] === '/') {
      let end = code.indexOf('\n', i);
      if (end === -1) end = code.length;
      tokens.push({ type: 'comment', value: code.slice(i, end) });
      i = end;
      continue;
    }
    // Comments — block
    if (ch === '/' && code[i + 1] === '*') {
      let end = code.indexOf('*/', i + 2);
      if (end === -1) end = code.length;
      else end += 2;
      tokens.push({ type: 'comment', value: code.slice(i, end) });
      i = end;
      continue;
    }
    // Strings — template
    if (ch === '`') {
      let end = i + 1;
      while (end < code.length && code[end] !== '`') {
        if (code[end] === '\\') end++;
        end++;
      }
      end++;
      tokens.push({ type: 'string', value: code.slice(i, end) });
      i = end;
      continue;
    }
    // Strings — single/double
    if (ch === '"' || ch === "'") {
      let end = i + 1;
      while (end < code.length && code[end] !== ch) {
        if (code[end] === '\\') end++;
        end++;
      }
      end++;
      tokens.push({ type: 'string', value: code.slice(i, end) });
      i = end;
      continue;
    }
    // Numbers
    if (/[0-9]/.test(ch)) {
      let end = i;
      while (end < code.length && /[0-9.xXa-fA-F_]/.test(code[end])) end++;
      tokens.push({ type: 'number', value: code.slice(i, end) });
      i = end;
      continue;
    }
    // Identifiers / keywords
    if (/[a-zA-Z_$]/.test(ch)) {
      let end = i;
      while (end < code.length && /[a-zA-Z0-9_$]/.test(code[end])) end++;
      const word = code.slice(i, end);
      // Check if function call
      if (KEYWORDS.has(word)) {
        tokens.push({ type: 'keyword', value: word });
      } else if (TYPES.has(word)) {
        tokens.push({ type: 'number', value: word });
      } else if (code[end] === '(') {
        tokens.push({ type: 'func', value: word });
      } else if (/^[A-Z]/.test(word)) {
        tokens.push({ type: 'func', value: word });
      } else {
        tokens.push({ type: 'plain', value: word });
      }
      i = end;
      continue;
    }
    // JSX tags
    if (ch === '<' && /[a-zA-Z/]/.test(code[i + 1] || '')) {
      let end = i + 1;
      while (end < code.length && /[a-zA-Z0-9.\/>]/.test(code[end])) end++;
      tokens.push({ type: 'tag', value: code.slice(i, end) });
      i = end;
      continue;
    }
    // Punctuation
    if (/[{}()\[\];,.<>:?=+\-*/%&|!~^]/.test(ch)) {
      tokens.push({ type: 'punct', value: ch });
      i++;
      continue;
    }
    // Whitespace and other
    let end = i;
    while (end < code.length && /\s/.test(code[end])) end++;
    tokens.push({ type: 'plain', value: code.slice(i, end) });
    i = end;
  }
  return tokens;
}

function tokenizeCSS(code: string): Token[] {
  const tokens: Token[] = [];
  const lines = code.split('\n');
  lines.forEach((line, idx) => {
    // Comments
    if (line.trim().startsWith('/*') || line.trim().startsWith('//')) {
      tokens.push({ type: 'comment', value: line });
    } else if (line.includes('{') || line.includes('}')) {
      // Selectors / braces
      tokens.push({ type: 'tag', value: line });
    } else if (line.includes(':')) {
      const colonIdx = line.indexOf(':');
      tokens.push({ type: 'attr', value: line.slice(0, colonIdx + 1) });
      tokens.push({ type: 'plain', value: line.slice(colonIdx + 1) });
    } else {
      tokens.push({ type: 'plain', value: line });
    }
    if (idx < lines.length - 1) tokens.push({ type: 'plain', value: '\n' });
  });
  return tokens;
}

function tokenizeJSON(code: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (ch === '"') {
      let end = i + 1;
      while (end < code.length && code[end] !== '"') {
        if (code[end] === '\\') end++;
        end++;
      }
      end++;
      tokens.push({ type: 'string', value: code.slice(i, end) });
      i = end;
      continue;
    }
    if (/[0-9-]/.test(ch)) {
      let end = i;
      while (end < code.length && /[0-9.eE+\-]/.test(code[end])) end++;
      tokens.push({ type: 'number', value: code.slice(i, end) });
      i = end;
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      let end = i;
      while (end < code.length && /[a-zA-Z]/.test(code[end])) end++;
      tokens.push({ type: 'keyword', value: code.slice(i, end) });
      i = end;
      continue;
    }
    tokens.push({ type: 'punct', value: ch });
    i++;
  }
  return tokens;
}

export function tokenize(code: string, language: string): Token[] {
  switch (language) {
    case 'tsx':
    case 'ts':
    case 'jsx':
    case 'js':
    case 'typescript':
      return tokenizeTS(code);
    case 'css':
      return tokenizeCSS(code);
    case 'json':
      return tokenizeJSON(code);
    default:
      return [{ type: 'plain', value: code }];
  }
}

export function renderTokens(tokens: Token[]): string {
  return tokens
    .map(
      (t) =>
        `<span class="tok-${t.type}">${escapeHtml(t.value)}</span>`,
    )
    .join('');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
