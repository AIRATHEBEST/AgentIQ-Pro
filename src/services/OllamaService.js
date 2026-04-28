/**
 * OllamaService.js
 * Full Ollama integration supporting local and cloud/remote instances
 * Supports all Ollama models with streaming, chat, and generate endpoints
 */

const DEFAULT_LOCAL_URL = 'http://localhost:11434';

class OllamaService {
  constructor() {
    this.baseUrl = localStorage.getItem('ollama_url') || DEFAULT_LOCAL_URL;
    this.mode = localStorage.getItem('ollama_mode') || 'local'; // 'local' | 'cloud'
    this.apiKey = localStorage.getItem('ollama_api_key') || '';
    this.models = [];
    this.isConnected = false;
    this.listeners = {};
  }

  setConfig({ url, mode, apiKey }) {
    if (url) {
      this.baseUrl = url;
      localStorage.setItem('ollama_url', url);
    }
    if (mode) {
      this.mode = mode;
      localStorage.setItem('ollama_mode', mode);
    }
    if (apiKey !== undefined) {
      this.apiKey = apiKey;
      localStorage.setItem('ollama_api_key', apiKey);
    }
  }

  getConfig() {
    return {
      url: this.baseUrl,
      mode: this.mode,
      apiKey: this.apiKey,
    };
  }

  getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  on(event, cb) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }

  async fetchModels() {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.models = (data.models || []).map(m => ({
        name: m.name,
        size: m.size,
        modified: m.modified_at,
        digest: m.digest,
        details: m.details || {},
      }));
      this.isConnected = true;
      this.emit('connected', { models: this.models });
      return this.models;
    } catch (err) {
      this.isConnected = false;
      this.emit('disconnected', { error: err.message });
      return [];
    }
  }

  async generate({ model, prompt, stream = false, options = {}, onChunk }) {
    const body = {
      model,
      prompt,
      stream,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 4096,
        top_p: options.topP ?? 0.9,
        ...options,
      },
    };

    if (stream && onChunk) {
      return this._streamGenerate(body, onChunk);
    }

    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ ...body, stream: false }),
      signal: AbortSignal.timeout(180000),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama generate error: ${err}`);
    }

    const data = await res.json();
    return {
      response: data.response || '',
      model: data.model,
      done: data.done,
      context: data.context,
      total_duration: data.total_duration,
      eval_count: data.eval_count,
    };
  }

  async _streamGenerate(body, onChunk) {
    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ ...body, stream: true }),
      signal: AbortSignal.timeout(300000),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama stream error: ${err}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.response) {
            fullResponse += parsed.response;
            onChunk(parsed.response, fullResponse, parsed.done);
          }
          if (parsed.done) {
            return { response: fullResponse, done: true };
          }
        } catch (_) {}
      }
    }

    return { response: fullResponse, done: true };
  }

  async chat({ model, messages, stream = false, options = {}, onChunk }) {
    const body = {
      model,
      messages,
      stream,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 4096,
        ...options,
      },
    };

    if (stream && onChunk) {
      return this._streamChat(body, onChunk);
    }

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ ...body, stream: false }),
      signal: AbortSignal.timeout(180000),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama chat error: ${err}`);
    }

    const data = await res.json();
    return {
      response: data.message?.content || '',
      model: data.model,
      done: data.done,
    };
  }

  async _streamChat(body, onChunk) {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ ...body, stream: true }),
      signal: AbortSignal.timeout(300000),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama chat stream error: ${err}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          const content = parsed.message?.content || '';
          if (content) {
            fullResponse += content;
            onChunk(content, fullResponse, parsed.done);
          }
          if (parsed.done) {
            return { response: fullResponse, done: true };
          }
        } catch (_) {}
      }
    }

    return { response: fullResponse, done: true };
  }

  async pullModel(modelName, onProgress) {
    const res = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ name: modelName, stream: true }),
    });

    if (!res.ok) throw new Error(`Failed to pull model: ${res.statusText}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (onProgress) onProgress(parsed);
          if (parsed.status === 'success') return { success: true };
        } catch (_) {}
      }
    }

    return { success: true };
  }

  async deleteModel(modelName) {
    const res = await fetch(`${this.baseUrl}/api/delete`, {
      method: 'DELETE',
      headers: this.getHeaders(),
      body: JSON.stringify({ name: modelName }),
    });
    return res.ok;
  }

  async getModelInfo(modelName) {
    const res = await fetch(`${this.baseUrl}/api/show`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ name: modelName }),
    });
    if (!res.ok) return null;
    return res.json();
  }

  async checkHealth() {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

const ollamaService = new OllamaService();
export default ollamaService;
export { OllamaService };

// Additional export for cloud configuration presets
export const CLOUD_PRESETS = {
  local: { url: 'http://localhost:11434', description: 'Local Ollama instance' },
  ngrok: { url: '', description: 'Ngrok tunnel (enter your URL)' },
  runpod: { url: '', description: 'RunPod hosted instance' },
  custom: { url: '', description: 'Custom remote Ollama server' },
};
