/**
 * AgentReplayUI.js - Agent Execution Replay System
 * Provides timeline-based visualization and playback of agent execution histories
 */

import { EventEmitter } from 'events';

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export const REPLAY_SPEED = {
  SLOW: 0.5,
  NORMAL: 1,
  FAST: 2,
  VERY_FAST: 4,
  INSTANT: 0
};

export const REPLAY_STATES = {
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  PLAYING: 'playing',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ERROR: 'error'
};

export const REPLAY_EVENTS = {
  STATE_CHANGED: 'stateChanged',
  STEP_CHANGED: 'stepChanged',
  TIMELINE_LOADED: 'timelineLoaded',
  SNAPSHOT_LOADED: 'snapshotLoaded',
  PLAYBACK_STARTED: 'playbackStarted',
  PLAYBACK_PAUSED: 'playbackPaused',
  PLAYBACK_COMPLETED: 'playbackCompleted',
  ERROR: 'error'
};

// ============================================================================
// REPLAY SNAPSHOT CLASS
// ============================================================================

class ReplaySnapshot {
  constructor(stepIndex, timestamp, state, actions, metrics, metadata = {}) {
    this.stepIndex = stepIndex;
    this.timestamp = timestamp;
    this.state = { ...state };
    this.actions = [...actions];
    this.metrics = { ...metrics };
    this.metadata = { ...metadata };
  }

  toJSON() {
    return {
      stepIndex: this.stepIndex,
      timestamp: this.timestamp,
      state: this.state,
      actions: this.actions,
      metrics: this.metrics,
      metadata: this.metadata
    };
  }

  static fromJSON(json) {
    return new ReplaySnapshot(
      json.stepIndex,
      json.timestamp,
      json.state,
      json.actions,
      json.metrics,
      json.metadata
    );
  }
}

// ============================================================================
// AGENT ACTION CLASS
// ============================================================================

class AgentAction {
  constructor(type, description, agentId, timestamp, params = {}) {
    this.id = `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.type = type;
    this.description = description;
    this.agentId = agentId;
    this.timestamp = timestamp;
    this.params = { ...params };
    this.result = null;
    this.duration = 0;
    this.success = true;
    this.error = null;
  }

  complete(result, duration) {
    this.result = result;
    this.duration = duration;
  }

  fail(error) {
    this.success = false;
    this.error = error;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      description: this.description,
      agentId: this.agentId,
      timestamp: this.timestamp,
      params: this.params,
      result: this.result,
      duration: this.duration,
      success: this.success,
      error: this.error
    };
  }
}

// ============================================================================
// TIMELINE EVENT CLASS
// ============================================================================

class TimelineEvent {
  constructor(time, eventType, data, severity = 'info') {
    this.id = `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.time = time;
    this.eventType = eventType;
    this.data = { ...data };
    this.severity = severity;
    this.annotations = [];
    this.bookmarked = false;
  }

  addAnnotation(text, author) {
    this.annotations.push({
      id: `ann-${Date.now()}`,
      text,
      author,
      timestamp: Date.now()
    });
  }

  toggleBookmark() {
    this.bookmarked = !this.bookmarked;
  }

  toJSON() {
    return {
      id: this.id,
      time: this.time,
      eventType: this.eventType,
      data: this.data,
      severity: this.severity,
      annotations: this.annotations,
      bookmarked: this.bookmarked
    };
  }
}

// ============================================================================
// REPLAY TIMELINE CLASS
// ============================================================================

class ReplayTimeline {
  constructor(name, description = '') {
    this.id = `timeline-${Date.now()}`;
    this.name = name;
    this.description = description;
    this.snapshots = [];
    this.events = [];
    this.markers = [];
    this.createdAt = Date.now();
    this.duration = 0;
    this.metadata = {};
  }

  addSnapshot(snapshot) {
    this.snapshots.push(snapshot);
    if (snapshot.stepIndex > 0) {
      const prevSnapshot = this.snapshots[this.snapshots.length - 2];
      if (prevSnapshot) {
        snapshot.offsetTime = snapshot.timestamp - prevSnapshot.timestamp;
      }
    }
  }

  addEvent(event) {
    this.events.push(event);
    this.events.sort((a, b) => a.time - b.time);
  }

  addMarker(label, stepIndex, color = '#007bff') {
    this.markers.push({
      id: `marker-${Date.now()}`,
      label,
      stepIndex,
      color,
      timestamp: Date.now()
    });
  }

  getSnapshot(stepIndex) {
    return this.snapshots.find(s => s.stepIndex === stepIndex);
  }

  getEventsInRange(startTime, endTime) {
    return this.events.filter(e => e.time >= startTime && e.time <= endTime);
  }

  getBookmarkedEvents() {
    return this.events.filter(e => e.bookmarked);
  }

  getDuration() {
    if (this.snapshots.length === 0) return 0;
    const first = this.snapshots[0].timestamp;
    const last = this.snapshots[this.snapshots.length - 1].timestamp;
    return last - first;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      snapshots: this.snapshots.map(s => s.toJSON()),
      events: this.events.map(e => e.toJSON()),
      markers: this.markers,
      createdAt: this.createdAt,
      duration: this.duration,
      metadata: this.metadata
    };
  }

  static fromJSON(json) {
    const timeline = new ReplayTimeline(json.name, json.description);
    timeline.id = json.id;
    timeline.snapshots = json.snapshots.map(s => ReplaySnapshot.fromJSON(s));
    timeline.events = json.events;
    timeline.markers = json.markers;
    timeline.createdAt = json.createdAt;
    timeline.duration = json.duration;
    timeline.metadata = json.metadata;
    return timeline;
  }
}

// ============================================================================
// REPLAY CONTROLLER CLASS
// ============================================================================

class ReplayController extends EventEmitter {
  constructor(timeline) {
    super();
    this.timeline = timeline;
    this.currentStep = 0;
    this.state = REPLAY_STATES.IDLE;
    this.speed = REPLAY_SPEED.NORMAL;
    this.playbackTimer = null;
    this.stepDelay = 1000;
    this.autoPlay = false;
  }

  get totalSteps() {
    return this.timeline.snapshots.length;
  }

  get currentSnapshot() {
    return this.timeline.getSnapshot(this.currentStep);
  }

  get progress() {
    if (this.totalSteps === 0) return 0;
    return (this.currentStep / (this.totalSteps - 1)) * 100;
  }

  setSpeed(speed) {
    this.speed = speed;
    if (this.playbackTimer) {
      this.stop();
      if (this.state === REPLAY_STATES.PLAYING) {
        this.play();
      }
    }
  }

  setStep(step) {
    if (step < 0 || step >= this.totalSteps) {
      this.emit(REPLAY_EVENTS.ERROR, { message: 'Step index out of range' });
      return;
    }

    const previousStep = this.currentStep;
    this.currentStep = step;

    if (this.state === REPLAY_STATES.PLAYING) {
      this.stop();
    }

    this.state = REPLAY_STATES.PAUSED;
    this.emit(REPLAY_EVENTS.STEP_CHANGED, {
      step: this.currentStep,
      snapshot: this.currentSnapshot,
      previousStep
    });
  }

  play() {
    if (this.state === REPLAY_STATES.COMPLETED) {
      this.currentStep = 0;
    }

    if (this.currentStep >= this.totalSteps - 1) {
      this.state = REPLAY_STATES.COMPLETED;
      this.emit(REPLAY_EVENTS.PLAYBACK_COMPLETED);
      return;
    }

    this.state = REPLAY_STATES.PLAYING;
    this.emit(REPLAY_EVENTS.PLAYBACK_STARTED);

    const delay = this.speed === REPLAY_SPEED.INSTANT ? 0 : this.stepDelay / this.speed;

    this.playbackTimer = setTimeout(() => {
      this.nextStep();
      if (this.currentStep < this.totalSteps - 1) {
        this.play();
      } else {
        this.state = REPLAY_STATES.COMPLETED;
        this.emit(REPLAY_EVENTS.PLAYBACK_COMPLETED);
      }
    }, delay);
  }

  pause() {
    if (this.state !== REPLAY_STATES.PLAYING) return;

    this.stop();
    this.state = REPLAY_STATES.PAUSED;
    this.emit(REPLAY_EVENTS.PLAYBACK_PAUSED);
  }

  stop() {
    if (this.playbackTimer) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }
  }

  nextStep() {
    if (this.currentStep < this.totalSteps - 1) {
      this.setStep(this.currentStep + 1);
    }
  }

  previousStep() {
    if (this.currentStep > 0) {
      this.setStep(this.currentStep - 1);
    }
  }

  goToStart() {
    this.setStep(0);
  }

  goToEnd() {
    this.setStep(this.totalSteps - 1);
  }

  destroy() {
    this.stop();
    this.removeAllListeners();
  }
}

// ============================================================================
// AGENT REPLAY UI MAIN CLASS
// ============================================================================

class AgentReplayUI extends EventEmitter {
  constructor() {
    super();

    this.timelines = new Map();
    this.currentTimeline = null;
    this.controller = null;
    this.filters = {
      agentIds: [],
      actionTypes: [],
      severity: [],
      searchText: ''
    };
    this.sortOrder = 'asc';
    this.storageProvider = null;
    this.autoSave = true;
    this.maxStoredTimelines = 50;

    this.state = REPLAY_STATES.IDLE;
  }

  // ============================================================================
  // TIMELINE MANAGEMENT
  // ============================================================================

  createTimeline(name, description = '') {
    const timeline = new ReplayTimeline(name, description);
    this.timelines.set(timeline.id, timeline);
    this.currentTimeline = timeline;
    this.controller = new ReplayController(timeline);

    this.setupControllerListeners();
    this.emit(REPLAY_EVENTS.TIMELINE_LOADED, { timeline });

    return timeline;
  }

  loadTimeline(timelineOrId) {
    let timeline;
    if (typeof timelineOrId === 'string') {
      timeline = this.timelines.get(timelineOrId);
    } else {
      timeline = timelineOrId;
    }

    if (!timeline) {
      throw new Error('Timeline not found');
    }

    this.currentTimeline = timeline;
    this.controller = new ReplayController(timeline);
    this.state = REPLAY_STATES.READY;

    this.setupControllerListeners();
    this.emit(REPLAY_EVENTS.TIMELINE_LOADED, { timeline });

    return timeline;
  }

  deleteTimeline(timelineId) {
    const deleted = this.timelines.delete(timelineId);
    if (deleted && this.currentTimeline?.id === timelineId) {
      this.currentTimeline = null;
      this.controller?.destroy();
      this.controller = null;
      this.state = REPLAY_STATES.IDLE;
    }
    return deleted;
  }

  getTimeline(timelineId) {
    return this.timelines.get(timelineId);
  }

  getAllTimelines() {
    return Array.from(this.timelines.values());
  }

  // ============================================================================
  // SNAPSHOT MANAGEMENT
  // ============================================================================

  captureSnapshot(stepIndex, state, actions, metrics, metadata = {}) {
    if (!this.currentTimeline) {
      throw new Error('No timeline loaded');
    }

    const timestamp = Date.now();
    const snapshot = new ReplaySnapshot(stepIndex, timestamp, state, actions, metrics, metadata);
    this.currentTimeline.addSnapshot(snapshot);

    this.emit(REPLAY_EVENTS.SNAPSHOT_LOADED, { snapshot });
    return snapshot;
  }

  addEvent(time, eventType, data, severity = 'info') {
    if (!this.currentTimeline) {
      throw new Error('No timeline loaded');
    }

    const event = new TimelineEvent(time, eventType, data, severity);
    this.currentTimeline.addEvent(event);
    return event;
  }

  // ============================================================================
  // PLAYBACK CONTROLS
  // ============================================================================

  getController() {
    return this.controller;
  }

  play() {
    if (!this.controller) {
      throw new Error('No timeline loaded');
    }
    this.state = REPLAY_STATES.PLAYING;
    this.controller.play();
  }

  pause() {
    if (!this.controller) return;
    this.state = REPLAY_STATES.PAUSED;
    this.controller.pause();
  }

  stop() {
    if (!this.controller) return;
    this.controller.stop();
    this.state = REPLAY_STATES.READY;
  }

  setStep(step) {
    if (!this.controller) return;
    this.controller.setStep(step);
  }

  nextStep() {
    if (!this.controller) return;
    this.controller.nextStep();
  }

  previousStep() {
    if (!this.controller) return;
    this.controller.previousStep();
  }

  goToStart() {
    if (!this.controller) return;
    this.controller.goToStart();
  }

  goToEnd() {
    if (!this.controller) return;
    this.controller.goToEnd();
  }

  setSpeed(speed) {
    if (!this.controller) return;
    this.controller.setSpeed(speed);
  }

  setAutoPlay(enabled) {
    this.controller.autoPlay = enabled;
    if (enabled && this.state === REPLAY_STATES.READY) {
      this.play();
    }
  }

  // ============================================================================
  // MARKERS
  // ============================================================================

  addMarker(label, stepIndex, color = '#007bff') {
    if (!this.currentTimeline) return;
    const marker = {
      id: `marker-${Date.now()}`,
      label,
      stepIndex,
      color,
      timestamp: Date.now()
    };
    this.currentTimeline.markers.push(marker);
    return marker;
  }

  removeMarker(markerId) {
    if (!this.currentTimeline) return false;
    const index = this.currentTimeline.markers.findIndex(m => m.id === markerId);
    if (index !== -1) {
      this.currentTimeline.markers.splice(index, 1);
      return true;
    }
    return false;
  }

  getMarkers() {
    return this.currentTimeline?.markers || [];
  }

  goToMarker(markerId) {
    if (!this.currentTimeline || !this.controller) return;
    const marker = this.currentTimeline.markers.find(m => m.id === markerId);
    if (marker) {
      this.controller.setStep(marker.stepIndex);
    }
  }

  // ============================================================================
  // FILTERING & SEARCH
  // ============================================================================

  setFilters(filters) {
    this.filters = { ...this.filters, ...filters };
    this.emit('filtersChanged', { filters: this.filters });
  }

  clearFilters() {
    this.filters = {
      agentIds: [],
      actionTypes: [],
      severity: [],
      searchText: ''
    };
    this.emit('filtersChanged', { filters: this.filters });
  }

  getFilteredSnapshots() {
    if (!this.currentTimeline) return [];

    return this.currentTimeline.snapshots.filter(snapshot => {
      if (this.filters.agentIds.length > 0) {
        const hasMatchingAgent = this.filters.agentIds.some(agentId =>
          snapshot.state.agentId === agentId
        );
        if (!hasMatchingAgent) return false;
      }

      if (this.filters.actionTypes.length > 0) {
        const hasMatchingAction = snapshot.actions.some(action =>
          this.filters.actionTypes.includes(action.type)
        );
        if (!hasMatchingAction) return false;
      }

      if (this.filters.searchText) {
        const searchLower = this.filters.searchText.toLowerCase();
        const matchesState = JSON.stringify(snapshot.state).toLowerCase().includes(searchLower);
        const matchesActions = snapshot.actions.some(a =>
          a.description.toLowerCase().includes(searchLower)
        );
        if (!matchesState && !matchesActions) return false;
      }

      return true;
    });
  }

  getFilteredEvents() {
    if (!this.currentTimeline) return [];

    return this.currentTimeline.events.filter(event => {
      if (this.filters.severity.length > 0) {
        if (!this.filters.severity.includes(event.severity)) return false;
      }

      if (this.filters.searchText) {
        const searchLower = this.filters.searchText.toLowerCase();
        const matchesData = JSON.stringify(event.data).toLowerCase().includes(searchLower);
        if (!matchesData) return false;
      }

      return true;
    });
  }

  searchTimelines(query) {
    const queryLower = query.toLowerCase();
    const results = [];

    for (const timeline of this.timelines.values()) {
      const matches = [];
      
      if (timeline.name.toLowerCase().includes(queryLower)) {
        matches.push({ type: 'name', value: timeline.name });
      }

      if (timeline.description.toLowerCase().includes(queryLower)) {
        matches.push({ type: 'description', value: timeline.description });
      }

      for (const snapshot of timeline.snapshots) {
        const stateJson = JSON.stringify(snapshot.state).toLowerCase();
        if (stateJson.includes(queryLower)) {
          matches.push({
            type: 'snapshot',
            timelineId: timeline.id,
            stepIndex: snapshot.stepIndex
          });
        }
      }

      for (const event of timeline.events) {
        const eventJson = JSON.stringify(event.data).toLowerCase();
        if (eventJson.includes(queryLower)) {
          matches.push({
            type: 'event',
            timelineId: timeline.id,
            eventType: event.eventType
          });
        }
      }

      if (matches.length > 0) {
        results.push({ timeline, matches });
      }
    }

    return results;
  }

  // ============================================================================
  // EXPORT & IMPORT
  // ============================================================================

  exportTimeline(timelineId) {
    const timeline = this.timelines.get(timelineId);
    if (!timeline) return null;
    return JSON.stringify(timeline.toJSON(), null, 2);
  }

  importTimeline(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      const timeline = ReplayTimeline.fromJSON(data);
      this.timelines.set(timeline.id, timeline);
      this.emit('timelineImported', { timeline });
      return timeline;
    } catch (error) {
      this.emit(REPLAY_EVENTS.ERROR, { message: 'Invalid timeline JSON', error });
      return null;
    }
  }

  exportAllTimelines() {
    const data = {
      version: '1.0',
      exportedAt: Date.now(),
      timelines: Array.from(this.timelines.values()).map(t => t.toJSON())
    };
    return JSON.stringify(data, null, 2);
  }

  importAllTimelines(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (!data.timelines) throw new Error('Invalid format');

      let imported = 0;
      for (const timelineData of data.timelines) {
        const timeline = ReplayTimeline.fromJSON(timelineData);
        this.timelines.set(timeline.id, timeline);
        imported++;
      }

      this.emit('timelinesImported', { count: imported });
      return imported;
    } catch (error) {
      this.emit(REPLAY_EVENTS.ERROR, { message: 'Invalid import format', error });
      return 0;
    }
  }

  // ============================================================================
  // STORAGE
  // ============================================================================

  setStorageProvider(provider) {
    this.storageProvider = provider;
  }

  async saveToStorage(timelineId) {
    if (!this.storageProvider) return false;

    const timeline = this.timelines.get(timelineId);
    if (!timeline) return false;

    try {
      await this.storageProvider.save(`replay_${timelineId}`, timeline.toJSON());
      return true;
    } catch (error) {
      this.emit(REPLAY_EVENTS.ERROR, { message: 'Failed to save timeline', error });
      return false;
    }
  }

  async loadFromStorage(timelineId) {
    if (!this.storageProvider) return null;

    try {
      const data = await this.storageProvider.load(`replay_${timelineId}`);
      if (data) {
        const timeline = ReplayTimeline.fromJSON(data);
        this.timelines.set(timeline.id, timeline);
        return timeline;
      }
      return null;
    } catch (error) {
      this.emit(REPLAY_EVENTS.ERROR, { message: 'Failed to load timeline', error });
      return null;
    }
  }

  async pruneOldTimelines() {
    const timelines = Array.from(this.timelines.values());
    if (timelines.length <= this.maxStoredTimelines) return 0;

    timelines.sort((a, b) => a.createdAt - b.createdAt);
    
    let removed = 0;
    while (timelines.length > this.maxStoredTimelines) {
      const oldest = timelines.shift();
      if (this.storageProvider) {
        await this.storageProvider.delete(`replay_${oldest.id}`);
      }
      this.timelines.delete(oldest.id);
      removed++;
    }

    return removed;
  }

  // ============================================================================
  // STATISTICS & ANALYTICS
  // ============================================================================

  getTimelineStats(timelineId) {
    const timeline = this.timelines.get(timelineId);
    if (!timeline) return null;

    const stats = {
      totalSnapshots: timeline.snapshots.length,
      totalEvents: timeline.events.length,
      totalMarkers: timeline.markers.length,
      duration: timeline.getDuration(),
      createdAt: timeline.createdAt,
      avgActionsPerSnapshot: 0,
      actionTypeDistribution: {},
      eventTypeDistribution: {},
      errorCount: 0
    };

    if (timeline.snapshots.length > 0) {
      const actionCounts = {};
      let totalActions = 0;

      for (const snapshot of timeline.snapshots) {
        totalActions += snapshot.actions.length;
        for (const action of snapshot.actions) {
          actionCounts[action.type] = (actionCounts[action.type] || 0) + 1;
          if (!action.success) stats.errorCount++;
        }
      }

      stats.avgActionsPerSnapshot = totalActions / timeline.snapshots.length;
      stats.actionTypeDistribution = actionCounts;
    }

    if (timeline.events.length > 0) {
      const eventCounts = {};
      for (const event of timeline.events) {
        eventCounts[event.eventType] = (eventCounts[event.eventType] || 0) + 1;
      }
      stats.eventTypeDistribution = eventCounts;
    }

    return stats;
  }

  getComparisonReport(timelineIds) {
    const reports = timelineIds.map(id => ({
      timelineId: id,
      stats: this.getTimelineStats(id)
    }));

    return {
      timelines: reports,
      comparison: {
        avgDuration: reports.reduce((sum, r) => sum + (r.stats?.duration || 0), 0) / reports.length,
        avgErrors: reports.reduce((sum, r) => sum + (r.stats?.errorCount || 0), 0) / reports.length,
        mostCommonAction: this.getMostCommonAction(reports),
        mostCommonEvent: this.getMostCommonEvent(reports)
      }
    };
  }

  getMostCommonAction(reports) {
    const allActions = {};
    for (const report of reports) {
      if (report.stats?.actionTypeDistribution) {
        for (const [type, count] of Object.entries(report.stats.actionTypeDistribution)) {
          allActions[type] = (allActions[type] || 0) + count;
        }
      }
    }
    return Object.entries(allActions).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }

  getMostCommonEvent(reports) {
    const allEvents = {};
    for (const report of reports) {
      if (report.stats?.eventTypeDistribution) {
        for (const [type, count] of Object.entries(report.stats.eventTypeDistribution)) {
          allEvents[type] = (allEvents[type] || 0) + count;
        }
      }
    }
    return Object.entries(allEvents).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  setupControllerListeners() {
    if (!this.controller) return;

    const forwardEvents = [
      REPLAY_EVENTS.STEP_CHANGED,
      REPLAY_EVENTS.PLAYBACK_STARTED,
      REPLAY_EVENTS.PLAYBACK_PAUSED,
      REPLAY_EVENTS.PLAYBACK_COMPLETED,
      REPLAY_EVENTS.ERROR
    ];

    for (const event of forwardEvents) {
      this.controller.on(event, (data) => {
        this.state = this.controller.state;
        this.emit(event, data);
      });
    }
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  destroy() {
    this.controller?.destroy();
    this.timelines.clear();
    this.currentTimeline = null;
    this.controller = null;
    this.removeAllListeners();
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

const agentReplayUI = new AgentReplayUI();

export {
  AgentReplayUI,
  ReplaySnapshot,
  AgentAction,
  TimelineEvent,
  ReplayTimeline,
  ReplayController
};

export default agentReplayUI;