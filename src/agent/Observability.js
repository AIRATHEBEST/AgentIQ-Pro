/**
 * Enhanced Observability - Manus 1.6 Max Pro Feature
 * Real-time dashboards, audit logging, and telemetry
 */

import { EventEmitter } from 'events';

// Metrics types
export const MetricType = {
  COUNTER: 'counter',
  GAUGE: 'gauge',
  HISTOGRAM: 'histogram',
  TIMER: 'timer'
};

// Log levels
export const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  CRITICAL: 'critical'
};

export class Metric {
  constructor(name, type = MetricType.GAUGE, config = {}) {
    this.name = name;
    this.type = type;
    this.description = config.description || '';
    this.labels = config.labels || {};
    this.value = 0;
    this.history = [];
    this.maxHistory = config.maxHistory || 1000;
  }

  increment(amount = 1, labels = {}) {
    this.value += amount;
    this.record(labels);
    return this.value;
  }

  decrement(amount = 1, labels = {}) {
    this.value -= amount;
    this.record(labels);
    return this.value;
  }

  set(value, labels = {}) {
    this.value = value;
    this.record(labels);
    return this.value;
  }

  record(labels = {}) {
    const entry = {
      value: this.value,
      timestamp: Date.now(),
      labels: { ...this.labels, ...labels }
    };
    
    this.history.push(entry);
    
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  getValue() {
    return this.value;
  }

  getHistory(duration = null) {
    if (!duration) return this.history;
    
    const cutoff = Date.now() - duration;
    return this.history.filter(h => h.timestamp >= cutoff);
  }

  reset() {
    this.value = 0;
    this.history = [];
  }
}

export class Counter extends Metric {
  constructor(name, config) {
    super(name, MetricType.COUNTER, config);
  }
}

export class Gauge extends Metric {
  constructor(name, config) {
    super(name, MetricType.GAUGE, config);
  }
}

export class Histogram extends Metric {
  constructor(name, config) {
    super(name, MetricType.HISTOGRAM, config);
    this.buckets = config.buckets || [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300];
    this.counts = new Map(this.buckets.map(b => [b, 0]));
    this.sum = 0;
  }

  observe(value, labels = {}) {
    this.sum += value;
    this.value++;
    
    for (const bucket of this.buckets) {
      if (value <= bucket) {
        this.counts.set(bucket, this.counts.get(bucket) + 1);
      }
    }
    
    this.record(labels);
  }

  getPercentile(percentile) {
    const sorted = [...this.history].sort((a, b) => a.value - b.value);
    const index = Math.floor(sorted.length * percentile);
    return sorted[index]?.value || 0;
  }
}

export class Timer extends Metric {
  constructor(name, config) {
    super(name, MetricType.TIMER, config);
    this.startTime = null;
    this.durations = [];
  }

  start() {
    this.startTime = Date.now();
    return this;
  }

  observe(value, labels = {}) {
    // Timer specific - store in durations and record in history
    this.durations.push(value);
    super.record(labels);
  }

  stop(labels = {}) {
    if (this.startTime) {
      const duration = Date.now() - this.startTime;
      this.observe(duration, labels);
      this.startTime = null;
      return duration;
    }
    return null;
  }

  getStats() {
    if (this.durations.length === 0) return null;
    
    const sorted = [...this.durations].sort((a, b) => a - b);
    const sum = this.durations.reduce((a, b) => a + b, 0);
    
    return {
      count: this.durations.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / this.durations.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p90: sorted[Math.floor(sorted.length * 0.9)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }
}

export class LogEntry {
  constructor(level, message, context = {}) {
    this.id = `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.level = level;
    this.message = message;
    this.context = context;
    this.timestamp = Date.now();
    this.service = context.service || 'system';
    this.traceId = context.traceId || null;
    this.spanId = context.spanId || null;
  }

  toJSON() {
    return {
      id: this.id,
      level: this.level,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
      service: this.service,
      traceId: this.traceId,
      spanId: this.spanId
    };
  }
}

export class AuditLog extends EventEmitter {
  constructor(config = {}) {
    super();
    this.entries = [];
    this.maxEntries = config.maxEntries || 10000;
    this.filters = {
      levels: config.levels || Object.values(LogLevel),
      services: config.services || null,
      since: null
    };
    this.persistentStorage = config.persistentStorage || false;
  }

  log(level, message, context = {}) {
    const entry = new LogEntry(level, message, context);
    
    this.entries.push(entry);
    
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    this.emit('log', entry);
    
    if (this.persistentStorage) {
      this.persistEntry(entry);
    }

    return entry;
  }

  debug(message, context) { return this.log(LogLevel.DEBUG, message, context); }
  info(message, context) { return this.log(LogLevel.INFO, message, context); }
  warn(message, context) { return this.log(LogLevel.WARN, message, context); }
  error(message, context) { return this.log(LogLevel.ERROR, message, context); }
  critical(message, context) { return this.log(LogLevel.CRITICAL, message, context); }

  query(filters = {}) {
    let results = [...this.entries];

    if (filters.level) {
      results = results.filter(e => e.level === filters.level);
    }
    if (filters.minLevel) {
      const levels = Object.values(LogLevel);
      const minIndex = levels.indexOf(filters.minLevel);
      results = results.filter(e => levels.indexOf(e.level) >= minIndex);
    }
    if (filters.service) {
      results = results.filter(e => e.service === filters.service);
    }
    if (filters.since) {
      results = results.filter(e => e.timestamp >= filters.since);
    }
    if (filters.until) {
      results = results.filter(e => e.timestamp <= filters.until);
    }
    if (filters.search) {
      const search = filters.search.toLowerCase();
      results = results.filter(e => 
        e.message.toLowerCase().includes(search) ||
        JSON.stringify(e.context).toLowerCase().includes(search)
      );
    }

    return results;
  }

  getStats() {
    const counts = {};
    for (const level of Object.values(LogLevel)) {
      counts[level] = this.entries.filter(e => e.level === level).length;
    }

    return {
      total: this.entries.length,
      byLevel: counts,
      oldestEntry: this.entries[0]?.timestamp || null,
      newestEntry: this.entries[this.entries.length - 1]?.timestamp || null
    };
  }

  export(format = 'json') {
    if (format === 'json') {
      return JSON.stringify(this.entries.map(e => e.toJSON()), null, 2);
    }
    return this.entries;
  }

  clear() {
    this.entries = [];
    this.emit('cleared');
  }

  async persistEntry(entry) {
    // Placeholder for actual persistence (localStorage, IndexedDB, etc.)
    console.log('Persisting log entry:', entry.id);
  }
}

export class Trace {
  constructor(id, config = {}) {
    this.id = id || `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.spans = [];
    this.startTime = Date.now();
    this.endTime = null;
    this.status = 'running';
    this.tags = config.tags || {};
    this.events = [];
  }

  startSpan(name, parentSpanId = null) {
    const span = {
      id: `${this.id}-span-${this.spans.length}`,
      name,
      parentSpanId,
      startTime: Date.now(),
      endTime: null,
      duration: null,
      status: 'running',
      tags: {},
      events: [],
      logs: []
    };
    this.spans.push(span);
    return span.id;
  }

  endSpan(spanId, status = 'ok', tags = {}) {
    const span = this.spans.find(s => s.id === spanId);
    if (span) {
      span.endTime = Date.now();
      span.duration = span.endTime - span.startTime;
      span.status = status;
      span.tags = { ...span.tags, ...tags };
    }
    return span;
  }

  addSpanEvent(spanId, name, attributes = {}) {
    const span = this.spans.find(s => s.id === spanId);
    if (span) {
      span.events.push({
        name,
        timestamp: Date.now(),
        attributes
      });
    }
  }

  addSpanLog(spanId, message, attributes = {}) {
    const span = this.spans.find(s => s.id === spanId);
    if (span) {
      span.logs.push({
        message,
        timestamp: Date.now(),
        attributes
      });
    }
  }

  finish(status = 'ok') {
    this.endTime = Date.now();
    this.status = status;
    this.duration = this.endTime - this.startTime;
  }

  toJSON() {
    return {
      id: this.id,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.duration,
      status: this.status,
      tags: this.tags,
      spans: this.spans,
      events: this.events
    };
  }
}

export class TracingSystem extends EventEmitter {
  constructor(config = {}) {
    super();
    this.traces = new Map();
    this.samplingRate = config.samplingRate || 1.0;
  }

  startTrace(config = {}) {
    if (Math.random() > this.samplingRate) {
      return null; // Skip this trace based on sampling
    }

    const trace = new Trace(null, config);
    this.traces.set(trace.id, trace);
    
    this.emit('trace:start', { traceId: trace.id });
    return trace;
  }

  getTrace(traceId) {
    return this.traces.get(traceId);
  }

  finishTrace(traceId, status = 'ok') {
    const trace = this.traces.get(traceId);
    if (trace) {
      trace.finish(status);
      this.emit('trace:end', { traceId, duration: trace.duration });
    }
    return trace;
  }

  getTraces(filters = {}) {
    let traces = Array.from(this.traces.values());

    if (filters.status) {
      traces = traces.filter(t => t.status === filters.status);
    }
    if (filters.since) {
      traces = traces.filter(t => t.startTime >= filters.since);
    }

    return traces;
  }

  clear() {
    this.traces.clear();
  }
}

export class Dashboard extends EventEmitter {
  constructor(config = {}) {
    super();
    this.id = config.id || `dashboard-${Date.now()}`;
    this.name = config.name || 'Dashboard';
    this.widgets = [];
    this.refreshInterval = config.refreshInterval || 5000;
    this.autoRefresh = config.autoRefresh || false;
    this.intervalId = null;
  }

  addWidget(widget) {
    this.widgets.push(widget);
    this.emit('widget:added', { widgetId: widget.id });
    return widget;
  }

  removeWidget(widgetId) {
    this.widgets = this.widgets.filter(w => w.id !== widgetId);
    this.emit('widget:removed', { widgetId });
  }

  startAutoRefresh() {
    if (this.autoRefresh && !this.intervalId) {
      this.intervalId = setInterval(() => {
        this.refresh();
      }, this.refreshInterval);
    }
  }

  stopAutoRefresh() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  refresh() {
    const data = this.widgets.map(w => ({
      widgetId: w.id,
      data: w.getData()
    }));
    
    this.emit('refresh', { timestamp: Date.now(), data });
    return data;
  }

  export() {
    return {
      id: this.id,
      name: this.name,
      widgets: this.widgets.map(w => w.export()),
      config: {
        refreshInterval: this.refreshInterval,
        autoRefresh: this.autoRefresh
      }
    };
  }
}

export class MetricWidget {
  constructor(config) {
    this.id = config.id || `widget-${Date.now()}`;
    this.title = config.title || 'Metric';
    this.metricName = config.metricName;
    this.type = config.type || 'value'; // value, chart, gauge, table
    this.aggregation = config.aggregation || 'latest'; // latest, sum, avg, min, max
  }

  getData(registry) {
    const metric = registry.get(this.metricName);
    if (!metric) return null;

    switch (this.type) {
      case 'value':
        return metric.getValue();
      case 'chart':
        return metric.getHistory();
      case 'gauge':
        return {
          value: metric.getValue(),
          max: 100
        };
      case 'table':
        return {
          current: metric.getValue(),
          history: metric.getHistory(60000)
        };
      default:
        return metric.getValue();
    }
  }

  export() {
    return {
      id: this.id,
      title: this.title,
      metricName: this.metricName,
      type: this.type,
      aggregation: this.aggregation
    };
  }
}

export class MetricsRegistry extends EventEmitter {
  constructor() {
    super();
    this.metrics = new Map();
  }

  registerMetric(name, type, config = {}) {
    let metric;
    
    switch (type) {
      case MetricType.COUNTER:
        metric = new Counter(name, config);
        break;
      case MetricType.GAUGE:
        metric = new Gauge(name, config);
        break;
      case MetricType.HISTOGRAM:
        metric = new Histogram(name, config);
        break;
      case MetricType.TIMER:
        metric = new Timer(name, config);
        break;
      default:
        metric = new Metric(name, type, config);
    }

    this.metrics.set(name, metric);
    this.emit('metric:registered', { name, type });
    return metric;
  }

  get(name) {
    return this.metrics.get(name);
  }

  counter(name, config) {
    return this.registerMetric(name, MetricType.COUNTER, config);
  }

  gauge(name, config) {
    return this.registerMetric(name, MetricType.GAUGE, config);
  }

  histogram(name, config) {
    return this.registerMetric(name, MetricType.HISTOGRAM, config);
  }

  timer(name, config) {
    return this.registerMetric(name, MetricType.TIMER, config);
  }

  list() {
    return Array.from(this.metrics.keys());
  }

  export() {
    const data = {};
    for (const [name, metric] of this.metrics) {
      data[name] = {
        type: metric.type,
        value: metric.getValue(),
        history: metric.getHistory()
      };
    }
    return data;
  }
}

export class ObservabilitySystem extends EventEmitter {
  constructor(config = {}) {
    super();
    this.metricsRegistry = new MetricsRegistry();
    this.auditLog = new AuditLog(config.auditLog || {});
    this.tracing = new TracingSystem(config.tracing || {});
    this.dashboards = new Map();
    this.alerts = [];
    this.alertHandlers = new Map();
  }

  // Metrics
  createMetric(name, type, config) {
    return this.metricsRegistry.registerMetric(name, type, config);
  }

  getMetric(name) {
    return this.metricsRegistry.get(name);
  }

  listMetrics() {
    return this.metricsRegistry.list();
  }

  incrementCounter(name, amount, labels) {
    const metric = this.metricsRegistry.get(name);
    if (metric) {
      metric.increment(amount, labels);
    }
    return metric;
  }

  recordHistogram(name, value, labels) {
    const metric = this.metricsRegistry.get(name);
    if (metric instanceof Histogram) {
      metric.observe(value, labels);
    }
    return metric;
  }

  startTimer(name) {
    const metric = this.metricsRegistry.get(name);
    if (metric instanceof Timer) {
      return metric.start();
    }
    return null;
  }

  stopTimer(name, labels) {
    const metric = this.metricsRegistry.get(name);
    if (metric instanceof Timer) {
      return metric.stop(labels);
    }
    return null;
  }

  // Audit logging
  log(level, message, context) {
    return this.auditLog.log(level, message, context);
  }

  queryLogs(filters) {
    return this.auditLog.query(filters);
  }

  // Tracing
  startTrace(config) {
    return this.tracing.startTrace(config);
  }

  startSpan(traceId, name, parentSpanId) {
    const trace = this.tracing.getTrace(traceId);
    if (trace) {
      return trace.startSpan(name, parentSpanId);
    }
    return null;
  }

  endSpan(traceId, spanId, status, tags) {
    const trace = this.tracing.getTrace(traceId);
    if (trace) {
      return trace.endSpan(spanId, status, tags);
    }
    return null;
  }

  // Dashboards
  createDashboard(config) {
    const dashboard = new Dashboard(config);
    this.dashboards.set(dashboard.id, dashboard);
    return dashboard;
  }

  getDashboard(id) {
    return this.dashboards.get(id);
  }

  listDashboards() {
    return Array.from(this.dashboards.values());
  }

  // Alerts
  createAlert(name, condition, config = {}) {
    const alert = {
      id: `alert-${Date.now()}`,
      name,
      condition,
      threshold: config.threshold || 0,
      severity: config.severity || 'warning',
      enabled: true,
      triggeredAt: null,
      lastChecked: null
    };

    this.alerts.push(alert);
    this.emit('alert:created', alert);
    return alert;
  }

  checkAlerts() {
    const triggered = [];

    for (const alert of this.alerts) {
      if (!alert.enabled) continue;

      alert.lastChecked = Date.now();
      const value = this.getMetric(alert.condition.metric)?.getValue() || 0;

      if (alert.condition.operator === '>' && value > alert.threshold) {
        alert.triggeredAt = Date.now();
        triggered.push(alert);
        this.emit('alert:triggered', alert);
      }
    }

    return triggered;
  }

  dismissAlert(alertId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.triggeredAt = null;
      this.emit('alert:dismissed', alert);
    }
    return alert;
  }

  // Get all telemetry data
  getTelemetry() {
    return {
      metrics: this.metricsRegistry.export(),
      logs: this.auditLog.getStats(),
      traces: {
        active: this.tracing.traces.size,
        total: Array.from(this.tracing.traces.values()).length
      },
      alerts: {
        total: this.alerts.length,
        triggered: this.alerts.filter(a => a.triggeredAt).length
      }
    };
  }

  export() {
    return {
      metrics: this.metricsRegistry.export(),
      logs: this.auditLog.export(),
      traces: Array.from(this.tracing.traces.values()).map(t => t.toJSON()),
      dashboards: Array.from(this.dashboards.values()).map(d => d.export()),
      exportedAt: Date.now()
    };
  }
}

// Factory function
export function createObservabilitySystem(config) {
  return new ObservabilitySystem(config);
}