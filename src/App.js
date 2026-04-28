import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import ollamaService from './services/OllamaService';
import agentEngine from './services/AgentEngine';

// ============================================================================
// CONSTANTS & HELPERS
// ============================================================================

const FILE_ICONS = {
  image: '🖼️', pdf: '📄', code: '💻', text: '📝',
  audio: '🎵', video: '🎬', document: '📃',
  spreadsheet: '📊', archive: '📦', other: '📎'
};

const getFileType = (filename) => {
  const ext = filename.split('.').pop().toLowerCase();
  if (['jpg','jpeg','png','gif','webp','svg','bmp'].includes(ext)) return 'image';
  if (['pdf'].includes(ext)) return 'pdf';
  if (['js','jsx','ts','tsx','py','java','cpp','c','h','css','html','json','xml','yaml','yml','sh','bash'].includes(ext)) return 'code';
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
    .replace(/\n\n/g, '</p><p class="md-p">')
    .replace(/\n/g, '<br/>');
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function MessageBubble({ msg, onCopy }) {
  const isUser = msg.role === 'user';

  return (
    <div className={`message-bubble ${isUser ? 'user' : 'assistant'} ${msg.error ? 'error' : ''}`}>
      <div className="message-avatar">{isUser ? '👤' : '🤖'}</div>
      <div className="message-content">
        {msg.autonomous && <div className="badge autonomous-badge">🎯 Autonomous Agent</div>}
        {msg.multiAgent && <div className="badge multi-agent-badge">🕸️ Multi-Agent</div>}
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="message-attachments">
            {msg.attachments.map((att, i) => (
              <span key={i} className="attachment-tag">
                {FILE_ICONS[att.type] || '📎'} {att.name}
              </span>
            ))}
          </div>
        )}
        <div
          className="message-text"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
        />
        {msg.toolExecutions && msg.toolExecutions.length > 0 && (
          <div className="tool-executions-summary">
            <div className="tool-exec-header">🛠️ Tools Used ({msg.toolExecutions.length})</div>
            {msg.toolExecutions.map((te, i) => (
              <div key={i} className={`tool-exec-item ${te.result?.success ? 'success' : 'error'}`}>
                <span className="tool-exec-name">{te.tool}</span>
                <span className="tool-exec-status">{te.result?.success ? '✓' : '✗'}</span>
                {te.reasoning && <span className="tool-exec-reason">{te.reasoning}</span>}
              </div>
            ))}
          </div>
        )}
        {msg.subResults && (
          <div className="sub-results">
            <div className="sub-results-header">🕸️ Sub-Agent Results</div>
            {msg.subResults.map((sr, i) => (
              <div key={i} className={`sub-result ${sr.success ? 'success' : 'error'}`}>
                <span>Agent {i + 1}: {sr.subGoal?.substring(0, 50)}...</span>
                <span>{sr.success ? '✓' : '✗'}</span>
              </div>
            ))}
          </div>
        )}
        <div className="message-footer">
          <span className="message-time">{formatTime(msg.timestamp)}</span>
          {msg.model && <span className="message-model">🤖 {msg.model}</span>}
          {msg.duration && <span className="message-duration">⏱️ {(msg.duration / 1000).toFixed(1)}s</span>}
          {msg.iterations && <span className="message-iterations">🔄 {msg.iterations} steps</span>}
          <button className="copy-btn" onClick={() => onCopy(msg.content)} title="Copy message">📋</button>
        </div>
      </div>
    </div>
  );
}

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
              {te.status === 'running' && <span className="tool-running">...</span>}
            </div>
          ))}
        </div>
      )}
      {steps.length > 0 && (
        <div className="agent-last-step">
          💭 {steps[steps.length - 1]?.content?.substring(0, 120)}...
        </div>
      )}
    </div>
  );
}

function SettingsPanel({ config, onSave, onClose }) {
  const [url, setUrl] = useState(config.url);
  const [mode, setMode] = useState(config.mode);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    ollamaService.setConfig({ url, mode, apiKey });
    const ok = await ollamaService.checkHealth();
    setTestResult(ok ? 'success' : 'error');
    setTesting(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>⚙️ Settings</h3>
          <button onClick={onClose} className="close-btn">✕</button>
        </div>
        <div className="modal-body">
          <div className="settings-section">
            <h4>Ollama Connection</h4>
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
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Bearer token if required" className="form-input" />
            </div>
            <div className="form-actions">
              <button onClick={testConnection} disabled={testing} className="btn-secondary">
                {testing ? '⏳ Testing...' : '🔍 Test Connection'}
              </button>
              {testResult && <span className={`test-badge ${testResult}`}>{testResult === 'success' ? '✅ Connected' : '❌ Failed'}</span>}
            </div>
          </div>
          <div className="settings-section">
            <h4>Cloud Ollama Examples</h4>
            <div className="cloud-examples">
              <p>For remote Ollama instances:</p>
              <code>https://your-server.com:11434</code>
              <p>For Ollama with ngrok:</p>
              <code>https://xxxx.ngrok.io</code>
              <p>For hosted Ollama (e.g. RunPod):</p>
              <code>https://xxxx.runpod.io/proxy/11434</code>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => { onSave({ url, mode, apiKey }); onClose(); }} className="btn-primary">💾 Save</button>
        </div>
      </div>
    </div>
  );
}

function PullModelPanel({ onClose, onPull }) {
  const [modelName, setModelName] = useState('');
  const [pulling, setPulling] = useState(false);
  const [progress, setProgress] = useState(null);

  const popularModels = [
    'llama3.2:latest', 'llama3.1:latest', 'mistral:latest',
    'codellama:latest', 'phi3:latest', 'gemma2:latest',
    'qwen2.5:latest', 'deepseek-r1:latest', 'llava:latest',
    'nomic-embed-text:latest', 'mxbai-embed-large:latest'
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
        <div className="modal-header">
          <h3>📥 Pull Model</h3>
          <button onClick={onClose} className="close-btn">✕</button>
        </div>
        <div className="modal-body">
          <div className="form-field">
            <label>Model Name</label>
            <input value={modelName} onChange={e => setModelName(e.target.value)} placeholder="e.g. llama3.2:latest" className="form-input" />
          </div>
          <button onClick={() => handlePull()} disabled={pulling || !modelName} className="btn-primary">
            {pulling ? '⏳ Downloading...' : '📥 Pull Model'}
          </button>
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

// ============================================================================
// MAIN APP
// ============================================================================

export default function App() {
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
  const [agentProgress, setAgentProgress] = useState(null);
  const [agentSteps, setAgentSteps] = useState([]);
  const [agentToolExecutions, setAgentToolExecutions] = useState([]);
  const [currentIteration, setCurrentIteration] = useState(0);

  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef(null);

  const [showSidebar, setShowSidebar] = useState(true);
  const [activeTab, setActiveTab] = useState('history');
  const [showSettings, setShowSettings] = useState(false);
  const [showPullModel, setShowPullModel] = useState(false);
  const [notification, setNotification] = useState(null);
  const [useStreaming, setUseStreaming] = useState(true);

  const chatEndRef = useRef(null);

  // Persist sessions
  useEffect(() => {
    localStorage.setItem('agentiq_sessions', JSON.stringify(chatSessions));
  }, [chatSessions]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  useEffect(() => {
    scanModels();
    const interval = setInterval(scanModels, 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Agent events
  useEffect(() => {
    const unsubs = [
      agentEngine.on('task_start', () => { setAgentProgress(true); setAgentSteps([]); setAgentToolExecutions([]); setCurrentIteration(0); }),
      agentEngine.on('iteration', ({ iteration }) => setCurrentIteration(iteration)),
      agentEngine.on('step', ({ content }) => setAgentSteps(p => [...p, { content, timestamp: Date.now() }])),
      agentEngine.on('tool_start', ({ tool }) => setAgentToolExecutions(p => [...p, { tool, status: 'running' }])),
      agentEngine.on('tool_complete', ({ tool, result }) => setAgentToolExecutions(p => {
        const u = [...p]; const idx = u.findLastIndex(t => t.tool === tool && t.status === 'running');
        if (idx >= 0) u[idx] = { ...u[idx], result, status: 'done' }; return u;
      })),
      agentEngine.on('task_complete', () => setAgentProgress(null)),
      agentEngine.on('task_error', () => setAgentProgress(null)),
    ];
    return () => unsubs.forEach(fn => fn && fn());
  }, []);

  const showNotif = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
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
    setChatSessions(p => p.map(s => s.id === sessionId
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
      r.onload = e => {
        const c = e.target.result;
        resolve(`[File: ${file.name} (${formatBytes(file.size)})]\n\`\`\`\n${c.substring(0, 4000)}${c.length > 4000 ? '\n...(truncated)' : ''}\n\`\`\``);
      };
      r.readAsText(file);
    }
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedModel || (!prompt.trim() && attachments.length === 0) || isLoading) return;

    setIsLoading(true);
    setStreamingContent('');

    let sessionId = activeSessionId || createNewSession();

    let fileContext = '';
    for (const att of attachments) {
      fileContext += (await processFile(att.file)) + '\n\n';
    }

    const userContent = fileContext ? `${fileContext}\n[User Request]\n${prompt || 'Please analyze the files above'}` : prompt;
    const userMsg = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: prompt || 'Analyze the attached files',
      rawContent: userContent,
      attachments: attachments.map(a => ({ name: a.name, type: a.type, size: a.size })),
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setPrompt('');
    setAttachments([]);

    try {
      if (agentMode === 'autonomous') {
        const result = await agentEngine.runAutonomousTask(userContent, selectedModel);
        const assistantMsg = {
          id: `msg-${Date.now()}`, role: 'assistant', content: result.response,
          autonomous: true, toolExecutions: result.toolExecutions, steps: result.steps,
          iterations: result.iterations, duration: result.duration, model: selectedModel, timestamp: Date.now(),
        };
        const final = [...newMessages, assistantMsg];
        setMessages(final); updateSession(sessionId, final);

      } else if (agentMode === 'multi-agent') {
        const subGoals = agentEngine.decomposeGoal(userContent);
        const result = await agentEngine.runMultiAgentTask(userContent, selectedModel, subGoals);
        const assistantMsg = {
          id: `msg-${Date.now()}`, role: 'assistant', content: result.response,
          multiAgent: true, subResults: result.subResults, model: selectedModel, timestamp: Date.now(),
        };
        const final = [...newMessages, assistantMsg];
        setMessages(final); updateSession(sessionId, final);

      } else {
        const chatMessages = newMessages.map(m => ({ role: m.role, content: m.rawContent || m.content }));

        if (useStreaming) {
          let fullResponse = '';
          await ollamaService.chat({
            model: selectedModel, messages: chatMessages, stream: true,
            onChunk: (chunk, full) => { fullResponse = full; setStreamingContent(full); },
          });
          setStreamingContent('');
          const assistantMsg = { id: `msg-${Date.now()}`, role: 'assistant', content: fullResponse, model: selectedModel, timestamp: Date.now() };
          const final = [...newMessages, assistantMsg];
          setMessages(final); updateSession(sessionId, final);
        } else {
          const result = await ollamaService.chat({ model: selectedModel, messages: chatMessages });
          const assistantMsg = { id: `msg-${Date.now()}`, role: 'assistant', content: result.response, model: selectedModel, timestamp: Date.now() };
          const final = [...newMessages, assistantMsg];
          setMessages(final); updateSession(sessionId, final);
        }
      }
    } catch (err) {
      const errorMsg = { id: `msg-${Date.now()}`, role: 'assistant', content: `❌ **Error:** ${err.message}\n\nMake sure Ollama is running and model "${selectedModel}" is available.`, error: true, timestamp: Date.now() };
      const final = [...newMessages, errorMsg];
      setMessages(final); updateSession(sessionId, final);
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
      id: `f-${Date.now()}-${Math.random().toString(36).substr(2,6)}`,
      name: f.name, size: f.size, type: getFileType(f.name), file: f,
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
    }))]);
    e.target.value = '';
  };

  const removeAttachment = (id) => {
    setAttachments(p => { const a = p.find(x => x.id === id); if (a?.preview) URL.revokeObjectURL(a.preview); return p.filter(x => x.id !== id); });
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => showNotif('Copied!', 'success'));
  };

  return (
    <div className="app">
      {notification && <div className={`notification ${notification.type}`}>{notification.msg}</div>}

      {/* SIDEBAR */}
      <aside className={`sidebar ${showSidebar ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <div className="logo"><span>🧠</span><span className="logo-text">AgentIQ Pro</span></div>
          <button className="icon-btn" onClick={() => setShowSidebar(false)}>◀</button>
        </div>

        <button className="new-chat-btn" onClick={createNewSession}>+ New Chat</button>

        <div className="sidebar-tabs">
          {[['history','💬','History'],['models','🤖','Models'],['tools','🛠️','Tools']].map(([id,icon,label]) => (
            <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)}>{icon} {label}</button>
          ))}
        </div>

        <div className="sidebar-content">
          {activeTab === 'history' && (
            <div className="history-list">
              {chatSessions.length === 0
                ? <div className="empty-state">No chats yet. Start a new conversation!</div>
                : chatSessions.map(s => (
                  <div key={s.id} className={`history-item ${activeSessionId === s.id ? 'active' : ''}`} onClick={() => loadSession(s)}>
                    <div className="history-title">{s.title || 'New Chat'}</div>
                    <div className="history-meta">
                      <span>{new Date(s.created).toLocaleDateString()}</span>
                      <span>{s.messages?.length || 0} msgs</span>
                    </div>
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
                <span>{isConnected ? `${models.length} models` : 'Disconnected'}</span>
                <button className="refresh-btn" onClick={scanModels}>↻</button>
              </div>
              {!isConnected && (
                <div className="connection-help">
                  <p>Run: <code>ollama serve</code></p>
                  <p>Or set remote URL in Settings</p>
                </div>
              )}
              <div className="models-list">
                {models.map(m => (
                  <div key={m.name} className={`model-item ${selectedModel === m.name ? 'selected' : ''}`} onClick={() => setSelectedModel(m.name)}>
                    <span className="model-name">{m.name}</span>
                    <span className="model-size">{m.size ? `${(m.size/1e9).toFixed(1)}GB` : ''}</span>
                    {selectedModel === m.name && <span className="selected-check">✓</span>}
                  </div>
                ))}
              </div>
              <button className="pull-btn" onClick={() => setShowPullModel(true)}>📥 Pull New Model</button>
            </div>
          )}

          {activeTab === 'tools' && (
            <div className="tools-panel">
              <h4>Agent Tools</h4>
              {Object.values(agentEngine.tools).map(t => (
                <div key={t.name} className="tool-item">
                  <div className="tool-name">
                    {{'web_search':'🔍','calculator':'🧮','code_executor':'💻','file_reader':'📂','data_analyzer':'📊','memory_store':'💾','memory_recall':'🔮','create_chart':'📈','generate_document':'📝','task_manager':'✅'}[t.name] || '🔧'}
                    {' '}{t.name.replace(/_/g,' ')}
                  </div>
                  <div className="tool-desc">{t.description}</div>
                </div>
              ))}
              <div className="tools-note">Tools activate automatically in Autonomous mode</div>
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <button className="settings-btn" onClick={() => setShowSettings(true)}>⚙️ Settings</button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="main">
        <header className="chat-header">
          {!showSidebar && <button className="icon-btn" onClick={() => setShowSidebar(true)}>▶</button>}
          <div className="mode-selector">
            {[['chat','💬 Chat'],['autonomous','🎯 Autonomous'],['multi-agent','🕸️ Multi-Agent']].map(([id,label]) => (
              <button key={id} className={`mode-btn ${agentMode === id ? 'active' : ''}`} onClick={() => setAgentMode(id)}>{label}</button>
            ))}
          </div>
          <div className="header-right">
            <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} className="model-select-header" disabled={models.length === 0}>
              {models.length === 0 ? <option value="">No models</option> : models.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
            <div className={`conn-badge ${isConnected ? 'on' : 'off'}`}>{isConnected ? '🟢' : '🔴'}</div>
          </div>
        </header>

        <div className="chat-area">
          {messages.length === 0 && !streamingContent ? (
            <div className="welcome">
              <div className="welcome-icon">🧠</div>
              <h1>AgentIQ Pro</h1>
              <p className="welcome-sub">Advanced AI Agent Platform — Powered by Ollama</p>
              <div className="feature-grid">
                {[
                  ['💬','Chat Mode','Streaming conversations with any Ollama model'],
                  ['🎯','Autonomous Agent','Multi-step reasoning with web search, code execution & tools'],
                  ['🕸️','Multi-Agent','Parallel agents working together on complex tasks'],
                  ['📊','File Analysis','Upload PDFs, CSVs, images, code for AI analysis'],
                  ['🔍','Web Search','Real-time DuckDuckGo search integration'],
                  ['💻','Code Execution','Run JavaScript code in sandboxed environment'],
                  ['💾','Memory System','Persistent agent memory across sessions'],
                  ['📥','Model Manager','Pull and manage Ollama models directly'],
                ].map(([icon, title, desc]) => (
                  <div key={title} className="feature-card">
                    <span className="feature-icon">{icon}</span>
                    <h3>{title}</h3>
                    <p>{desc}</p>
                  </div>
                ))}
              </div>
              {!isConnected && (
                <div className="welcome-warning">
                  ⚠️ Ollama not connected. Run <code>ollama serve</code> locally or configure a remote URL in Settings.
                </div>
              )}
            </div>
          ) : (
            <div className="messages">
              {messages.map(msg => <MessageBubble key={msg.id} msg={msg} onCopy={copyToClipboard} />)}
              {streamingContent && (
                <div className="message-bubble assistant streaming">
                  <div className="message-avatar">🤖</div>
                  <div className="message-content">
                    <div className="message-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingContent) }} />
                    <span className="cursor">▋</span>
                  </div>
                </div>
              )}
              {isLoading && !streamingContent && agentMode === 'chat' && (
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
              <button type="button" className="attach-btn" onClick={() => fileInputRef.current?.click()} title="Attach files">📎</button>
              <input type="file" ref={fileInputRef} onChange={handleFileSelect} multiple style={{ display:'none' }} accept="*/*" />
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={agentMode === 'autonomous' ? '🎯 Describe a goal for the autonomous agent...' : agentMode === 'multi-agent' ? '🕸️ Describe a complex task for multiple agents...' : '💬 Type a message... (Enter to send, Shift+Enter for newline)'}
                className="prompt-input"
                rows={1}
                disabled={isLoading}
              />
              <button type="submit" className={`send-btn ${isLoading ? 'loading' : ''}`} disabled={isLoading || !selectedModel || (!prompt.trim() && attachments.length === 0)}>
                {isLoading ? '⏳' : '➤'}
              </button>
            </div>
            <div className="input-footer">
              <div className="input-left">
                {agentMode === 'chat' && (
                  <label className="toggle-label">
                    <input type="checkbox" checked={useStreaming} onChange={e => setUseStreaming(e.target.checked)} />
                    <span>Stream</span>
                  </label>
                )}
                <span className="mode-indicator">
                  {agentMode === 'chat' ? '💬' : agentMode === 'autonomous' ? '🎯' : '🕸️'} {agentMode}
                </span>
              </div>
              <div className="input-right">
                {selectedModel ? <span className="active-model">🤖 {selectedModel}</span> : <span className="no-model">No model selected</span>}
                {messages.length > 0 && <button type="button" onClick={() => { setMessages([]); setStreamingContent(''); }} className="clear-btn">🗑️ Clear</button>}
              </div>
            </div>
          </form>
        </div>
      </main>

      {showSettings && <SettingsPanel config={ollamaService.getConfig()} onSave={cfg => { ollamaService.setConfig(cfg); scanModels(); showNotif('Settings saved!','success'); }} onClose={() => setShowSettings(false)} />}
      {showPullModel && <PullModelPanel onClose={() => setShowPullModel(false)} onPull={() => { scanModels(); setShowPullModel(false); showNotif('Model ready!','success'); }} />}
    </div>
  );
}
