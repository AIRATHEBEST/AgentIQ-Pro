# 🧠 AgentIQ Pro

**Advanced AI Agent Platform powered by Ollama** — supports all local and remote Ollama models with autonomous execution, multi-agent coordination, and full tool integration.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/AIRATHEBEST/AgentIQ-Pro)

---

## ✨ Features

### 🤖 AI Modes
| Mode | Description |
|------|-------------|
| **Chat** | Streaming conversations with any Ollama model |
| **Autonomous Agent** | Multi-step reasoning with tool use, self-correction, iterative problem solving |
| **Multi-Agent** | Parallel sub-agents working simultaneously on complex tasks |

### 🛠️ Agent Tools
- **Web Search** — DuckDuckGo instant answers (no API key needed)
- **Calculator** — Safe mathematical expression evaluation
- **Code Executor** — JavaScript sandbox execution with console capture
- **File Reader** — CSV, JSON, Markdown, text file analysis
- **Data Analyzer** — Statistical analysis with min/max/mean/median
- **Memory Store/Recall** — Persistent agent memory across sessions
- **Chart Creator** — Data visualization specifications
- **Document Generator** — Structured document creation
- **Task Manager** — Create, track, and complete tasks

### 📁 File Handling
- Attach any file type (PDFs, images, CSVs, code, documents)
- Image preview thumbnails
- Automatic file content injection into AI context
- Multi-file support per message

### ⚙️ Ollama Integration
- **Local**: `http://localhost:11434` (default)
- **Remote/Cloud**: Any Ollama instance (ngrok, RunPod, custom server)
- **API Key support** for authenticated instances
- **Model Manager**: Pull new models directly from the UI
- **Auto-reconnect** with 30-second health checks
- **All models supported**: llama3, mistral, codellama, phi3, gemma2, qwen2.5, deepseek-r1, llava, etc.

### 💾 Persistence
- Chat history saved to localStorage
- Agent memory persists across sessions
- Settings (URL, mode, API key) saved automatically

---

## 🚀 Quick Start

### Prerequisites
- [Node.js 18+](https://nodejs.org/)
- [Ollama](https://ollama.ai/) (for local models)

### Installation

```bash
git clone https://github.com/AIRATHEBEST/AgentIQ-Pro.git
cd AgentIQ-Pro
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000)

### Start Ollama (local)
```bash
ollama serve
ollama pull llama3.2:latest
```

### Use Remote Ollama
1. Click **⚙️ Settings** in the sidebar
2. Switch to **☁️ Remote/Cloud** mode
3. Enter your Ollama URL (e.g., `https://your-server.com:11434`)
4. Add API key if required
5. Click **Test Connection**

---

## 🏗️ Architecture

```
src/
├── App.js                    # Main UI component (chat, modes, file handling)
├── App.css                   # Dark theme stylesheet
├── index.js                  # React entry point
└── services/
    ├── OllamaService.js      # Full Ollama API client (local + cloud)
    └── AgentEngine.js        # Autonomous agent engine with tool use
```

### OllamaService
- Supports `/api/chat`, `/api/generate`, `/api/tags`, `/api/pull`, `/api/delete`, `/api/show`
- Streaming via ReadableStream API
- Configurable base URL, API key, and mode
- Health check polling

### AgentEngine
- ReAct-style reasoning loop (up to 10 iterations)
- Tool call parsing from LLM output
- Event-driven progress reporting
- Multi-agent parallel execution with synthesis
- Goal decomposition for complex tasks

---

## 🌐 Deployment

### Vercel (Recommended)
```bash
npm run build
vercel --prod
```
Or connect your GitHub repo to Vercel for automatic deployments.

### Static Hosting
```bash
npm run build
# Deploy the `build/` folder to any static host
```

> **Note**: The app connects to Ollama from the **browser**. For production use, ensure your Ollama instance has CORS configured:
> ```bash
> OLLAMA_ORIGINS="*" ollama serve
> ```

---

## 🔧 Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Ollama URL | `http://localhost:11434` | Ollama API endpoint |
| Mode | `local` | `local` or `cloud` |
| API Key | (empty) | Bearer token for authenticated instances |
| Streaming | `true` | Enable/disable response streaming |

---

## 📦 Tech Stack

- **React 18** — UI framework
- **Ollama API** — LLM backend (all models)
- **DuckDuckGo API** — Web search (no key needed)
- **localStorage** — Persistence layer
- **CSS Variables** — Dark theme system

---

## 🤝 Contributing

Pull requests welcome! Please open an issue first for major changes.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
