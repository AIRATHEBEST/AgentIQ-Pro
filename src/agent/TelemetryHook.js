/**
 * Observability & Telemetry Hook
 * Wires into ExecutionEngine and LLMRouter to expose real-time cost/performance dashboards
 */

export class MetricsCollector {
  constructor(options = {}) {
    this.metrics = {
      llm: { requests: 0, failures: 0, latency: [], tokens: 0, cost: 0 },
      execution: { tasks: 0, completed: 0, failed: 0, retries: 0, duration: [] },
      agents: { spawns: 0, messages: 0, conflicts: 0 },
      events: { total: 0, byType: {} },
      errors: { total: 0, byType: {} }
    };
    this.startTime = Date.now();
    this.intervals = new Map();
    this.alertThresholds = options.alertThresholds || {};
  }

  trackLLMRequest(provider, success, latency, tokens, cost) {
    this.metrics.llm.requests++;
    if (!success) this.metrics.llm.failures++;
    this.metrics.llm.latency.push(latency);
    if (tokens) this.metrics.llm.tokens += tokens;
    if (cost) this.metrics.llm.cost += cost;

    this._checkThresholds('llm', { requests: this.metrics.llm.requests, failures: this.metrics.llm.failures });
  }

  trackExecution(taskId, status, duration, retries = 0) {
    this.metrics.execution.tasks++;
    if (status === 'completed') this.metrics.execution.completed++;
    else if (status === 'failed') this.metrics.execution.failed++;
    if (retries > 0) this.metrics.execution.retries += retries;
    if (duration) this.metrics.execution.duration.push(duration);

    this._checkThresholds('execution', { tasks: this.metrics.execution.tasks });
  }

  trackAgent(action, details = {}) {
    if (action === 'spawn') this.metrics.agents.spawns++;
    if (action === 'message') this.metrics.agents.messages++;
    if (action === 'conflict') this.metrics.agents.conflicts++;
  }

  trackEvent(eventType, data = {}) {
    this.metrics.events.total++;
    if (!this.metrics.events.byType[eventType]) {
      this.metrics.events.byType[eventType] = 0;
    }
    this.metrics.events.byType[eventType]++;
  }

  trackError(errorType, details = {}) {
    this.metrics.errors.total++;
    if (!this.metrics.errors.byType[errorType]) {
      this.metrics.errors.byType[errorType] = 0;
    }
    this.metrics.errors.byType[errorType]++;
  }

  _checkThresholds(category, values) {
    const threshold = this.alertThresholds[category];
    if (threshold) {
      if (threshold.failureRate && category === 'llm') {
        const rate = this.metrics.llm.failures / this.metrics.llm.requests;
        if (rate > threshold.failureRate) {
          this._triggerAlert('high_failure_rate', { rate, threshold: threshold.failureRate });
        }
      }
      if (threshold.maxTasks && category === 'execution') {
        if (values.tasks > threshold.maxTasks) {
          this._triggerAlert('max_tasks_exceeded', { tasks: values.tasks });
        }
      }
    }
  }

  _triggerAlert(type, data) {
    console.warn(`[Telemetry] Alert: ${type}`, data);
    this._emit('alert', { type, data, timestamp: Date.now() });
  }

  _emit(event, data) {
    // Can be connected to EventBus
  }

  getMetrics() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.startTime,
      timestamp: Date.now()
    };
  }

  getSummary() {
    const m = this.metrics;
    return {
      llm: {
        totalRequests: m.llm.requests,
        failureRate: m.llm.requests > 0 ? (m.llm.failures / m.llm.requests * 100).toFixed(2) + '%' : '0%',
        avgLatency: m.llm.latency.length > 0 ? (m.llm.latency.reduce((a, b) => a + b, 0) / m.llm.latency.length).toFixed(0) + 'ms' : 'N/A',
        totalTokens: m.llm.tokens,
        totalCost: '$' + m.llm.cost.toFixed(4)
      },
      execution: {
        totalTasks: m.execution.tasks,
        completed: m.execution.completed,
        failed: m.execution.failed,
        successRate: m.execution.tasks > 0 ? (m.execution.completed / m.execution.tasks * 100).toFixed(1) + '%' : '0%',
        avgDuration: m.execution.duration.length > 0 ? (m.execution.duration.reduce((a, b) => a + b, 0) / m.execution.duration.length).toFixed(0) + 'ms' : 'N/A'
      },
      agents: {
        totalSpawns: m.agents.spawns,
        totalMessages: m.agents.messages,
        conflicts: m.agents.conflicts
      },
      events: {
        total: m.events.total,
        types: Object.keys(m.events.byType).length
      },
      errors: {
        total: m.errors.total,
        types: Object.keys(m.errors.byType)
      },
      uptime: this._formatUptime()
    };
  }

  _formatUptime() {
    const ms = Date.now() - this.startTime;
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }

  reset() {
    this.metrics = {
      llm: { requests: 0, failures: 0, latency: [], tokens: 0, cost: 0 },
      execution: { tasks: 0, completed: 0, failed: 0, retries: 0, duration: [] },
      agents: { spawns: 0, messages: 0, conflicts: 0 },
      events: { total: 0, byType: {} },
      errors: { total: 0, byType: {} }
    };
    this.startTime = Date.now();
  }

  export() {
    return JSON.stringify(this.getMetrics(), null, 2);
  }

  startPeriodicReport(intervalMs = 60000, callback) {
    const id = setInterval(() => {
      const report = this.getSummary();
      if (callback) callback(report);
      else console.log('[Telemetry Report]', JSON.stringify(report, null, 2));
    }, intervalMs);
    this.intervals.set('report', id);
    return id;
  }

  stopPeriodicReport() {
    if (this.intervals.has('report')) {
      clearInterval(this.intervals.get('report'));
      this.intervals.delete('report');
    }
  }
}

// Telemetry wrapper for LLMRouter
export class TelemetryLLMRouter {
  constructor(llmRouter, metricsCollector) {
    this.router = llmRouter;
    this.metrics = metricsCollector;
    this._wrapRouter();
  }

  _wrapRouter() {
    const originalRoute = this.router.route.bind(this.router);
    this.router.route = async (task, context) => {
      const start = Date.now();
      try {
        const result = await originalRoute(task, context);
        const latency = Date.now() - start;
        const tokens = result?.usage?.total_tokens || 0;
        const cost = this._calculateCost(this.router.currentProvider, tokens);
        this.metrics.trackLLMRequest(this.router.currentProvider || 'unknown', true, latency, tokens, cost);
        return result;
      } catch (error) {
        const latency = Date.now() - start;
        this.metrics.trackLLMRequest(this.router.currentProvider || 'unknown', false, latency, 0, 0);
        this.metrics.trackError('llm_request_failed', { error: error.message, provider: this.router.currentProvider });
        throw error;
      }
    };

    const originalFallback = this.router._fallback?.bind(this.router);
    if (originalFallback) {
      this.router._fallback = async (...args) => {
        const start = Date.now();
        try {
          const result = await originalFallback(...args);
          this.metrics.trackLLMRequest('fallback', true, Date.now() - start, 0, 0);
          return result;
        } catch (error) {
          this.metrics.trackLLMRequest('fallback', false, Date.now() - start, 0, 0);
          throw error;
        }
      };
    }
  }

  _calculateCost(provider, tokens) {
    const rates = { ollama: 0, openai: 0.002, anthropic: 0.003, gemini: 0.001 };
    return (tokens / 1000) * (rates[provider] || 0.001);
  }

  getMetrics() {
    return this.metrics.getSummary();
  }
}

// Telemetry wrapper for ExecutionEngine
export class TelemetryExecutionEngine {
  constructor(executionEngine, metricsCollector) {
    this.engine = executionEngine;
    this.metrics = metricsCollector;
    this._wrapEngine();
  }

  _wrapEngine() {
    const originalExecute = this.engine.execute?.bind(this.engine);
    if (originalExecute) {
      this.engine.execute = async (task, options) => {
        const start = Date.now();
        const taskId = task?.id || `task_${Date.now()}`;
        try {
          this.metrics.trackExecution(taskId, 'started', 0);
          const result = await originalExecute(task, options);
          const duration = Date.now() - start;
          this.metrics.trackExecution(taskId, 'completed', duration);
          return result;
        } catch (error) {
          const duration = Date.now() - start;
          this.metrics.trackExecution(taskId, 'failed', duration);
          this.metrics.trackError('execution_failed', { taskId, error: error.message });
          throw error;
        }
      };
    }

    const originalCorrect = this.engine._correct?.bind(this.engine);
    if (originalCorrect) {
      this.engine._correct = async (...args) => {
        try {
          const result = await originalCorrect(...args);
          if (this.engine.retryCount > 0) {
            this.metrics.trackExecution(null, 'retry', 0, this.engine.retryCount);
          }
          return result;
        } catch (error) {
          throw error;
        }
      };
    }
  }

  getMetrics() {
    return this.metrics.getSummary();
  }
}

// React Hook for Dashboard
export function useTelemetry(metricsCollector, options = {}) {
  const [metrics, setMetrics] = React.useState(null);
  const [alerts, setAlerts] = React.useState([]);
  const updateInterval = options.updateInterval || 5000;

  React.useEffect(() => {
    if (!metricsCollector) return;

    const update = () => {
      setMetrics(metricsCollector.getSummary());
    };

    update();
    const interval = setInterval(update, updateInterval);

    return () => clearInterval(interval);
  }, [metricsCollector, updateInterval]);

  return { metrics, alerts, refresh: () => setMetrics(metricsCollector.getSummary()) };
}

// Performance monitoring hook
export function usePerformanceMonitor(enabled = true) {
  const metricsRef = React.useRef({
    renderCount: 0,
    lastRender: 0,
    avgRenderTime: 0,
    peakRenderTime: 0
  });

  React.useEffect(() => {
    if (!enabled) return;

    const now = performance.now();
    const prev = metricsRef.current.lastRender;
    const renderTime = prev ? now - prev : 0;

    metricsRef.current.renderCount++;
    metricsRef.current.lastRender = now;
    
    const count = metricsRef.current.renderCount;
    const avg = metricsRef.current.avgRenderTime;
    metricsRef.current.avgRenderTime = (avg * (count - 1) + renderTime) / count;
    
    if (renderTime > metricsRef.current.peakRenderTime) {
      metricsRef.current.peakRenderTime = renderTime;
    }
  });

  return metricsRef.current;
}

// Real-time dashboard component
export function TelemetryDashboard({ metricsCollector, refreshMs = 5000 }) {
  const [data, setData] = React.useState(null);

  React.useEffect(() => {
    const update = () => setData(metricsCollector?.getSummary());
    update();
    const interval = setInterval(update, refreshMs);
    return () => clearInterval(interval);
  }, [metricsCollector, refreshMs]);

  if (!data) return <div>Loading...</div>;

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', background: '#1a1a2e', color: '#eee', minHeight: '100vh' }}>
      <h2>📊 Agent Telemetry Dashboard</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
        <MetricCard title="LLM Metrics" data={data.llm} />
        <MetricCard title="Execution Metrics" data={data.execution} />
        <MetricCard title="Agent Metrics" data={data.agents} />
        <MetricCard title="Errors" data={data.errors} />
      </div>
      <div style={{ marginTop: '20px', padding: '10px', background: '#16213e', borderRadius: '8px' }}>
        <strong>Uptime:</strong> {data.uptime}
      </div>
    </div>
  );
}

function MetricCard({ title, data }) {
  return (
    <div style={{ background: '#16213e', padding: '15px', borderRadius: '8px' }}>
      <h3 style={{ marginTop: 0, color: '#00d9ff' }}>{title}</h3>
      {Object.entries(data).map(([key, value]) => (
        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', margin: '5px 0' }}>
          <span>{key}:</span>
          <span style={{ color: '#00ff88' }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

// Export all telemetry utilities
export default {
  MetricsCollector,
  TelemetryLLMRouter,
  TelemetryExecutionEngine,
  useTelemetry,
  usePerformanceMonitor,
  TelemetryDashboard
};