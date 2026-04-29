/**
 * SandboxComputerUI.jsx
 * AgentIQ Pro - Full Sandbox Computer Interface
 * Provides terminal, file manager, code editor, and system monitor
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SandboxComputer } from '../agent/SandboxComputer';
import { FileCreationManager } from '../agent/FileCreationManager';

// Singleton instances
let sandboxInstance = null;
let fileManagerInstance = null;

const getSandbox = () => {
  if (!sandboxInstance) sandboxInstance = new SandboxComputer();
  return sandboxInstance;
};

const getFileManager = () => {
  if (!fileManagerInstance) fileManagerInstance = new FileCreationManager(getSandbox().fs);
  return fileManagerInstance;
};

// ─── Terminal Component ───────────────────────────────────────────────────────
const Terminal = ({ sandbox }) => {
  const [history, setHistory] = useState([
    { type: 'system', text: '╔══════════════════════════════════════════╗' },
    { type: 'system', text: '║   AgentIQ Pro Sandbox Terminal v1.0      ║' },
    { type: 'system', text: '║   Type "help" for available commands      ║' },
    { type: 'system', text: '╚══════════════════════════════════════════╝' },
    { type: 'output', text: '' },
  ]);
  const [input, setInput] = useState('');
  const [cmdHistory, setCmdHistory] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [cwd, setCwd] = useState('/home/user');
  const [isRunning, setIsRunning] = useState(false);
  const termRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [history]);

  const prompt = `\x1b[32magentiq\x1b[0m@\x1b[36msandbox\x1b[0m:\x1b[34m${cwd.replace('/home/user', '~')}\x1b[0m$ `;

  const runCommand = useCallback(async (cmd) => {
    if (!cmd.trim()) {
      setHistory(h => [...h, { type: 'prompt', text: prompt + '' }]);
      return;
    }
    setHistory(h => [...h, { type: 'prompt', text: `agentiq@sandbox:${cwd.replace('/home/user', '~')}$ ${cmd}` }]);
    setCmdHistory(h => [cmd, ...h.filter(c => c !== cmd)].slice(0, 100));
    setHistIdx(-1);
    setIsRunning(true);
    try {
      const result = await sandbox.execute(cmd, { cwd });
      if (result.newCwd) setCwd(result.newCwd);
      if (result.clear) {
        setHistory([]);
      } else {
        const outputs = [];
        if (result.stdout) outputs.push({ type: 'output', text: result.stdout });
        if (result.stderr) outputs.push({ type: 'error', text: result.stderr });
        if (result.openEditor) outputs.push({ type: 'info', text: `[Editor] Opening ${result.openEditor}...` });
        if (outputs.length === 0 && result.exitCode !== 0) outputs.push({ type: 'error', text: `Command exited with code ${result.exitCode}` });
        setHistory(h => [...h, ...outputs]);
      }
    } catch (err) {
      setHistory(h => [...h, { type: 'error', text: err.message }]);
    } finally {
      setIsRunning(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [sandbox, cwd, prompt]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      runCommand(input);
      setInput('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = Math.min(histIdx + 1, cmdHistory.length - 1);
      setHistIdx(idx);
      setInput(cmdHistory[idx] || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const idx = Math.max(histIdx - 1, -1);
      setHistIdx(idx);
      setInput(idx === -1 ? '' : cmdHistory[idx] || '');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      // Simple tab completion
      const parts = input.split(' ');
      const last = parts[parts.length - 1];
      if (last) {
        const entries = sandbox.fs.listDir(cwd);
        const matches = entries.filter(e => e.name.startsWith(last));
        if (matches.length === 1) {
          parts[parts.length - 1] = matches[0].name + (matches[0].type === 'dir' ? '/' : '');
          setInput(parts.join(' '));
        } else if (matches.length > 1) {
          setHistory(h => [...h, { type: 'output', text: matches.map(m => m.name).join('  ') }]);
        }
      }
    } else if (e.key === 'c' && e.ctrlKey) {
      setIsRunning(false);
      setHistory(h => [...h, { type: 'output', text: '^C' }]);
      setInput('');
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setHistory([]);
    }
  };

  const renderLine = (line, i) => {
    const colors = { prompt: '#4ade80', output: '#e2e8f0', error: '#f87171', system: '#60a5fa', info: '#fbbf24' };
    return (
      <div key={i} style={{ color: colors[line.type] || '#e2e8f0', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {line.text}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f172a', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', background: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #334155' }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444' }} />
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#f59e0b' }} />
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#22c55e' }} />
        <span style={{ color: '#94a3b8', fontSize: '12px', marginLeft: '8px' }}>AgentIQ Pro Terminal — {cwd}</span>
        {isRunning && <span style={{ color: '#fbbf24', fontSize: '11px', marginLeft: 'auto' }}>● Running...</span>}
      </div>
      <div ref={termRef} style={{ flex: 1, overflowY: 'auto', padding: '12px', cursor: 'text' }} onClick={() => inputRef.current?.focus()}>
        {history.map(renderLine)}
        <div style={{ display: 'flex', alignItems: 'center', fontFamily: 'monospace', fontSize: '13px' }}>
          <span style={{ color: '#4ade80', whiteSpace: 'nowrap' }}>agentiq@sandbox:</span>
          <span style={{ color: '#60a5fa', whiteSpace: 'nowrap' }}>{cwd.replace('/home/user', '~')}</span>
          <span style={{ color: '#e2e8f0' }}>$ </span>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isRunning}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#e2e8f0', fontFamily: 'monospace', fontSize: '13px', caretColor: '#4ade80' }}
            autoFocus
            spellCheck={false}
            autoComplete="off"
          />
        </div>
      </div>
    </div>
  );
};

// ─── File Manager Component ───────────────────────────────────────────────────
const FileManager = ({ sandbox, fileManager, onOpenFile }) => {
  const [currentPath, setCurrentPath] = useState('/home/user');
  const [entries, setEntries] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showNewFile, setShowNewFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileContent, setNewFileContent] = useState('');
  const [viewMode, setViewMode] = useState('list'); // list | grid

  const refresh = useCallback(() => {
    setEntries(sandbox.fs.listDir(currentPath));
  }, [sandbox, currentPath]);

  useEffect(() => { refresh(); }, [refresh]);

  const navigate = (path) => {
    setCurrentPath(path);
    setSelected(null);
  };

  const goUp = () => {
    const parent = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
    navigate(parent);
  };

  const createNewFile = () => {
    if (!newFileName.trim()) return;
    const path = `${currentPath}/${newFileName}`;
    sandbox.fs.writeFile(path, newFileContent);
    fileManager.createFile(newFileName, null, newFileContent, { path });
    setShowNewFile(false);
    setNewFileName('');
    setNewFileContent('');
    refresh();
  };

  const deleteEntry = (entry) => {
    if (!window.confirm(`Delete ${entry.name}?`)) return;
    if (entry.type === 'dir') sandbox.fs.deleteDir(entry.path, true);
    else sandbox.fs.deleteFile(entry.path);
    refresh();
  };

  const downloadFile = (entry) => {
    const r = sandbox.fs.readFile(entry.path);
    if (!r.success) return;
    const blob = new Blob([r.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = entry.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fileIcons = { dir: '📁', js: '📜', jsx: '⚛️', ts: '📘', tsx: '⚛️', py: '🐍', html: '🌐', css: '🎨', json: '📋', md: '📝', txt: '📄', sh: '⚙️', yml: '⚙️', yaml: '⚙️', sql: '🗄️', png: '🖼️', jpg: '🖼️', gif: '🖼️', svg: '🎭', mp3: '🎵', mp4: '🎬', zip: '📦', pdf: '📕' };
  const getIcon = (entry) => {
    if (entry.type === 'dir') return '📁';
    const ext = entry.name.split('.').pop().toLowerCase();
    return fileIcons[ext] || '📄';
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  };

  const breadcrumbs = currentPath.split('/').filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f172a', color: '#e2e8f0' }}>
      {/* Toolbar */}
      <div style={{ padding: '8px 12px', background: '#1e293b', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <button onClick={goUp} style={btnStyle} title="Go up">⬆️</button>
        <button onClick={refresh} style={btnStyle} title="Refresh">🔄</button>
        <button onClick={() => setShowNewFile(true)} style={{ ...btnStyle, background: '#1d4ed8' }} title="New file">➕ New File</button>
        <button onClick={() => { sandbox.fs.mkdir(`${currentPath}/new_folder`); refresh(); }} style={btnStyle} title="New folder">📁 New Folder</button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#94a3b8' }}>
          <span onClick={() => navigate('/')} style={{ cursor: 'pointer', color: '#60a5fa' }}>/</span>
          {breadcrumbs.map((part, i) => {
            const path = '/' + breadcrumbs.slice(0, i + 1).join('/');
            return (
              <React.Fragment key={path}>
                <span style={{ color: '#475569' }}>/</span>
                <span onClick={() => navigate(path)} style={{ cursor: 'pointer', color: '#60a5fa' }}>{part}</span>
              </React.Fragment>
            );
          })}
        </div>
        <button onClick={() => setViewMode(v => v === 'list' ? 'grid' : 'list')} style={btnStyle}>{viewMode === 'list' ? '⊞' : '☰'}</button>
      </div>

      {/* New File Dialog */}
      {showNewFile && (
        <div style={{ padding: '12px', background: '#1e293b', borderBottom: '1px solid #334155' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input value={newFileName} onChange={e => setNewFileName(e.target.value)} placeholder="filename.js" style={inputStyle} onKeyDown={e => e.key === 'Enter' && createNewFile()} autoFocus />
            <button onClick={createNewFile} style={{ ...btnStyle, background: '#16a34a' }}>Create</button>
            <button onClick={() => setShowNewFile(false)} style={btnStyle}>Cancel</button>
          </div>
          <textarea value={newFileContent} onChange={e => setNewFileContent(e.target.value)} placeholder="File content (optional)..." style={{ ...inputStyle, height: '80px', resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }} />
        </div>
      )}

      {/* File List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {entries.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#475569', padding: '40px', fontSize: '14px' }}>Empty directory</div>
        ) : viewMode === 'list' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #334155', color: '#64748b' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Name</th>
                <th style={{ textAlign: 'right', padding: '4px 8px' }}>Size</th>
                <th style={{ textAlign: 'right', padding: '4px 8px' }}>Modified</th>
                <th style={{ textAlign: 'right', padding: '4px 8px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr key={i} onClick={() => { if (entry.type === 'dir') navigate(entry.path); else { setSelected(entry); onOpenFile?.(entry); } }} style={{ cursor: 'pointer', background: selected?.path === entry.path ? '#1e3a5f' : 'transparent', borderBottom: '1px solid #1e293b' }} onMouseEnter={e => e.currentTarget.style.background = '#1e293b'} onMouseLeave={e => e.currentTarget.style.background = selected?.path === entry.path ? '#1e3a5f' : 'transparent'}>
                  <td style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{getIcon(entry)}</span>
                    <span style={{ color: entry.type === 'dir' ? '#60a5fa' : '#e2e8f0' }}>{entry.name}</span>
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#64748b' }}>{formatSize(entry.size)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#64748b' }}>{entry.modified ? new Date(entry.modified).toLocaleDateString() : ''}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                    <button onClick={e => { e.stopPropagation(); downloadFile(entry); }} style={smallBtnStyle} title="Download">⬇️</button>
                    <button onClick={e => { e.stopPropagation(); deleteEntry(entry); }} style={{ ...smallBtnStyle, color: '#f87171' }} title="Delete">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px', padding: '8px' }}>
            {entries.map((entry, i) => (
              <div key={i} onClick={() => { if (entry.type === 'dir') navigate(entry.path); else { setSelected(entry); onOpenFile?.(entry); } }} style={{ padding: '12px 8px', background: '#1e293b', borderRadius: '8px', cursor: 'pointer', textAlign: 'center', border: selected?.path === entry.path ? '2px solid #3b82f6' : '2px solid transparent' }}>
                <div style={{ fontSize: '28px', marginBottom: '4px' }}>{getIcon(entry)}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', wordBreak: 'break-all' }}>{entry.name}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div style={{ padding: '4px 12px', background: '#1e293b', borderTop: '1px solid #334155', fontSize: '11px', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
        <span>{entries.length} items</span>
        <span>{currentPath}</span>
      </div>
    </div>
  );
};

// ─── Code Editor Component ────────────────────────────────────────────────────
const CodeEditor = ({ sandbox, initialFile = null }) => {
  const [filename, setFilename] = useState(initialFile?.name || 'untitled.js');
  const [content, setContent] = useState(initialFile ? (sandbox.fs.readFile(initialFile.path)?.content || '') : '// Write your code here\n');
  const [language, setLanguage] = useState('javascript');
  const [saved, setSaved] = useState(true);
  const [output, setOutput] = useState('');
  const [showOutput, setShowOutput] = useState(false);
  const textareaRef = useRef(null);

  const save = () => {
    const path = `/home/user/${filename}`;
    sandbox.fs.writeFile(path, content);
    setSaved(true);
    setOutput(`✓ Saved to ${path}`);
    setShowOutput(true);
  };

  const run = async () => {
    setShowOutput(true);
    setOutput('Running...');
    const path = `/home/user/${filename}`;
    sandbox.fs.writeFile(path, content);
    const result = await sandbox.execute(`node ${path}`);
    setOutput(result.stdout || result.stderr || '(no output)');
  };

  const download = () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const newContent = content.substring(0, start) + '  ' + content.substring(end);
      setContent(newContent);
      setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = start + 2; }, 0);
    }
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
    }
    setSaved(false);
  };

  const lineCount = content.split('\n').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f172a', color: '#e2e8f0' }}>
      {/* Toolbar */}
      <div style={{ padding: '8px 12px', background: '#1e293b', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input value={filename} onChange={e => setFilename(e.target.value)} style={{ ...inputStyle, width: '200px', fontSize: '13px' }} />
        <select value={language} onChange={e => setLanguage(e.target.value)} style={{ ...inputStyle, width: '120px' }}>
          {['javascript', 'typescript', 'python', 'html', 'css', 'json', 'markdown', 'bash', 'sql', 'yaml'].map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <button onClick={save} style={{ ...btnStyle, background: saved ? '#1e293b' : '#1d4ed8' }} title="Save (Ctrl+S)">💾 Save</button>
        <button onClick={run} style={{ ...btnStyle, background: '#16a34a' }} title="Run">▶ Run</button>
        <button onClick={download} style={btnStyle} title="Download">⬇️</button>
        <button onClick={() => setShowOutput(v => !v)} style={btnStyle}>📋 Output</button>
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#64748b' }}>{lineCount} lines • {content.length} chars • {saved ? '✓ Saved' : '● Unsaved'}</span>
      </div>

      {/* Editor */}
      <div style={{ flex: showOutput ? '0 0 60%' : 1, display: 'flex', overflow: 'hidden' }}>
        {/* Line numbers */}
        <div style={{ padding: '12px 8px', background: '#0a0f1e', color: '#475569', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.6', textAlign: 'right', userSelect: 'none', minWidth: '40px', overflowY: 'hidden' }}>
          {Array.from({ length: lineCount }, (_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={e => { setContent(e.target.value); setSaved(false); }}
          onKeyDown={handleKeyDown}
          style={{ flex: 1, background: '#0f172a', color: '#e2e8f0', border: 'none', outline: 'none', padding: '12px', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.6', resize: 'none', overflowY: 'auto' }}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
      </div>

      {/* Output Panel */}
      {showOutput && (
        <div style={{ flex: '0 0 40%', background: '#020617', borderTop: '1px solid #334155', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '4px 12px', background: '#1e293b', fontSize: '12px', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
            <span>Output</span>
            <button onClick={() => setOutput('')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '11px' }}>Clear</button>
          </div>
          <pre style={{ flex: 1, overflowY: 'auto', padding: '12px', margin: 0, fontFamily: 'monospace', fontSize: '12px', color: '#4ade80', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{output}</pre>
        </div>
      )}
    </div>
  );
};

// ─── System Monitor Component ─────────────────────────────────────────────────
const SystemMonitor = ({ sandbox }) => {
  const [info, setInfo] = useState(null);
  const [processes, setProcesses] = useState([]);

  useEffect(() => {
    const update = () => {
      setInfo(sandbox.getSystemInfo());
      setProcesses(sandbox.getProcesses());
    };
    update();
    const interval = setInterval(update, 3000);
    return () => clearInterval(interval);
  }, [sandbox]);

  if (!info) return <div style={{ padding: '20px', color: '#64748b' }}>Loading...</div>;

  return (
    <div style={{ padding: '16px', color: '#e2e8f0', overflowY: 'auto', height: '100%' }}>
      <h3 style={{ color: '#60a5fa', marginBottom: '16px' }}>System Information</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'OS', value: info.os },
          { label: 'Kernel', value: info.kernel },
          { label: 'Architecture', value: info.arch },
          { label: 'Uptime', value: `${Math.floor(info.uptime / 60)}m ${info.uptime % 60}s` },
          { label: 'Memory', value: `${info.memory.used} / ${info.memory.total}` },
          { label: 'Disk', value: `${info.disk.used} / ${info.disk.total}` },
          { label: 'Packages', value: info.packages },
          { label: 'Processes', value: info.processes },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: '#1e293b', borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>{label}</div>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>{value}</div>
          </div>
        ))}
      </div>
      <h3 style={{ color: '#60a5fa', marginBottom: '12px' }}>Processes</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #334155', color: '#64748b' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px' }}>PID</th>
            <th style={{ textAlign: 'left', padding: '6px 8px' }}>Name</th>
            <th style={{ textAlign: 'left', padding: '6px 8px' }}>Command</th>
            <th style={{ textAlign: 'right', padding: '6px 8px' }}>CPU%</th>
            <th style={{ textAlign: 'right', padding: '6px 8px' }}>MEM MB</th>
            <th style={{ textAlign: 'right', padding: '6px 8px' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {processes.map((p, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '6px 8px', color: '#64748b' }}>{p.pid}</td>
              <td style={{ padding: '6px 8px', color: '#4ade80' }}>{p.name}</td>
              <td style={{ padding: '6px 8px', color: '#94a3b8' }}>{p.command}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{p.cpu?.toFixed(1)}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{p.memory}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}><span style={{ color: p.status === 'running' ? '#4ade80' : '#f87171', fontSize: '11px' }}>● {p.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─── Main SandboxComputerUI ───────────────────────────────────────────────────
const SandboxComputerUI = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState('terminal');
  const [openFile, setOpenFile] = useState(null);
  const sandbox = getSandbox();
  const fileManager = getFileManager();

  const tabs = [
    { id: 'terminal', label: '⌨️ Terminal', icon: '⌨️' },
    { id: 'files', label: '📁 Files', icon: '📁' },
    { id: 'editor', label: '📝 Editor', icon: '📝' },
    { id: 'monitor', label: '📊 Monitor', icon: '📊' },
  ];

  const handleOpenFile = (entry) => {
    setOpenFile(entry);
    setActiveTab('editor');
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '95vw', height: '90vh', background: '#0f172a', borderRadius: '12px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.8)' }}>
        {/* Title bar */}
        <div style={{ padding: '10px 16px', background: '#1e293b', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '18px' }}>🖥️</span>
          <span style={{ color: '#e2e8f0', fontWeight: 600 }}>AgentIQ Pro Sandbox Computer</span>
          <span style={{ color: '#64748b', fontSize: '12px' }}>Persistent Ubuntu-compatible environment</span>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: '#ef4444', border: 'none', color: 'white', borderRadius: '6px', padding: '4px 12px', cursor: 'pointer', fontWeight: 600 }}>✕ Close</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', background: '#1e293b', borderBottom: '1px solid #334155' }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '10px 20px', background: activeTab === tab.id ? '#0f172a' : 'transparent', border: 'none', borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent', color: activeTab === tab.id ? '#e2e8f0' : '#64748b', cursor: 'pointer', fontSize: '13px', fontWeight: activeTab === tab.id ? 600 : 400, transition: 'all 0.15s' }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {activeTab === 'terminal' && <Terminal sandbox={sandbox} />}
          {activeTab === 'files' && <FileManager sandbox={sandbox} fileManager={fileManager} onOpenFile={handleOpenFile} />}
          {activeTab === 'editor' && <CodeEditor sandbox={sandbox} initialFile={openFile} />}
          {activeTab === 'monitor' && <SystemMonitor sandbox={sandbox} />}
        </div>
      </div>
    </div>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const btnStyle = {
  padding: '5px 10px',
  background: '#1e293b',
  border: '1px solid #334155',
  color: '#e2e8f0',
  borderRadius: '5px',
  cursor: 'pointer',
  fontSize: '12px',
  whiteSpace: 'nowrap',
};

const smallBtnStyle = {
  padding: '2px 6px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: '13px',
};

const inputStyle = {
  padding: '5px 8px',
  background: '#0f172a',
  border: '1px solid #334155',
  color: '#e2e8f0',
  borderRadius: '5px',
  fontSize: '12px',
  outline: 'none',
  width: '100%',
};

export { getSandbox, getFileManager };
export default SandboxComputerUI;
