/**
 * Dashboard.js - AgentIQ Pro Main Dashboard
 * Centralized dashboard for monitoring and controlling all agent systems
 */

import { EventEmitter } from 'events';

// ============================================================================
// DASHBOARD CONSTANTS
// ============================================================================

export const DASHBOARD_THEMES = {
  DARK: 'dark',
  LIGHT: 'light',
  SYSTEM: 'system'
};

export const PANEL_LAYOUTS = {
  GRID: 'grid',
  STACKED: 'stacked',
  FOCUSED: 'focused'
};

export const METRIC_TYPES = {
  PERFORMANCE: 'performance',
  RESOURCE: 'resource',
  ACTIVITY: 'activity',
  QUALITY: 'quality'
};

export const ALERT_LEVELS = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

// ============================================================================
// METRIC DATA CLASS
// ============================================================================

class MetricData {
  constructor(name, value, unit, timestamp, tags = {}) {
    this.name = name;
    this.value = value;
    this.unit = unit;
    this.timestamp = timestamp || Date.now();
    this.tags = { ...tags };
    this.trend = null;
    this.change = null;
  }

  update(value) {
    const oldValue = this.value;
    this.value = value;
    this.timestamp = Date.now();
    
    if (oldValue !== 0) {
      this.change = ((value - oldValue) / oldValue) * 100;
      this.trend = value > oldValue ? 'up' : value < oldValue ? 'down' : 'stable';
    }
  }

  toJSON() {
    return {
      name: this.name,
      value: this.value,
      unit: this.unit,
      timestamp: this.timestamp,
      tags: this.tags,
      trend: this.trend,
      change: this.change
    };
  }
}

// ============================================================================
// METRIC SERIES CLASS
// ============================================================================

class MetricSeries {
  constructor(name, maxPoints = 100) {
    this.name = name;
    this.maxPoints = maxPoints;
    this.points = [];
    this.aggregates = {
      min: null,
      max: null,
      avg: null,
      sum: 0,
      count: 0
    };
  }

  addPoint(value, timestamp) {
    const point = {
      value,
      timestamp: timestamp || Date.now()
    };
    
    this.points.push(point);
    if (this.points.length > this.maxPoints) {
      this.points.shift();
    }
    
    this.updateAggregates();
    return point;
  }

  updateAggregates() {
    if (this.points.length === 0) {
      this.aggregates = { min: null, max: null, avg: null, sum: 0, count: 0 };
      return;
    }

    const values = this.points.map(p => p.value);
    this.aggregates.min = Math.min(...values);
    this.aggregates.max = Math.max(...values);
    this.aggregates.avg = values.reduce((a, b) => a + b, 0) / values.length;
    this.aggregates.sum = values.reduce((a, b) => a + b, 0);
    this.aggregates.count = values.length;
  }

  getRecentPoints(count) {
    return this.points.slice(-count);
  }

  getRange(startTime, endTime) {
    return this.points.filter(p => p.timestamp >= startTime && p.timestamp <= endTime);
  }

  clear() {
    this.points = [];
    this.updateAggregates();
  }

  toJSON() {
    return {
      name: this.name,
      maxPoints: this.maxPoints,
      points: this.points,
      aggregates: this.aggregates
    };
  }
}

// ============================================================================
// ALERT CLASS
// ============================================================================

class Alert {
  constructor(id, level, title, message, source, metadata = {}) {
    this.id = id || `alert-${Date.now()}`;
    this.level = level;
    this.title = title;
    this.message = message;
    this.source = source;
    this.metadata = { ...metadata };
    this.timestamp = Date.now();
    this.acknowledged = false;
    this.resolved = false;
    this.resolvedAt = null;
  }

  acknowledge() {
    this.acknowledged = true;
  }

  resolve() {
    this.resolved = true;
    this.resolvedAt = Date.now();
  }

  escalate() {
    const levels = [ALERT_LEVELS.INFO, ALERT_LEVELS.WARNING, ALERT_LEVELS.ERROR, ALERT_LEVELS.CRITICAL];
    const currentIndex = levels.indexOf(this.level);
    if (currentIndex < levels.length - 1) {
      this.level = levels[currentIndex + 1];
    }
  }

  toJSON() {
    return {
      id: this.id,
      level: this.level,
      title: this.title,
      message: this.message,
      source: this.source,
      metadata: this.metadata,
      timestamp: this.timestamp,
      acknowledged: this.acknowledged,
      resolved: this.resolved,
      resolvedAt: this.resolvedAt
    };
  }
}

// ============================================================================
// WIDGET CONFIG CLASS
// ============================================================================

class WidgetConfig {
  constructor(id, type, title, position, size) {
    this.id = id;
    this.type = type;
    this.title = title;
    this.position = position || { x: 0, y: 0 };
    this.size = size || { width: 1, height: 1 };
    this.config = {};
    this.refreshInterval = 5000;
    this.visible = true;
  }

  setPosition(x, y) {
    this.position = { x, y };
  }

  setSize(width, height) {
    this.size = { width, height };
  }

  setConfig(key, value) {
    this.config[key] = value;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      title: this.title,
      position: this.position,
      size: this.size,
      config: this.config,
      refreshInterval: this.refreshInterval,
      visible: this.visible
    };
  }
}

// ============================================================================
// DASHBOARD MAIN CLASS
// ============================================================================

class Dashboard extends EventEmitter {
  constructor() {
    super();

    // Layout & Theme
    this.theme = DASHBOARD_THEMES.DARK;
    this.layout = PANEL_LAYOUTS.GRID;
    this.widgets = new Map();
    this.panels = new Map();

    // Metrics & Monitoring
    this.metricSeries = new Map();
    this.currentMetrics = new Map();
    this.alerts = [];
    this.alertHistory = [];
    this.maxAlertHistory = 100;

    // System State
    this.systemStatus = 'initializing';
    this.subsystems = new Map();
    this.activityLog = [];
    this.maxActivityLog = 500;

    // Statistics
    this.stats = {
      uptime: Date.now(),
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      avgResponseTime: 0,
      totalRequests: 0
    };

    // Refresh
    this.refreshInterval = null;
    this.refreshRate = 1000;
    this.autoRefresh = true;

    // Configuration
    this.config = {
      maxMetrics: 1000,
      alertThresholds: {},
      notificationChannels: [],
      persistenceEnabled: true
    };
  }

  // ============================================================================
  // WIDGET MANAGEMENT
  // ============================================================================

  addWidget(id, type, title, position, size) {
    const widget = new WidgetConfig(id, type, title, position, size);
    this.widgets.set(id, widget);
    this.emit('widgetAdded', { widget });
    return widget;
  }

  removeWidget(widgetId) {
    const removed = this.widgets.delete(widgetId);
    if (removed) {
      this.emit('widgetRemoved', { widgetId });
    }
    return removed;
  }

  getWidget(widgetId) {
    return this.widgets.get(widgetId);
  }

  getAllWidgets() {
    return Array.from(this.widgets.values());
  }

  updateWidgetPosition(widgetId, x, y) {
    const widget = this.widgets.get(widgetId);
    if (widget) {
      widget.setPosition(x, y);
      this.emit('widgetUpdated', { widget });
    }
  }

  updateWidgetSize(widgetId, width, height) {
    const widget = this.widgets.get(widgetId);
    if (widget) {
      widget.setSize(width, height);
      this.emit('widgetUpdated', { widget });
    }
  }

  toggleWidgetVisibility(widgetId) {
    const widget = this.widgets.get(widgetId);
    if (widget) {
      widget.visible = !widget.visible;
      this.emit('widgetUpdated', { widget });
      return widget.visible;
    }
    return null;
  }

  // ============================================================================
  // METRICS MANAGEMENT
  // ============================================================================

  createMetricSeries(name, maxPoints = 100) {
    const series = new MetricSeries(name, maxPoints);
    this.metricSeries.set(name, series);
    return series;
  }

  recordMetric(name, value, unit = '', tags = {}) {
    // Update or create metric data
    let metric = this.currentMetrics.get(name);
    if (metric) {
      metric.update(value);
    } else {
      metric = new MetricData(name, value, unit, Date.now(), tags);
      this.currentMetrics.set(name, metric);
    }

    // Add to series if exists
    const series = this.metricSeries.get(name);
    if (series) {
      series.addPoint(value);
    }

    // Prune old metrics
    if (this.currentMetrics.size > this.config.maxMetrics) {
      const oldest = Array.from(this.currentMetrics.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      this.currentMetrics.delete(oldest[0]);
    }

    this.emit('metricRecorded', { name, value, metric });
    return metric;
  }

  getMetric(name) {
    return this.currentMetrics.get(name);
  }

  getMetricSeries(name) {
    return this.metricSeries.get(name);
  }

  getAllMetrics() {
    return Array.from(this.currentMetrics.values());
  }

  getAllMetricSeries() {
    return Array.from(this.metricSeries.values());
  }

  getMetricsByType(type) {
    return this.getAllMetrics().filter(m => m.tags.type === type);
  }

  clearMetrics() {
    this.currentMetrics.clear();
    for (const series of this.metricSeries.values()) {
      series.clear();
    }
    this.emit('metricsCleared');
  }

  // ============================================================================
  // ALERTS MANAGEMENT
  // ============================================================================

  createAlert(level, title, message, source, metadata = {}) {
    const alert = new Alert(null, level, title, message, source, metadata);
    this.alerts.unshift(alert);

    // Keep alerts manageable
    if (this.alerts.length > 50) {
      const removed = this.alerts.pop();
      this.addToAlertHistory(removed);
    }

    this.emit('alertCreated', { alert });
    return alert;
  }

  acknowledgeAlert(alertId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledge();
      this.emit('alertAcknowledged', { alert });
    }
  }

  resolveAlert(alertId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolve();
      this.addToAlertHistory(alert);
      this.alerts = this.alerts.filter(a => a.id !== alertId);
      this.emit('alertResolved', { alert });
    }
  }

  escalateAlert(alertId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.escalate();
      this.emit('alertEscalated', { alert });
    }
  }

  addToAlertHistory(alert) {
    this.alertHistory.unshift(alert.toJSON());
    if (this.alertHistory.length > this.maxAlertHistory) {
      this.alertHistory.pop();
    }
  }

  getActiveAlerts(level = null) {
    if (level) {
      return this.alerts.filter(a => a.level === level);
    }
    return [...this.alerts];
  }

  getAlertHistory() {
    return [...this.alertHistory];
  }

  getCriticalAlertCount() {
    return this.alerts.filter(a => a.level === ALERT_LEVELS.CRITICAL && !a.resolved).length;
  }

  clearAlerts() {
    for (const alert of this.alerts) {
      this.addToAlertHistory(alert);
    }
    this.alerts = [];
    this.emit('alertsCleared');
  }

  // ============================================================================
  // SUBSYSTEM MANAGEMENT
  // ============================================================================

  registerSubsystem(name, type, status = 'active') {
    const subsystem = {
      name,
      type,
      status,
      lastUpdate: Date.now(),
      metrics: {},
      errors: []
    };
    this.subsystems.set(name, subsystem);
    this.emit('subsystemRegistered', { name, subsystem });
    return subsystem;
  }

  updateSubsystemStatus(name, status, metrics = {}) {
    const subsystem = this.subsystems.get(name);
    if (subsystem) {
      subsystem.status = status;
      subsystem.lastUpdate = Date.now();
      subsystem.metrics = { ...subsystem.metrics, ...metrics };
      this.emit('subsystemStatusUpdated', { name, subsystem });
    }
  }

  getSubsystem(name) {
    return this.subsystems.get(name);
  }

  getAllSubsystems() {
    return Array.from(this.subsystems.values());
  }

  getSubsystemStatus(name) {
    const subsystem = this.subsystems.get(name);
    return subsystem?.status || 'unknown';
  }

  getUnhealthySubsystems() {
    return this.getAllSubsystems().filter(s => s.status !== 'active');
  }

  // ============================================================================
  // ACTIVITY LOG
  // ============================================================================

  logActivity(action, details = {}, source = 'dashboard') {
    const entry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      action,
      details,
      source,
      timestamp: Date.now()
    };

    this.activityLog.unshift(entry);
    if (this.activityLog.length > this.maxActivityLog) {
      this.activityLog.pop();
    }

    this.emit('activityLogged', { entry });
    return entry;
  }

  getActivityLog(filter = {}) {
    let logs = [...this.activityLog];

    if (filter.source) {
      logs = logs.filter(l => l.source === filter.source);
    }
    if (filter.action) {
      logs = logs.filter(l => l.action === filter.action);
    }
    if (filter.since) {
      logs = logs.filter(l => l.timestamp >= filter.since);
    }
    if (filter.until) {
      logs = logs.filter(l => l.timestamp <= filter.until);
    }

    return logs;
  }

  clearActivityLog() {
    this.activityLog = [];
    this.emit('activityLogCleared');
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  updateStats(updates) {
    this.stats = { ...this.stats, ...updates };
    this.emit('statsUpdated', { stats: this.stats });
  }

  incrementTaskCount(completed = false, failed = false) {
    this.stats.totalTasks++;
    if (completed) this.stats.completedTasks++;
    if (failed) this.stats.failedTasks++;
    this.emit('taskCountUpdated', { stats: this.stats });
  }

  recordResponseTime(timeMs) {
    const count = this.stats.totalRequests || 1;
    this.stats.avgResponseTime = 
      ((this.stats.avgResponseTime * (count - 1)) + timeMs) / count;
    this.stats.totalRequests = count;
    this.emit('responseTimeRecorded', { avgResponseTime: this.stats.avgResponseTime });
  }

  getUptime() {
    return Date.now() - this.stats.uptime;
  }

  getSuccessRate() {
    if (this.stats.totalTasks === 0) return 0;
    return (this.stats.completedTasks / this.stats.totalTasks) * 100;
  }

  getFailureRate() {
    if (this.stats.totalTasks === 0) return 0;
    return (this.stats.failedTasks / this.stats.totalTasks) * 100;
  }

  getStats() {
    return {
      ...this.stats,
      uptime: this.getUptime(),
      successRate: this.getSuccessRate(),
      failureRate: this.getFailureRate()
    };
  }

  // ============================================================================
  // SYSTEM STATUS
  // ============================================================================

  setSystemStatus(status) {
    const previousStatus = this.systemStatus;
    this.systemStatus = status;
    this.emit('systemStatusChanged', { previousStatus, currentStatus: status });
  }

  getSystemStatus() {
    return {
      status: this.systemStatus,
      healthy: this.subsystems.size === 0 || 
        this.getUnhealthySubsystems().length === 0,
      alerts: {
        total: this.alerts.length,
        critical: this.getCriticalAlertCount(),
        warning: this.alerts.filter(a => a.level === ALERT_LEVELS.WARNING).length
      },
      subsystems: {
        total: this.subsystems.size,
        active: this.getAllSubsystems().filter(s => s.status === 'active').length
      }
    };
  }

  // ============================================================================
  // LAYOUT & THEME
  // ============================================================================

  setTheme(theme) {
    if (Object.values(DASHBOARD_THEMES).includes(theme)) {
      this.theme = theme;
      this.emit('themeChanged', { theme });
    }
  }

  getTheme() {
    return this.theme;
  }

  setLayout(layout) {
    if (Object.values(PANEL_LAYOUTS).includes(layout)) {
      this.layout = layout;
      this.emit('layoutChanged', { layout });
    }
  }

  getLayout() {
    return this.layout;
  }

  // ============================================================================
  // REFRESH MANAGEMENT
  // ============================================================================

  startAutoRefresh(interval = null) {
    if (interval) {
      this.refreshRate = interval;
    }

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    this.autoRefresh = true;
    this.refreshInterval = setInterval(() => {
      this.refresh();
    }, this.refreshRate);

    this.emit('autoRefreshStarted', { interval: this.refreshRate });
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    this.autoRefresh = false;
    this.emit('autoRefreshStopped');
  }

  refresh() {
    this.emit('refresh', { timestamp: Date.now() });
  }

  setRefreshRate(rate) {
    this.refreshRate = rate;
    if (this.autoRefresh) {
      this.startAutoRefresh(rate);
    }
  }

  // ============================================================================
  // EXPORT & IMPORT
  // ============================================================================

  exportConfiguration() {
    return {
      version: '1.0',
      exportedAt: Date.now(),
      theme: this.theme,
      layout: this.layout,
      widgets: Array.from(this.widgets.values()).map(w => w.toJSON()),
      config: this.config
    };
  }

  importConfiguration(config) {
    try {
      if (config.theme) this.theme = config.theme;
      if (config.layout) this.layout = config.layout;
      if (config.widgets) {
        this.widgets.clear();
        for (const w of config.widgets) {
          const widget = new WidgetConfig(w.id, w.type, w.title, w.position, w.size);
          widget.config = w.config || {};
          widget.refreshInterval = w.refreshInterval || 5000;
          widget.visible = w.visible !== false;
          this.widgets.set(w.id, widget);
        }
      }
      if (config.config) {
        this.config = { ...this.config, ...config.config };
      }
      
      this.emit('configurationImported', { config });
      return true;
    } catch (error) {
      this.emit('configurationError', { error });
      return false;
    }
  }

  // ============================================================================
  // REPORTING
  // ============================================================================

  generateReport(format = 'json') {
    const report = {
      generatedAt: Date.now(),
      systemStatus: this.getSystemStatus(),
      stats: this.getStats(),
      alerts: {
        active: this.alerts.map(a => a.toJSON()),
        history: this.alertHistory
      },
      metrics: {
        current: this.getAllMetrics().map(m => m.toJSON()),
        series: Array.from(this.metricSeries.values()).map(s => s.toJSON())
      },
      subsystems: this.getAllSubsystems(),
      activityLog: this.activityLog.slice(0, 100)
    };

    if (format === 'json') {
      return JSON.stringify(report, null, 2);
    }

    return report;
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  destroy() {
    this.stopAutoRefresh();
    this.widgets.clear();
    this.subsystems.clear();
    this.metricSeries.clear();
    this.currentMetrics.clear();
    this.alerts = [];
    this.activityLog = [];
    this.removeAllListeners();
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

const dashboard = new Dashboard();

export {
  Dashboard,
  MetricData,
  MetricSeries,
  Alert,
  WidgetConfig,
  DASHBOARD_THEMES,
  PANEL_LAYOUTS,
  METRIC_TYPES,
  ALERT_LEVELS
};

export default dashboard;