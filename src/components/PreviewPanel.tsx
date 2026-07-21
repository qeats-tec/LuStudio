import { RefreshCw, ExternalLink, Monitor, Smartphone, Tablet, Eye } from 'lucide-react';
import { useState } from 'react';

interface PreviewPanelProps {
  activeFile: string | null;
  hasFiles: boolean;
}

type Device = 'desktop' | 'tablet' | 'mobile';
const deviceWidths: Record<Device, string> = { desktop: '100%', tablet: '768px', mobile: '375px' };

export function PreviewPanel({ activeFile, hasFiles }: PreviewPanelProps) {
  const [device, setDevice] = useState<Device>('desktop');
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="flex h-full flex-col bg-coal-900">
      <div className="flex items-center justify-between border-b border-coal-800 bg-coal-950 px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-coal-300">
          <div className="flex items-center gap-1.5">
            <div className={`h-2 w-2 rounded-full ${hasFiles ? 'bg-green-500' : 'bg-coal-600'}`} />
            <span className="font-medium">Preview</span>
          </div>
          <span className="text-coal-500">|</span>
          <span className="text-coal-400 truncate max-w-[200px]">{activeFile || 'localhost:5173'}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="mr-2 flex items-center gap-0.5 rounded-md bg-coal-850 p-0.5">
            {(['desktop', 'tablet', 'mobile'] as Device[]).map((d) => {
              const Icon = d === 'desktop' ? Monitor : d === 'tablet' ? Tablet : Smartphone;
              return (
                <button key={d} onClick={() => setDevice(d)}
                  className={`rounded p-1 transition-colors ${device === d ? 'bg-coal-700 text-accent-400' : 'text-coal-400 hover:text-coal-200'}`}>
                  <Icon size={14} />
                </button>
              );
            })}
          </div>
          <button onClick={() => setRefreshKey((k) => k + 1)} title="Refresh"
            className="rounded p-1.5 text-coal-400 transition-colors hover:bg-coal-800 hover:text-coal-100"><RefreshCw size={14} /></button>
          <button title="Open in new tab"
            className="rounded p-1.5 text-coal-400 transition-colors hover:bg-coal-800 hover:text-coal-100"><ExternalLink size={14} /></button>
        </div>
      </div>
      <div className="flex flex-1 items-start justify-center overflow-auto bg-coal-950 p-4">
        {hasFiles ? (
          <div className="h-full overflow-hidden rounded-lg border border-coal-700 bg-white shadow-2xl transition-all duration-300"
            style={{ width: deviceWidths[device], maxWidth: '100%' }}>
            <iframe key={refreshKey} title="LuStudio Preview" className="h-full w-full border-0"
              srcDoc={`<!doctype html><html><head><style>body{font-family:'Inter',sans-serif;margin:0;padding:40px;background:#0a0a0b;color:#e5e5e5;display:flex;align-items:center;justify-content:center;min-height:100vh}.card{max-width:480px;padding:2rem;border-radius:12px;background:#161618;border:1px solid #2a2a2e;text-align:center}h1{color:#FBBF24;font-size:1.5rem;margin-bottom:.5rem}p{color:#ababb2;line-height:1.6;margin-bottom:1.5rem}.btn{display:inline-block;padding:.6rem 1.5rem;border-radius:8px;background:#FBBF24;color:#0a0a0b;font-weight:600;border:none;cursor:pointer}</style></head><body><div class="card"><h1>LuStudio Preview</h1><p>Your app preview will appear here. Use the AI assistant to build your project.</p><button class="btn">Get Started</button></div></body></html>`} />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-coal-850 text-coal-500"><Eye size={28} /></div>
            <h3 className="mb-1 text-sm font-medium text-coal-300">No preview yet</h3>
            <p className="text-xs text-coal-500">Create files or ask the AI to build something</p>
          </div>
        )}
      </div>
    </div>
  );
}
