import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import './App.css';
import ollamaService from './services/OllamaService';
import agentEngine from './services/AgentEngine';
import { WebResearchAgent, DataAnalysisAgent, CodeGenerationAgent, CreativeDesignAgent, DocumentAgent, FileHandlingAgent, IntegrationAgent, CollaborationAgent } from './agent/index.js';
import { FileCreationManager } from './agent/FileCreationManager';
import { SandboxComputer } from './agent/SandboxComputer';

// Lazy-load heavy components
const SandboxComputerUI = lazy(() => import('./components/SandboxComputerUI'));
const ObservabilityPanel = lazy(() => import('./components/ObservabilityPanel'));

// ─── Singleton Instances ──────────────────────────────────────────────────────
let _sandbox = null;
let _fileManager = null;
const getSandbox = () => { if (!_sandbox) _sandbox = new SandboxComputer(); return _sandbox; };
const getFileManager = () => { if (!_fileManager) _fileManager = new FileCreationManager(getSandbox().fs); return _fileManager; };

// ─── Constants ────────────────────────────────────────────────────────────────
const FEATURE_AGENTS_CONFIG = {
  webResearch:    { title: '🔍 Web Research Agent',    desc: 'Multi-source search, credibility scoring, citation tracking',   icon: '🔍', color: '#3b82f6' },
  dataAnalysis:   { title: '📊 Data Analysis Agent',   desc: 'CSV/JSON analysis, charts, statistics, trend detection',        icon: '📊', color: '#8b5cf6' },
  codeGeneration: { title: '💻 Code Generation Agent', desc: 'Full-stack apps, APIs, tests, CI/CD, documentation',            icon: '💻', color: '#10b981' },
  creativeDesign: { title: '🎨 Creative Design Agent', desc: 'UI components, design systems, mockups, color palettes',        icon: '🎨', color: '#f59e0b' },
  document:       { title: '📄 Document Agent',        desc: 'Reports, PDFs, DOCX, citations, multi-format export',           icon: '📄', color: '#ef4444' },
  fileHandling:   { title: '📁 File Handling Agent',   desc: 'Upload, convert, organize, OCR, batch processing',              icon: '📁', color: '#06b6d4' },
  integration:    { title: '🔗 Integration Agent',     desc: 'REST APIs, webhooks, Slack, GitHub, databases',                 icon: '🔗', color: '#84cc16' },
  collaboration:  { title: '👥 Collaboration Agent',   desc: 'Teams, workspaces, permissions, activity feeds',                icon: '👥', color: '#f97316' },
};

const FILE_ICONS = {
  image: '🖼️', pdf: '📄', code: '💻', text: '📝',
  audio: '🎵', video: '🎬', document: '📃',
  spreadsheet: '📊', archive: '📦', other: '📎'
};

const AGENT_MODES = [
  { id: 'chat',        label: '💬 Chat',        desc: 'Streaming conversation' },
  { id: 'autonomous',  label: '🎯 Autonomous',   desc: 'Multi-step task execution' },
  { id: 'multi-agent', label: '🕸️ Multi-Agent', desc: 'Parallel specialized agents' },
  { id: 'sandbox',     label: '🖥️ Sandbox',     desc: 'Code execution environment' },
  { id: 'research',    label: '🔍 Research',     desc: 'Deep web research mode' },
];

const FILE_TEMPLATES = [
  { id: 'react-component', label: '⚛️ React Component', ext: 'jsx' },
  { id: 'express-api',     label: '🚀 Express API',      ext: 'js' },
  { id: 'python-script',   label: '🐍 Python Script',    ext: 'py' },
  { id: 'readme',          label: '📝 README',           ext: 'md' },
  { id: 'package-json',    label: '📦 package.json',     ext: 'json' },
  { id: 'dockerfile',      label: '🐳 Dockerfile',       ext: '' },
  { id: 'github-action',   label: '⚙️ GitHub Action',    ext: 'yml' },
  { id: 'html-page',       label: '🌐 HTML Page',        ext: 'html' },
];

// ─── Utility Functions ────────────────────────────────────────────────────────
const getFileType = (filename) => {
  const ext = filename.split('.').pop().toLowerCase();
  if (['jpg','jpeg','png','gif','webp','svg','bmp'].includes(ext)) return 'image';
  if (['pdf'].includes(ext)) return 'pdf';
  if (['js','jsx','ts','tsx','py','java','cpp','c','h','css','html','json','xml','yaml','yml','sh','bash','rs','go','rb','php','swift','kt'].includes(ext)) return 'code';
  if (['txt','md','rtf'].includes(ext)) return 'text';
  if (['mp3','wav','ogg','flac'].includes(ext)) return 'audio';
  if (['mp4','avi','mov','mkv'].includes(ext)) return 'video';
  if (['doc','docx','odt'].includes(ext)) return 'document';
  if (['xls','xlsx','csv'].includes(ext)) return 'spreadsheet';
  if (['zip','rar','7z','tar','gz'].includes(ext)) return 'archive';
  return 'other';
};

const formatBytes = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const formatTime = (ts) => {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const renderMarkdown = (text) => {
  if (!text) return '';
  return text
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="code-block"><code>$2</code></pre>')
    .replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$1. $2</li>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\n\n/g, '</p><p class="md-p">')
    .replace(/\n/g, '<br/>');
};

// ─── MessageBubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg, onCopy, onCreateFile }) {
  const isUser = msg.role === 'user';
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`message-bubble ${isUser ? 'user' : 'assistant'} ${msg.error ? 'error' : ''}`}>
      <div className="message-avatar">{isUser ? '👤' : '🤖'}</div>
      <div className="message-content">
        {msg.autonomous   && <div className="badge autonomous-badge">🎯 Autonomous Agent</div>}
        {msg.multiAgent   && <div className="badge multi-agent-badge">🕸️ Multi-Agent</div>}
        {msg.sandboxMode  && <div className="badge sandbox-badge">🖥️ Sandbox</div>}
        {msg.researchMode && <div className="badge research-badge">🔍 Research</div>}
        {msg.featureAgent && <div className="badge feature-badge">{msg.featureIcon} {msg.featureName}</div>}
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="message-attachments">
            {msg.attachments.map((att, i) => (
              <span key={i} className="attachment-tag">{FILE_ICONS[att.type] || '📎'} {att.name}</span>
            ))}
          </div>
        )}
        <div className="message-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
        {msg.toolExecutions && msg.toolExecutions.length > 0 && (
          <div className="tool-executions-summary">
            <div className="tool-exec-header" onClick={() => setExpanded(v => !v)} style={{ cursor: 'pointer' }}>
              🛠️ Tools Used ({msg.toolExecutions.length}) {expanded ? '▲' : '▼'}
            </div>
            {expanded && msg.toolExecutions.map((te, i) => (
              <div key={i} className={`tool-exec-item ${te.result?.success ? 'success' : 'error'}`}>
                <span className="tool-exec-name">{te.tool}</span>
                <span className="tool-exec-status">{te.result?.success ? '✓' : '✗'}</span>
              </div>
            ))}
          </div>
        )}
        {msg.subResults && (
          <div className="sub-results">
            <div className="sub-results-header">🕸️ Sub-Agent Results ({msg.subResults.length})</div>
            {msg.subResults.map((sr, i) => (
              <div key={i} className={`sub-result ${sr.success ? 'success' : 'error'}`}>
                <span>Agent {i + 1}: {sr.subGoal?.substring(0, 50)}...</span>
                <span>{sr.success ? '✓' : '✗'}</span>
              </div>
            ))}
          </div>
        )}
        {msg.files && msg.files.length > 0 && (
          <div className="message-files">
            <div className="files-header">📁 Created Files</div>
            {msg.files.map((f, i) => (
              <div key={i} className="created-file-item">
                <span>📄 {f.name}</span>
                <button onClick={() => onCreateFile?.(f)} className="download-file-btn">⬇️ Save</button>
              </div>
            ))}
          </div>
        )}
        {msg.sandboxOutput && (
          <div className="sandbox-output">
            <div className="sandbox-output-header">🖥️ Sandbox Output</div>
            <pre className="sandbox-pre">{msg.sandboxOutput}</pre>
          </div>
        )}
        <div className="message-footer">
          <span className="message-time">{formatTime(msg.timestamp)}</span>
          {msg.model    && <span className="message-model">🤖 {msg.model}</span>}
          {msg.duration && <span className="message-duration">⏱️ {(msg.duration / 1000).toFixed(1)}s</span>}
          {msg.iterations && <span className="message-iterations">🔄 {msg.iterations} steps</span>}
          <button className="copy-btn" onClick={() => onCopy(msg.content)} title="Copy">📋</button>
        </div>
      </div>
    </div>
  );
}

// ─── AgentProgressPanel ───────────────────────────────────────────────────────
function AgentProgressPanel({ steps, toolExecutions, currentIteration, maxIterations }) {
  return (
    <div className="agent-progress-panel">
      <div className="agent-progress-header">
        <span>🎯 Agent Working...</span>
        <span className="iteration-count">Step {currentIteration}/{maxIterations}</span>
      </div>
      <div className="agent-progress-bar">
        <div className="agent-progress-fill" style={{ width: `${(currentIteration / maxIterations) * 100}%` }} />
      </div>
      {toolExecutions.length > 0 && (
        <div className="agent-tools-live">
          {toolExecutions.slice(-4).map((te, i) => (
            <div key={i} className="agent-tool-live-item">
              <span>⚙️ {te.tool}</span>
              {te.result && <span className={te.result.success ? 'tool-ok' : 'tool-err'}>{te.result.success ? '✓' : '✗'}</span>}
            </div>
          ))}
        </div>
      )}
      {steps.length > 0 && <div className="agent-last-step">💭 {steps[steps.length - 1]?.content?.substring(0, 120)}...</div>}
    </div>
  );
}

// ─── FileCreatorPanel ─────────────────────────────────────────────────────────
function FileCreatorPanel({ onClose, onFileCreated }) {
  const [tab, setTab] = useState('create'); // create | template | manage
  const [filename, setFilename] = useState('');
  const [content, setContent] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [templateVars, setTemplateVars] = useState({});
  const [createdFiles, setCreatedFiles] = useState([]);
  const fm = getFileManager();

  useEffect(() => {
    setCreatedFiles(fm.getAllFiles());
  }, [fm]);

  const handleCreate = () => {
    if (!filename.trim()) return;
    const file = fm.createFile(filename, null, content);
    setCreatedFiles(fm.getAllFiles());
    onFileCreated?.(file);
    setFilename('');
    setContent('');
  };

  const handleFromTemplate = () => {
    if (!selectedTemplate) return;
    const file = fm.createFromTemplate(selectedTemplate, null, templateVars);
    setCreatedFiles(fm.getAllFiles());
    onFileCreated?.(file);
  };

  const handleDownload = (file) => {
    const blob = new Blob([file.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = (fileId) => {
    fm.openFiles.delete(fileId);
    setCreatedFiles(fm.getAllFiles());
  };

  const codeStarters = {
    javascript: '// JavaScript\nconsole.log("Hello, World!");\n',
    typescript: '// TypeScript\nconst greeting: string = "Hello, World!";\nconsole.log(greeting);\n',
    python: '#!/usr/bin/env python3\nprint("Hello, World!")\n',
    html: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Page</title>\n</head>\n<body>\n  <h1>Hello, World!</h1>\n</body>\n</html>\n',
    css: '/* CSS Styles */\nbody {\n  margin: 0;\n  padding: 0;\n  font-family: sans-serif;\n}\n',
    json: '{\n  "name": "project",\n  "version": "1.0.0"\n}\n',
    markdown: '# Title\n\nContent here...\n',
    bash: '#!/bin/bash\necho "Hello, World!"\n',
    sql: '-- SQL Query\nSELECT * FROM table_name;\n',
    yaml: '# YAML Config\nname: project\nversion: 1.0.0\n',
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel file-creator-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📁 File Creator & Manager</h3>
          <button onClick={onClose} className="close-btn">✕</button>
        </div>
        <div className="modal-tabs">
          {[['create','✏️ Create'],['template','📋 Templates'],['manage','📂 Manage']].map(([id, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        <div className="modal-body">
          {tab === 'create' && (
            <div className="file-create-form">
              <div className="form-row">
                <div className="form-field">
                  <label>Filename</label>
                  <input value={filename} onChange={e => setFilename(e.target.value)} placeholder="e.g. app.js, styles.css, README.md" className="form-input" />
                </div>
                <div className="form-field">
                  <label>Language / Type</label>
                  <select value={language} onChange={e => { setLanguage(e.target.value); setContent(codeStarters[e.target.value] || ''); }} className="form-input">
                    {Object.keys(codeStarters).map(l => <option key={l} value={l}>{l}</option>)}
                    <option value="other">other</option>
                  </select>
                </div>
              </div>
              <div className="form-field">
                <label>Content</label>
                <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="File content..." className="form-input code-textarea" rows={12} style={{ fontFamily: 'monospace', fontSize: '13px' }} />
              </div>
              <div className="form-actions">
                <button onClick={handleCreate} disabled={!filename.trim()} className="btn-primary">📄 Create File</button>
                <button onClick={() => { setFilename(''); setContent(''); }} className="btn-secondary">Clear</button>
              </div>
            </div>
          )}
          {tab === 'template' && (
            <div className="template-panel">
              <div className="template-grid">
                {FILE_TEMPLATES.map(t => (
                  <div key={t.id} className={`template-card ${selectedTemplate === t.id ? 'selected' : ''}`} onClick={() => setSelectedTemplate(t.id)}>
                    <span className="template-icon">{t.label.split(' ')[0]}</span>
                    <span className="template-name">{t.label.split(' ').slice(1).join(' ')}</span>
                    {t.ext && <span className="template-ext">.{t.ext}</span>}
                  </div>
                ))}
              </div>
              {selectedTemplate && (
                <div className="template-vars">
                  <h4>Template Variables</h4>
                  {['name','title','description','author','port','endpoint','props','className'].map(v => (
                    <div key={v} className="form-field">
                      <label>{`{{${v}}}`}</label>
                      <input value={templateVars[v] || ''} onChange={e => setTemplateVars(p => ({ ...p, [v]: e.target.value }))} placeholder={`Enter ${v}...`} className="form-input" />
                    </div>
                  ))}
                  <button onClick={handleFromTemplate} className="btn-primary">📋 Create from Template</button>
                </div>
              )}
            </div>
          )}
          {tab === 'manage' && (
            <div className="file-manage-panel">
              {createdFiles.length === 0 ? (
                <div className="empty-state">No files created yet. Use the Create tab to make files.</div>
              ) : (
                <div className="file-list">
                  {createdFiles.map(file => (
                    <div key={file.id} className="file-item">
                      <div className="file-item-info">
                        <span className="file-item-icon">{FILE_ICONS[file.type] || '📄'}</span>
                        <div>
                          <div className="file-item-name">{file.name}</div>
                          <div className="file-item-meta">{formatBytes(file.size)} • v{file.version} • {new Date(file.modified).toLocaleString()}</div>
                        </div>
                      </div>
                      <div className="file-item-actions">
                        <button onClick={() => handleDownload(file)} className="btn-icon" title="Download">⬇️</button>
                        <button onClick={() => { navigator.clipboard.writeText(file.content); }} className="btn-icon" title="Copy">📋</button>
                        <button onClick={() => handleDelete(file.id)} className="btn-icon danger" title="Delete">🗑️</button>
                      </div>
                    </div>
                  ))}
                  <div className="file-manage-footer">
                    <button onClick={() => { createdFiles.forEach(f => handleDownload(f)); }} className="btn-secondary">⬇️ Download All</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── FeatureAgentModal ────────────────────────────────────────────────────────
function FeatureAgentModal({ agent, onClose }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState(null);
  const info = FEATURE_AGENTS_CONFIG[agent] || {};

  const runAgent = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setOutput(null);
    try {
      let result;
      switch(agent) {
        case 'webResearch':    result = await new WebResearchAgent().searchWeb(input); break;
        case 'dataAnalysis':   result = await new DataAnalysisAgent().analyzeData({ data: input, type: 'text' }); break;
        case 'codeGeneration': result = await new CodeGenerationAgent().generateCode({ description: input, language: 'javascript' }); break;
        case 'creativeDesign': result = await new CreativeDesignAgent().generateGenericComponent('react', 'material-ui', 'generic'); break;
        case 'document':       result = await new DocumentAgent().createDocument({ title: input, content: '' }); break;
        case 'fileHandling':   result = await new FileHandlingAgent().readFile(input); break;
        case 'integration':    result = await new IntegrationAgent().createIntegration('github', { baseUrl: 'https://api.github.com' }); break;
        case 'collaboration':  result = await new CollaborationAgent().createTeam({ name: input }); break;
        default:               result = { message: 'Agent not implemented' };
      }
      setOutput(result);
    } catch (err) {
      setOutput({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel feature-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ color: info.color }}>{info.title}</h3>
          <button onClick={onClose} className="close-btn">✕</button>
        </div>
        <div className="modal-body">
          <p className="agent-desc">{info.desc}</p>
          <div className="form-field">
            <label>Input</label>
            <textarea value={input} onChange={e => setInput(e.target.value)} placeholder="Enter your request..." className="form-input" rows={3} />
          </div>
          <button onClick={runAgent} disabled={loading || !input.trim()} className="btn-primary" style={{ background: info.color }}>
            {loading ? '⏳ Processing...' : '▶️ Run Agent'}
          </button>
          {output && (
            <div className="agent-output">
              <h4>Result</h4>
              <pre>{JSON.stringify(output, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SettingsPanel ────────────────────────────────────────────────────────────
function SettingsPanel({ config, onSave, onClose }) {
  const [url, setUrl] = useState(config.url);
  const [mode, setMode] = useState(config.mode);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem('agentiq_theme') || 'dark');
  const [streaming, setStreaming] = useState(localStorage.getItem('agentiq_streaming') !== 'false');
  const [defaultModel, setDefaultModel] = useState(localStorage.getItem('agentiq_default_model') || '');
  const [maxTokens, setMaxTokens] = useState(parseInt(localStorage.getItem('agentiq_max_tokens') || '4096'));
  const [temperature, setTemperature] = useState(parseFloat(localStorage.getItem('agentiq_temperature') || '0.7'));

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    ollamaService.setConfig({ url, mode, apiKey });
    const ok = await ollamaService.checkHealth();
    setTestResult(ok ? 'success' : 'error');
    setTesting(false);
  };

  const handleSave = () => {
    localStorage.setItem('agentiq_theme', theme);
    localStorage.setItem('agentiq_streaming', streaming);
    localStorage.setItem('agentiq_default_model', defaultModel);
    localStorage.setItem('agentiq_max_tokens', maxTokens);
    localStorage.setItem('agentiq_temperature', temperature);
    onSave({ url, mode, apiKey });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3>⚙️ Settings</h3><button onClick={onClose} className="close-btn">✕</button></div>
        <div className="modal-body">
          <div className="settings-section">
            <h4>🔌 Ollama Connection</h4>
            <div className="form-field">
              <label>Mode</label>
              <div className="btn-group">
                <button className={mode === 'local' ? 'active' : ''} onClick={() => { setMode('local'); setUrl('http://localhost:11434'); }}>🏠 Local</button>
                <button className={mode === 'cloud' ? 'active' : ''} onClick={() => setMode('cloud')}>☁️ Remote/Cloud</button>
              </div>
            </div>
            <div className="form-field">
              <label>Ollama URL</label>
              <input value={url} onChange={e => setUrl(e.target.value)} placeholder="http://localhost:11434" className="form-input" />
            </div>
            <div className="form-field">
              <label>API Key (optional)</label>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Bearer token" className="form-input" />
            </div>
            <div className="form-actions">
              <button onClick={testConnection} disabled={testing} className="btn-secondary">{testing ? '⏳ Testing...' : '🔍 Test Connection'}</button>
              {testResult && <span className={`test-badge ${testResult}`}>{testResult === 'success' ? '✅ Connected' : '❌ Failed'}</span>}
            </div>
          </div>
          <div className="settings-section">
            <h4>🤖 Model Settings</h4>
            <div className="form-field">
              <label>Default Model</label>
              <input value={defaultModel} onChange={e => setDefaultModel(e.target.value)} placeholder="e.g. llama3.2:latest" className="form-input" />
            </div>
            <div className="form-row">
              <div className="form-field">
                <label>Max Tokens: {maxTokens}</label>
                <input type="range" min="512" max="32768" step="512" value={maxTokens} onChange={e => setMaxTokens(parseInt(e.target.value))} className="range-input" />
              </div>
              <div className="form-field">
                <label>Temperature: {temperature}</label>
                <input type="range" min="0" max="2" step="0.1" value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))} className="range-input" />
              </div>
            </div>
          </div>
          <div className="settings-section">
            <h4>🎨 Interface</h4>
            <div className="form-field">
              <label>Theme</label>
              <div className="btn-group">
                {['dark','light','system'].map(t => <button key={t} className={theme === t ? 'active' : ''} onClick={() => setTheme(t)}>{t}</button>)}
              </div>
            </div>
            <div className="form-field">
              <label>Streaming</label>
              <div className="toggle-row">
                <span>Enable streaming responses</span>
                <button className={`toggle-btn ${streaming ? 'on' : 'off'}`} onClick={() => setStreaming(v => !v)}>{streaming ? 'ON' : 'OFF'}</button>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} className="btn-primary">💾 Save Settings</button>
        </div>
      </div>
    </div>
  );
}

// ─── PullModelPanel ───────────────────────────────────────────────────────────
function PullModelPanel({ onClose, onPull }) {
  const [modelName, setModelName] = useState('');
  const [pulling, setPulling] = useState(false);
  const [progress, setProgress] = useState(null);

  const popularModels = [
    'llama3.2:latest', 'llama3.1:latest', 'mistral:latest', 'codellama:latest',
    'phi3:latest', 'gemma2:latest', 'qwen2.5:latest', 'deepseek-r1:latest',
    'llava:latest', 'nomic-embed-text:latest', 'mixtral:latest', 'solar:latest',
  ];

  const handlePull = async (name) => {
    const target = name || modelName;
    if (!target) return;
    setPulling(true);
    setProgress({ status: 'Starting...' });
    try {
      await ollamaService.pullModel(target, p => setProgress(p));
      setProgress({ status: 'Complete!', done: true });
      setTimeout(() => { onPull(); }, 1000);
    } catch (err) {
      setProgress({ status: `Error: ${err.message}` });
    } finally {
      setPulling(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3>📥 Pull Model</h3><button onClick={onClose} className="close-btn">✕</button></div>
        <div className="modal-body">
          <div className="form-field">
            <label>Model Name</label>
            <input value={modelName} onChange={e => setModelName(e.target.value)} placeholder="e.g. llama3.2:latest" className="form-input" onKeyDown={e => e.key === 'Enter' && handlePull()} />
          </div>
          <button onClick={() => handlePull()} disabled={pulling || !modelName} className="btn-primary">{pulling ? '⏳ Downloading...' : '📥 Pull Model'}</button>
          {progress && (
            <div className="pull-progress">
              <div className="pull-status">{progress.status}</div>
              {progress.total > 0 && (
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${Math.round((progress.completed / progress.total) * 100)}%` }} />
                </div>
              )}
            </div>
          )}
          <div className="settings-section">
            <h4>Popular Models</h4>
            <div className="popular-models-grid">
              {popularModels.map(m => (
                <button key={m} onClick={() => handlePull(m)} disabled={pulling} className="popular-model-btn">{m}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── QuickActionsBar ──────────────────────────────────────────────────────────
function QuickActionsBar({ onAction }) {
  const actions = [
    { id: 'sandbox',   icon: '🖥️', label: 'Sandbox Computer' },
    { id: 'newfile',   icon: '📄', label: 'Create File' },
    { id: 'research',  icon: '🔍', label: 'Web Research' },
    { id: 'code',      icon: '💻', label: 'Generate Code' },
    { id: 'analyze',   icon: '📊', label: 'Analyze Data' },
    { id: 'document',  icon: '📝', label: 'Create Doc' },
    { id: 'image',     icon: '🎨', label: 'Design' },
    { id: 'integrate', icon: '🔗', label: 'Integrate API' },
  ];
  return (
    <div className="quick-actions-bar">
      {actions.map(a => (
        <button key={a.id} className="quick-action-btn" onClick={() => onAction(a.id)} title={a.label}>
          <span>{a.icon}</span>
          <span className="quick-action-label">{a.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  // Core state
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [chatSessions, setChatSessions] = useState(() => {
    try { return JSON.parse(localStorage.getItem('agentiq_sessions') || '[]'); } catch { return []; }
  });
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [agentMode, setAgentMode] = useState('chat');

  // Agent progress
  const [agentProgress, setAgentProgress] = useState(null);
  const [agentSteps, setAgentSteps] = useState([]);
  const [agentToolExecutions, setAgentToolExecutions] = useState([]);
  const [currentIteration, setCurrentIteration] = useState(0);

  // UI state
  const [attachments, setAttachments] = useState([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [activeTab, setActiveTab] = useState('history');
  const [activeAgent, setActiveAgent] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showPullModel, setShowPullModel] = useState(false);
  const [showSandbox, setShowSandbox] = useState(false);
  const [showFileCreator, setShowFileCreator] = useState(false);
  const [showObservability, setShowObservability] = useState(false);
  const [notification, setNotification] = useState(null);
  const [useStreaming, setUseStreaming] = useState(localStorage.getItem('agentiq_streaming') !== 'false');
  const [createdFilesCount, setCreatedFilesCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  // ─── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => { localStorage.setItem('agentiq_sessions', JSON.stringify(chatSessions)); }, [chatSessions]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamingContent]);
  useEffect(() => {
    scanModels();
    const interval = setInterval(scanModels, 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unsubs = [
      agentEngine.on('task_start',    () => { setAgentProgress(true); setAgentSteps([]); setAgentToolExecutions([]); setCurrentIteration(0); }),
      agentEngine.on('iteration',     ({ iteration }) => setCurrentIteration(iteration)),
      agentEngine.on('step',          ({ content }) => setAgentSteps(p => [...p, { content }])),
      agentEngine.on('tool_start',    ({ tool }) => setAgentToolExecutions(p => [...p, { tool, status: 'running' }])),
      agentEngine.on('tool_complete', ({ tool, result }) => setAgentToolExecutions(p => { const u = [...p]; const idx = u.findLastIndex(t => t.tool === tool); if (idx >= 0) u[idx] = { ...u[idx], result }; return u; })),
      agentEngine.on('task_complete', () => setAgentProgress(null)),
      agentEngine.on('task_error',    () => setAgentProgress(null)),
    ];
    return () => unsubs.forEach(fn => fn && fn());
  }, []);

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  const showNotif = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const scanModels = async () => {
    const list = await ollamaService.fetchModels();
    setModels(list);
    setIsConnected(ollamaService.isConnected);
    if (list.length > 0 && !selectedModel) setSelectedModel(list[0].name);
  };

  const createNewSession = useCallback(() => {
    const id = `session-${Date.now()}`;
    const session = { id, title: 'New Chat', messages: [], created: Date.now(), model: selectedModel };
    setChatSessions(p => [session, ...p]);
    setActiveSessionId(id);
    setMessages([]);
    setStreamingContent('');
    return id;
  }, [selectedModel]);

  const loadSession = (session) => {
    setActiveSessionId(session.id);
    setMessages(session.messages || []);
    if (session.model) setSelectedModel(session.model);
  };

  const deleteSession = (id, e) => {
    e.stopPropagation();
    setChatSessions(p => p.filter(s => s.id !== id));
    if (activeSessionId === id) { setActiveSessionId(null); setMessages([]); }
  };

  const updateSession = useCallback((sessionId, newMessages) => {
    setChatSessions(p => p.map(s =>
      s.id === sessionId
        ? { ...s, messages: newMessages, title: newMessages.find(m => m.role === 'user')?.content?.substring(0, 45) || 'Chat' }
        : s
    ));
  }, []);

  const processFile = async (file) => new Promise(resolve => {
    if (file.type.startsWith('image/')) {
      const r = new FileReader();
      r.onload = e => resolve(`[Image: ${file.name}]\n${e.target.result.substring(0, 100)}...\n[/Image]`);
      r.readAsDataURL(file);
    } else {
      const r = new FileReader();
      r.onload = e => resolve(`[File: ${file.name}]\n\`\`\`\n${e.target.result.substring(0, 4000)}\n\`\`\``);
      r.readAsText(file);
    }
  });

  // ─── Sandbox execution helper ─────────────────────────────────────────────
  const runInSandbox = async (code, filename = 'script.js') => {
    const sandbox = getSandbox();
    sandbox.fs.writeFile(`/home/user/${filename}`, code);
    const result = await sandbox.execute(`node /home/user/${filename}`);
    return result;
  };

  // ─── Quick Actions ────────────────────────────────────────────────────────
  const handleQuickAction = (actionId) => {
    switch (actionId) {
      case 'sandbox':   setShowSandbox(true); break;
      case 'newfile':   setShowFileCreator(true); break;
      case 'research':  setAgentMode('research'); setPrompt('Research: '); break;
      case 'code':      setAgentMode('autonomous'); setPrompt('Generate code for: '); break;
      case 'analyze':   setActiveAgent('dataAnalysis'); break;
      case 'document':  setActiveAgent('document'); break;
      case 'image':     setActiveAgent('creativeDesign'); break;
      case 'integrate': setActiveAgent('integration'); break;
      default: break;
    }
  };

  // ─── File creation from AI response ──────────────────────────────────────
  const handleCreateFileFromMessage = (fileData) => {
    const fm = getFileManager();
    const file = fm.createFile(fileData.name, null, fileData.content);
    setCreatedFilesCount(fm.getAllFiles().length);
    // Trigger download
    const blob = new Blob([fileData.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileData.name;
    a.click();
    URL.revokeObjectURL(url);
    showNotif(`File "${fileData.name}" saved!`, 'success');
  };

  // ─── Extract code blocks from AI response ────────────────────────────────
  const extractCodeBlocks = (content) => {
    const blocks = [];
    const regex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const lang = match[1] || 'txt';
      const code = match[2];
      const extMap = { javascript: 'js', typescript: 'ts', python: 'py', html: 'html', css: 'css', json: 'json', bash: 'sh', yaml: 'yml', sql: 'sql', markdown: 'md' };
      blocks.push({ name: `generated_${blocks.length + 1}.${extMap[lang] || lang}`, content: code, type: 'code' });
    }
    return blocks;
  };

  // ─── Submit Handler ───────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedModel || (!prompt.trim() && attachments.length === 0) || isLoading) return;
    setIsLoading(true);
    setStreamingContent('');

    let sessionId = activeSessionId || createNewSession();
    let fileContext = '';
    for (const att of attachments) { fileContext += (await processFile(att.file)) + '\n\n'; }
    const userContent = fileContext ? `${fileContext}\n${prompt || 'Analyze the files above'}` : prompt;
    const userMsg = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: prompt,
      rawContent: userContent,
      attachments: attachments.map(a => ({ name: a.name, type: a.type })),
      timestamp: Date.now(),
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setPrompt('');
    setAttachments([]);

    try {
      if (agentMode === 'sandbox') {
        // Sandbox mode: extract and run code
        const result = await runInSandbox(userContent, 'agent_task.js');
        const assistantMsg = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: `Executed in sandbox:\n\`\`\`\n${result.stdout || result.stderr || '(no output)'}\n\`\`\``,
          sandboxMode: true,
          sandboxOutput: result.stdout || result.stderr,
          model: selectedModel,
          timestamp: Date.now(),
        };
        const final = [...newMessages, assistantMsg];
        setMessages(final);
        updateSession(sessionId, final);
      } else if (agentMode === 'autonomous') {
        const result = await agentEngine.runAutonomousTask(userContent, selectedModel);
        const files = extractCodeBlocks(result.response);
        const assistantMsg = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: result.response,
          autonomous: true,
          toolExecutions: result.toolExecutions,
          iterations: result.iterations,
          duration: result.duration,
          model: selectedModel,
          timestamp: Date.now(),
          files: files.length > 0 ? files : undefined,
        };
        // Auto-save files to sandbox
        if (files.length > 0) {
          const sandbox = getSandbox();
          files.forEach(f => sandbox.fs.writeFile(`/home/user/${f.name}`, f.content));
          setCreatedFilesCount(c => c + files.length);
        }
        const final = [...newMessages, assistantMsg];
        setMessages(final);
        updateSession(sessionId, final);
      } else if (agentMode === 'multi-agent') {
        const subGoals = agentEngine.decomposeGoal(userContent);
        const result = await agentEngine.runMultiAgentTask(userContent, selectedModel, subGoals);
        const assistantMsg = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: result.response,
          multiAgent: true,
          subResults: result.subResults,
          model: selectedModel,
          timestamp: Date.now(),
        };
        const final = [...newMessages, assistantMsg];
        setMessages(final);
        updateSession(sessionId, final);
      } else if (agentMode === 'research') {
        // Research mode: enhanced prompt for deep research
        const researchPrompt = `You are a deep research agent. Conduct thorough research on the following topic, providing multiple perspectives, sources, key findings, and a structured analysis:\n\n${userContent}`;
        const chatMessages = newMessages.map(m => ({ role: m.role, content: m.rawContent || m.content }));
        chatMessages[chatMessages.length - 1].content = researchPrompt;
        let fullResponse = '';
        if (useStreaming) {
          await ollamaService.chat({ model: selectedModel, messages: chatMessages, stream: true, onChunk: (chunk, full) => { fullResponse = full; setStreamingContent(full); } });
          setStreamingContent('');
        } else {
          const result = await ollamaService.chat({ model: selectedModel, messages: chatMessages });
          fullResponse = result.response;
        }
        const assistantMsg = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: fullResponse,
          researchMode: true,
          model: selectedModel,
          timestamp: Date.now(),
        };
        const final = [...newMessages, assistantMsg];
        setMessages(final);
        updateSession(sessionId, final);
      } else {
        // Chat mode
        const chatMessages = newMessages.map(m => ({ role: m.role, content: m.rawContent || m.content }));
        if (useStreaming) {
          let fullResponse = '';
          await ollamaService.chat({ model: selectedModel, messages: chatMessages, stream: true, onChunk: (chunk, full) => { fullResponse = full; setStreamingContent(full); } });
          setStreamingContent('');
          const files = extractCodeBlocks(fullResponse);
          const assistantMsg = {
            id: `msg-${Date.now()}`,
            role: 'assistant',
            content: fullResponse,
            model: selectedModel,
            timestamp: Date.now(),
            files: files.length > 0 ? files : undefined,
          };
          const final = [...newMessages, assistantMsg];
          setMessages(final);
          updateSession(sessionId, final);
        } else {
          const result = await ollamaService.chat({ model: selectedModel, messages: chatMessages });
          const files = extractCodeBlocks(result.response);
          const assistantMsg = {
            id: `msg-${Date.now()}`,
            role: 'assistant',
            content: result.response,
            model: selectedModel,
            timestamp: Date.now(),
            files: files.length > 0 ? files : undefined,
          };
          const final = [...newMessages, assistantMsg];
          setMessages(final);
          updateSession(sessionId, final);
        }
      }
    } catch (err) {
      const errorMsg = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `❌ **Error:** ${err.message}\n\nMake sure Ollama is running: \`ollama serve\``,
        error: true,
        timestamp: Date.now(),
      };
      const final = [...newMessages, errorMsg];
      setMessages(final);
      updateSession(sessionId, final);
    } finally {
      setIsLoading(false);
      setStreamingContent('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setAttachments(p => [...p, ...files.map(f => ({
      id: `f-${Date.now()}-${Math.random()}`,
      name: f.name,
      size: f.size,
      type: getFileType(f.name),
      file: f,
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
    }))]);
    e.target.value = '';
  };

  const removeAttachment = (id) => {
    setAttachments(p => {
      const a = p.find(x => x.id === id);
      if (a?.preview) URL.revokeObjectURL(a.preview);
      return p.filter(x => x.id !== id);
    });
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => showNotif('Copied to clipboard!', 'success'));
  };

  const exportChat = () => {
    const content = messages.map(m => `[${m.role.toUpperCase()}] ${m.content}`).join('\n\n---\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agentiq_chat_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showNotif('Chat exported!', 'success');
  };

  const filteredSessions = chatSessions.filter(s =>
    !searchQuery || s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {notification && (
        <div className={`notification ${notification.type}`}>{notification.msg}</div>
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${showSidebar ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <div className="logo">
            <span>🧠</span>
            <span className="logo-text">AgentIQ Pro</span>
          </div>
          <button className="icon-btn" onClick={() => setShowSidebar(false)}>◀</button>
        </div>

        <button className="new-chat-btn" onClick={createNewSession}>+ New Chat</button>

        <div className="sidebar-tabs">
          {[['history','💬','History'],['models','🤖','Models'],['tools','🛠️','Tools'],['agents','🎯','Agents'],['files','📁','Files']].map(([id,icon,label]) => (
            <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)}>{icon} {label}</button>
          ))}
        </div>

        <div className="sidebar-content">
          {activeTab === 'history' && (
            <div className="history-list">
              <div className="search-box">
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="🔍 Search chats..." className="search-input" />
              </div>
              {filteredSessions.length === 0
                ? <div className="empty-state">No chats yet</div>
                : filteredSessions.map(s => (
                  <div key={s.id} className={`history-item ${activeSessionId === s.id ? 'active' : ''}`} onClick={() => loadSession(s)}>
                    <div className="history-title">{s.title}</div>
                    <div className="history-meta"><span>{new Date(s.created).toLocaleDateString()}</span></div>
                    <button className="delete-btn" onClick={e => deleteSession(s.id, e)}>🗑️</button>
                  </div>
                ))
              }
            </div>
          )}

          {activeTab === 'models' && (
            <div className="models-panel">
              <div className="connection-row">
                <div className={`status-dot ${isConnected ? 'on' : 'off'}`} />
                <span>{isConnected ? `${models.length} models available` : 'Disconnected'}</span>
                <button className="refresh-btn" onClick={scanModels}>↻</button>
              </div>
              {!isConnected && (
                <div className="connection-help">
                  <p>Start Ollama:</p>
                  <code>ollama serve</code>
                </div>
              )}
              <div className="models-list">
                {models.map(m => (
                  <div key={m.name} className={`model-item ${selectedModel === m.name ? 'selected' : ''}`} onClick={() => setSelectedModel(m.name)}>
                    <span className="model-name">{m.name}</span>
                    {m.size && <span className="model-size">{formatBytes(m.size)}</span>}
                    {selectedModel === m.name && <span className="selected-check">✓</span>}
                  </div>
                ))}
              </div>
              <button className="pull-btn" onClick={() => setShowPullModel(true)}>📥 Pull New Model</button>
            </div>
          )}

          {activeTab === 'tools' && (
            <div className="tools-panel">
              <h4>🛠️ Agent Tools</h4>
              {Object.values(agentEngine.tools || {}).map(t => (
                <div key={t.name} className="tool-item">
                  <div className="tool-name">{t.name.replace(/_/g,' ')}</div>
                  <div className="tool-desc">{t.description}</div>
                </div>
              ))}
              <div className="tools-note">Tools activate automatically in Autonomous mode</div>
              <button className="btn-secondary" style={{ marginTop: '12px', width: '100%' }} onClick={() => setShowObservability(true)}>
                📊 Observability Panel
              </button>
            </div>
          )}

          {activeTab === 'agents' && (
            <div className="agents-panel">
              <h4>🎯 Specialized Agents</h4>
              <div className="agent-list">
                {Object.entries(FEATURE_AGENTS_CONFIG).map(([id, cfg]) => (
                  <button key={id} className={`agent-btn ${activeAgent === id ? 'active' : ''}`} onClick={() => setActiveAgent(id)} style={{ borderLeft: `3px solid ${cfg.color}` }}>
                    <span className="agent-btn-icon">{cfg.icon}</span>
                    <div className="agent-btn-info">
                      <span className="agent-btn-title">{cfg.title.split(' ').slice(1).join(' ')}</span>
                      <span className="agent-btn-desc">{cfg.desc.substring(0, 40)}...</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'files' && (
            <div className="files-panel">
              <h4>📁 File Manager</h4>
              <div className="files-actions">
                <button className="btn-primary" onClick={() => setShowFileCreator(true)}>✏️ Create File</button>
                <button className="btn-secondary" onClick={() => setShowSandbox(true)}>🖥️ Open Sandbox</button>
              </div>
              <div className="files-stats">
                <div className="stat-item"><span>Files Created</span><strong>{createdFilesCount}</strong></div>
                <div className="stat-item"><span>Sandbox Files</span><strong>{Object.keys(getSandbox().fs.nodes || {}).filter(k => getSandbox().fs.nodes[k]?.type === 'file').length}</strong></div>
              </div>
              <div className="recent-files">
                <h5>Recent Files</h5>
                {getFileManager().getRecentFiles(5).map((f, i) => (
                  <div key={i} className="recent-file-item">
                    <span>{FILE_ICONS[f.type] || '📄'} {f.name}</span>
                    <span className="file-size">{formatBytes(f.size)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <button className="settings-btn" onClick={() => setShowSettings(true)}>⚙️ Settings</button>
          {messages.length > 0 && (
            <button className="settings-btn" onClick={exportChat}>📤 Export Chat</button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="main">
        <header className="chat-header">
          {!showSidebar && <button className="icon-btn" onClick={() => setShowSidebar(true)}>▶</button>}
          <div className="mode-selector">
            {AGENT_MODES.map(({ id, label }) => (
              <button key={id} className={`mode-btn ${agentMode === id ? 'active' : ''}`} onClick={() => setAgentMode(id)} title={AGENT_MODES.find(m => m.id === id)?.desc}>{label}</button>
            ))}
          </div>
          <div className="header-right">
            <button className="icon-btn header-icon" onClick={() => setShowSandbox(true)} title="Sandbox Computer">🖥️</button>
            <button className="icon-btn header-icon" onClick={() => setShowFileCreator(true)} title="Create File">📄</button>
            <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} className="model-select-header">
              {models.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
            <div className={`conn-badge ${isConnected ? 'on' : 'off'}`}>{isConnected ? '🟢' : '🔴'}</div>
          </div>
        </header>

        <div className="chat-area">
          {messages.length === 0 && !streamingContent ? (
            <div className="welcome">
              <div className="welcome-icon">🧠</div>
              <h1>AgentIQ Pro</h1>
              <p className="welcome-sub">Advanced AI Agent Platform with Persistent Sandbox Computer</p>
              <div className="feature-grid">
                {[
                  ['💬','Chat Mode','Streaming AI conversations'],
                  ['🎯','Autonomous','Multi-step task execution'],
                  ['🕸️','Multi-Agent','Parallel specialized agents'],
                  ['🖥️','Sandbox Computer','Full Ubuntu-like environment'],
                  ['📄','File Creator','Create & manage any file type'],
                  ['🔍','Deep Research','Multi-source web research'],
                  ['📊','Data Analysis','Charts, stats, CSV/JSON'],
                  ['💻','Code Generation','Full-stack app generation'],
                  ['🎨','Design Agent','UI components & design systems'],
                  ['🔗','Integrations','APIs, webhooks, databases'],
                  ['📁','File Handling','Upload, convert, organize files'],
                  ['👥','Collaboration','Teams, workspaces, permissions'],
                ].map(([icon,title,desc]) => (
                  <div key={title} className="feature-card">
                    <span className="feature-icon">{icon}</span>
                    <h3>{title}</h3>
                    <p>{desc}</p>
                  </div>
                ))}
              </div>
              <QuickActionsBar onAction={handleQuickAction} />
            </div>
          ) : (
            <div className="messages">
              {messages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} onCopy={copyToClipboard} onCreateFile={handleCreateFileFromMessage} />
              ))}
              {streamingContent && (
                <div className="message-bubble assistant">
                  <div className="message-avatar">🤖</div>
                  <div className="message-content">
                    <div className="message-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingContent) }} />
                    <span className="cursor">▋</span>
                  </div>
                </div>
              )}
              {isLoading && !streamingContent && (
                <div className="message-bubble assistant">
                  <div className="message-avatar">🤖</div>
                  <div className="message-content">
                    <div className="typing-dots"><span/><span/><span/></div>
                  </div>
                </div>
              )}
              {agentProgress && (
                <AgentProgressPanel steps={agentSteps} toolExecutions={agentToolExecutions} currentIteration={currentIteration} maxIterations={10} />
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="input-area">
          {attachments.length > 0 && (
            <div className="attachments-row">
              {attachments.map(att => (
                <div key={att.id} className="attachment-chip">
                  {att.preview ? <img src={att.preview} alt={att.name} className="att-thumb" /> : <span>{FILE_ICONS[att.type]}</span>}
                  <span className="att-name">{att.name}</span>
                  <span className="att-size">{formatBytes(att.size)}</span>
                  <button onClick={() => removeAttachment(att.id)}>✕</button>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={handleSubmit} className="input-form">
            <div className="input-row">
              <button type="button" className="attach-btn" onClick={() => fileInputRef.current?.click()} title="Attach file">📎</button>
              <input type="file" ref={fileInputRef} onChange={handleFileSelect} multiple style={{ display:'none' }} accept="*/*" />
              <button type="button" className="attach-btn" onClick={() => setShowSandbox(true)} title="Open Sandbox">🖥️</button>
              <button type="button" className="attach-btn" onClick={() => setShowFileCreator(true)} title="Create File">📄</button>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  agentMode === 'autonomous' ? '🎯 Describe a goal for the autonomous agent...' :
                  agentMode === 'multi-agent' ? '🕸️ Describe a complex task for multiple agents...' :
                  agentMode === 'sandbox' ? '🖥️ Enter code or commands to run in sandbox...' :
                  agentMode === 'research' ? '🔍 Enter a topic to research deeply...' :
                  '💬 Type a message... (Shift+Enter for new line)'
                }
                className="prompt-input"
                rows={1}
                disabled={isLoading}
              />
              <button
                type="submit"
                className={`send-btn ${isLoading ? 'loading' : ''}`}
                disabled={isLoading || !selectedModel || (!prompt.trim() && attachments.length === 0)}
              >
                {isLoading ? '⏳' : '➤'}
              </button>
            </div>
            <div className="input-footer">
              <span className="mode-indicator">
                {agentMode === 'chat' ? '💬' : agentMode === 'autonomous' ? '🎯' : agentMode === 'multi-agent' ? '🕸️' : agentMode === 'sandbox' ? '🖥️' : '🔍'} {agentMode}
              </span>
              {selectedModel && <span className="active-model">🤖 {selectedModel}</span>}
              <label className="streaming-toggle">
                <input type="checkbox" checked={useStreaming} onChange={e => setUseStreaming(e.target.checked)} />
                Stream
              </label>
              {messages.length > 0 && (
                <button type="button" onClick={() => { setMessages([]); setStreamingContent(''); }} className="clear-btn">🗑️ Clear</button>
              )}
            </div>
          </form>
        </div>
      </main>

      {/* Modals */}
      {showSettings && (
        <SettingsPanel
          config={ollamaService.getConfig()}
          onSave={cfg => { ollamaService.setConfig(cfg); scanModels(); showNotif('Settings saved!', 'success'); }}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showPullModel && (
        <PullModelPanel
          onClose={() => setShowPullModel(false)}
          onPull={() => { scanModels(); setShowPullModel(false); showNotif('Model ready!', 'success'); }}
        />
      )}
      {activeAgent && (
        <FeatureAgentModal agent={activeAgent} onClose={() => setActiveAgent(null)} />
      )}
      {showFileCreator && (
        <FileCreatorPanel
          onClose={() => setShowFileCreator(false)}
          onFileCreated={(file) => {
            setCreatedFilesCount(getFileManager().getAllFiles().length);
            showNotif(`File "${file.name}" created!`, 'success');
          }}
        />
      )}
      {showSandbox && (
        <Suspense fallback={<div className="loading-overlay">Loading Sandbox...</div>}>
          <SandboxComputerUI onClose={() => setShowSandbox(false)} />
        </Suspense>
      )}
      {showObservability && (
        <Suspense fallback={<div className="loading-overlay">Loading...</div>}>
          <div className="modal-overlay" onClick={() => setShowObservability(false)}>
            <div className="modal-panel observability-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>📊 Observability</h3>
                <button onClick={() => setShowObservability(false)} className="close-btn">✕</button>
              </div>
              <ObservabilityPanel />
            </div>
          </div>
        </Suspense>
      )}
    </div>
  );
}
