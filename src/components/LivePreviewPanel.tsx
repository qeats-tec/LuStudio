import { useState, useEffect, useMemo, useRef } from 'react';
import { RefreshCw, ExternalLink, Monitor, Smartphone, Tablet, Eye, Play, Loader as Loader2 } from 'lucide-react';
import type { FileNode } from '../types';

interface LivePreviewPanelProps {
  files: FileNode[];
  activeTabName: string | null;
  autoRun: boolean;
}

type Device = 'desktop' | 'tablet' | 'mobile';
const deviceWidths: Record<Device, string> = { desktop: '100%', tablet: '768px', mobile: '375px' };

function findFirstMatch(nodes: FileNode[], predicate: (n: FileNode) => boolean): FileNode | null {
  for (const n of nodes) {
    if (predicate(n)) return n;
    if (n.type === 'folder' && n.children) {
      const f = findFirstMatch(n.children, predicate);
      if (f) return f;
    }
  }
  return null;
}

/**
 * Build a runnable HTML document from the current file tree.
 * Strategy: find index.html and inject <script>/<style> from JS/CSS files; if no
 * index.html, synthesize one from any JS/TS/JSX/TSX + CSS content.
 */
function buildPreviewDoc(files: FileNode[]): string {
  const indexHtml = findFirstMatch(files, (n) => n.type === 'file' && n.name.toLowerCase() === 'index.html');

  // Collect CSS and JS content
  const cssFiles = files.filter((n) => n.type === 'file' && n.name.endsWith('.css'));
  const jsFiles = files.filter(
    (n) => n.type === 'file' && (n.name.endsWith('.js') || n.name.endsWith('.jsx') || n.name.endsWith('.ts') || n.name.endsWith('.tsx')),
  );

  const cssBlock = cssFiles.map((f) => `<style data-src="${f.path}">\n${f.content ?? ''}\n</style>`).join('\n');
  // For preview we only run plain JS; TS/JSX is shown but not transpiled.
  const runnableJs = jsFiles.filter((f) => f.name.endsWith('.js'));
  const jsBlock = runnableJs.map((f) => `<script data-src="${f.path}">\n${f.content ?? ''}\n</script>`).join('\n');

  if (indexHtml && indexHtml.content) {
    let html = indexHtml.content;
    // Inject CSS before </head>
    if (cssBlock && html.includes('</head>')) {
      html = html.replace('</head>', `${cssBlock}\n</head>`);
    } else if (cssBlock) {
      html = `${cssBlock}\n${html}`;
    }
    // Inject JS before </body>
    if (jsBlock && html.includes('</body>')) {
      html = html.replace('</body>', `${jsBlock}\n</body>`);
    } else if (jsBlock) {
      html = `${html}\n${jsBlock}`;
    }
    return html;
  }

  // Synthesize a document
  const bodyContent = jsFiles.length === 0 && cssFiles.length === 0 ? '<p style="font-family:sans-serif;color:#888;padding:24px">Önizleme için bir HTML, CSS veya JS dosyası oluşturun.</p>' : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>LuStudio Preview</title>
${cssBlock}
</head>
<body>
${bodyContent}
${jsBlock}
</body>
</html>`;
}

export function LivePreviewPanel({ files, activeTabName, autoRun }: LivePreviewPanelProps) {
  const [device, setDevice] = useState<Device>('desktop');
  const [refreshKey, setRefreshKey] = useState(0);
  const [srcDoc, setSrcDoc] = useState<string>('');
  const [running, setRunning] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasFiles = files.length > 0;

  const generatedDoc = useMemo(() => (hasFiles ? buildPreviewDoc(files) : ''), [files, hasFiles]);

  useEffect(() => {
    if (!autoRun) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setRunning(true);
    debounceRef.current = setTimeout(() => {
      setSrcDoc(generatedDoc);
      setRunning(false);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [generatedDoc, autoRun]);

  // Initialize srcDoc on mount / when first files appear
  useEffect(() => {
    if (autoRun && hasFiles && !srcDoc) setSrcDoc(generatedDoc);
  }, [autoRun, hasFiles, generatedDoc, srcDoc]);

  const handleRun = () => {
    setRunning(true);
    setSrcDoc(generatedDoc);
    setRefreshKey((k) => k + 1);
    setTimeout(() => setRunning(false), 300);
  };

  return (
    <div className="flex h-full flex-col bg-coal-900">
      <div className="flex items-center justify-between border-b border-coal-800 bg-coal-950 px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-coal-300">
          <div className="flex items-center gap-1.5">
            <div className={`h-2 w-2 rounded-full ${hasFiles ? 'bg-green-500' : 'bg-coal-600'}`} />
            <span className="font-medium">Canlı Önizleme</span>
          </div>
          <span className="text-coal-600">|</span>
          <span className="text-coal-400 truncate max-w-[180px]">{activeTabName ?? 'preview'}</span>
          {running && <Loader2 size={11} className="animate-spin text-accent-400" />}
        </div>
        <div className="flex items-center gap-1">
          <div className="mr-1 flex items-center gap-0.5 rounded-md bg-coal-850 p-0.5">
            {(['desktop', 'tablet', 'mobile'] as Device[]).map((d) => {
              const Icon = d === 'desktop' ? Monitor : d === 'tablet' ? Tablet : Smartphone;
              return (
                <button key={d} onClick={() => setDevice(d)} title={d}
                  className={`rounded p-1 transition-colors ${device === d ? 'bg-coal-700 text-accent-400' : 'text-coal-400 hover:text-coal-200'}`}>
                  <Icon size={13} />
                </button>
              );
            })}
          </div>
          <button onClick={handleRun} title="Çalıştır / Önizle"
            className="flex items-center gap-1 rounded-md bg-accent-400/15 px-2 py-1 text-[11px] text-accent-400 transition-colors hover:bg-accent-400/25">
            <Play size={12} /> Çalıştır
          </button>
          <button onClick={() => setRefreshKey((k) => k + 1)} title="Yenile"
            className="rounded p-1.5 text-coal-400 transition-colors hover:bg-coal-800 hover:text-coal-100">
            <RefreshCw size={13} />
          </button>
          <button title="Yeni sekmede aç" onClick={() => {
            const w = window.open();
            if (w) { w.document.write(srcDoc || generatedDoc); w.document.close(); }
          }}
            className="rounded p-1.5 text-coal-400 transition-colors hover:bg-coal-800 hover:text-coal-100">
            <ExternalLink size={13} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 items-start justify-center overflow-auto bg-coal-950 p-3">
        {hasFiles ? (
          <div className="h-full overflow-hidden rounded-lg border border-coal-700 bg-white shadow-2xl transition-all duration-300"
            style={{ width: deviceWidths[device], maxWidth: '100%' }}>
            <iframe key={refreshKey} title="LuStudio Canlı Önizleme" className="h-full w-full border-0"
              sandbox="allow-scripts allow-modals allow-forms allow-popups allow-same-origin"
              srcDoc={srcDoc || generatedDoc} />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-coal-850 text-coal-500">
              <Eye size={28} />
            </div>
            <h3 className="mb-1 text-sm font-medium text-coal-300">Henüz önizleme yok</h3>
            <p className="text-xs text-coal-500">Dosya oluşturun veya AI'dan bir şeyler inşa etmesini isteyin</p>
          </div>
        )}
      </div>
    </div>
  );
}
