/**
 * EventBus - Real-time event streaming and pub/sub system
 * Enables reactive communication between agents and UI components
 */

class EventEmitter {
  constructor() {
    this.events = new Map();
    this.maxListeners = 10;
  }

  /**
   * Subscribe to an event
   */
  on(event, listener, options = {}) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }

    const handlers = this.events.get(event);
    
    // Check max listeners
    if (handlers.length >= this.maxListeners) {
      console.warn(`Max listeners (${this.maxListeners}) reached for event: ${event}`);
    }

    const handlerWrapper = {
      listener,
      once: options.once || false,
      priority: options.priority || 0,
      id: options.id || `handler-${Date.now()}-${Math.random()}`
    };

    handlers.push(handlerWrapper);
    
    // Sort by priority (higher first)
    handlers.sort((a, b) => b.priority - a.priority);

    // Return unsubscribe function
    return () => this.off(event, handlerWrapper.id);
  }

  /**
   * Subscribe to an event once
   */
  once(event, listener, options = {}) {
    return this.on(event, listener, { ...options, once: true });
  }

  /**
   * Unsubscribe from an event
   */
  off(event, handlerId) {
    if (!this.events.has(event)) return false;

    const handlers = this.events.get(event);
    const index = handlers.findIndex(h => h.id === handlerId);

    if (index > -1) {
      handlers.splice(index, 1);
      return true;
    }

    return false;
  }

  /**
   * Emit an event with data
   */
  emit(event, data) {
    if (!this.events.has(event)) {
      return { total: 0, handled: 0 };
    }

    const handlers = this.events.get(event);
    let handled = 0;

    // Create copy to allow modification during iteration
    const toProcess = [...handlers];
    
    for (const handler of toProcess) {
      try {
        handler.listener(data);
        handled++;

        // Remove one-time handlers
        if (handler.once) {
          const idx = handlers.indexOf(handler);
          if (idx > -1) handlers.splice(idx, 1);
        }
      } catch (error) {
        console.error(`Error in event handler for "${event}":`, error);
      }
    }

    return { total: handlers.length, handled };
  }

  /**
   * Remove all listeners for an event
   */
  removeAllListeners(event) {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }

  /**
   * Get listener count for an event
   */
  listenerCount(event) {
    return this.events.has(event) ? this.events.get(event).length : 0;
  }

  /**
   * Get all event names
   */
  eventNames() {
    return Array.from(this.events.keys());
  }
}

/**
 * Event types for the agent system
 */
export const EventTypes = {
  // Agent events
  AGENT_STARTED: 'agent:started',
  AGENT_COMPLETED: 'agent:completed',
  AGENT_FAILED: 'agent:failed',
  AGENT_PROGRESS: 'agent:progress',
  
  // Task events
  TASK_STARTED: 'task:started',
  TASK_COMPLETED: 'task:completed',
  TASK_FAILED: 'task:failed',
  TASK_PROGRESS: 'task:progress',
  
  // Skill events
  SKILL_REGISTERED: 'skill:registered',
  SKILL_EXECUTED: 'skill:executed',
  SKILL_FAILED: 'skill:failed',
  
  // LLM events
  LLM_REQUEST: 'llm:request',
  LLM_RESPONSE: 'llm:response',
  LLM_ERROR: 'llm:error',
  
  // System events
  SYSTEM_ERROR: 'system:error',
  SYSTEM_WARNING: 'system:warning',
  METRICS_UPDATE: 'metrics:update',
  
  // Stream events
  STREAM_START: 'stream:start',
  STREAM_CHUNK: 'stream:chunk',
  STREAM_END: 'stream:end',
  
  // Custom events
  CUSTOM: 'custom'
};

/**
 * EventBus - Central event bus with filtering and streaming
 */
class EventBus extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      maxHistory: options.maxHistory || 1000,
      enableLogging: options.enableLogging || false,
      filterBeforeEmit: options.filterBeforeEmit || null,
      ...options
    };

    // Event history for replay and debugging
    this.history = [];
    
    // Active streams
    this.streams = new Map();
    
    // Subscriptions for cleanup
    this.subscriptions = [];
    
    // Event statistics
    this.stats = {
      totalEmitted: 0,
      totalHandled: 0,
      byType: {}
    };
  }

  /**
   * Emit event with history tracking
   */
  emit(event, data) {
    // Filter check
    if (this.options.filterBeforeEmit) {
      if (!this.options.filterBeforeEmit(event, data)) {
        return { filtered: true };
      }
    }

    // Log if enabled
    if (this.options.enableLogging) {
      console.log(`[EventBus] ${event}:`, data);
    }

    // Store in history
    this.addToHistory(event, data);

    // Update stats
    this.stats.totalEmitted++;
    this.stats.byType[event] = (this.stats.byType[event] || 0) + 1;

    // Call parent emit
    const result = super.emit(event, data);
    
    this.stats.totalHandled += result.handled;

    return result;
  }

  /**
   * Add event to history
   */
  addToHistory(event, data) {
    this.history.push({
      event,
      data,
      timestamp: Date.now()
    });

    // Trim history
    if (this.history.length > this.options.maxHistory) {
      this.history = this.history.slice(-this.options.maxHistory);
    }
  }

  /**
   * Subscribe with automatic cleanup tracking
   */
  subscribe(event, listener, options) {
    const unsubscribe = this.on(event, listener, options);
    this.subscriptions.push(unsubscribe);
    return unsubscribe;
  }

  /**
   * Batch subscribe to multiple events
   */
  subscribeMany(events, listener, options = {}) {
    const unsubscribes = events.map(event => this.on(event, listener, options));
    
    const unsubscribeAll = () => {
      unsubscribes.forEach(fn => fn());
    };

    this.subscriptions.push(unsubscribeAll);
    return unsubscribeAll;
  }

  /**
   * Unsubscribe all tracked subscriptions
   */
  unsubscribeAll() {
    this.subscriptions.forEach(fn => fn());
    this.subscriptions = [];
  }

  /**
   * Create a reactive stream from events
   */
  createStream(eventFilter, options = {}) {
    const streamId = `stream-${Date.now()}-${Math.random()}`;
    
    const stream = {
      id: streamId,
      eventFilter,
      paused: false,
      buffer: [],
      listeners: new Set(),
      
      // Add listener to stream
      subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      },
      
      // Push data to stream
      push(data) {
        if (!this.paused) {
          this.listeners.forEach(listener => {
            try {
              listener(data);
            } catch (error) {
              console.error('Stream listener error:', error);
            }
          });
        } else {
          // Buffer if paused
          if (options.bufferWhenPaused !== false) {
            this.buffer.push(data);
            if (options.maxBufferSize && this.buffer.length > options.maxBufferSize) {
              this.buffer.shift();
            }
          }
        }
      },
      
      // Pause stream
      pause() {
        this.paused = true;
      },
      
      // Resume stream and flush buffer
      resume() {
        this.paused = false;
        const buffered = [...this.buffer];
        this.buffer = [];
        
        buffered.forEach(data => {
          this.listeners.forEach(listener => listener(data));
        });
      },
      
      // Close stream
      close() {
        this.listeners.clear();
        this.buffer = [];
        eventBus.streams.delete(streamId);
      }
    };

    this.streams.set(streamId, stream);

    // Subscribe to matching events
    const unsubscribe = this.on(CustomEventTypes.ANY, (event, data) => {
      if (eventFilter(event, data)) {
        stream.push(data);
      }
    }, { id: streamId });

    stream._unsubscribe = unsubscribe;

    return stream;
  }

  /**
   * Get event history with optional filtering
   */
  getHistory(options = {}) {
    let events = [...this.history];

    if (options.event) {
      events = events.filter(e => e.event === options.event);
    }

    if (options.since) {
      events = events.filter(e => e.timestamp >= options.since);
    }

    if (options.until) {
      events = events.filter(e => e.timestamp <= options.until);
    }

    if (options.limit) {
      events = events.slice(-options.limit);
    }

    return events;
  }

  /**
   * Replay events from history
   */
  replay(events, listener) {
    events.forEach(({ event, data, timestamp }) => {
      try {
        listener(event, data, timestamp);
      } catch (error) {
        console.error('Replay error:', error);
      }
    });
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeStreams: this.streams.size,
      subscriptionCount: this.subscriptions.length,
      historySize: this.history.length,
      eventTypes: Object.keys(this.stats.byType).length
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalEmitted: 0,
      totalHandled: 0,
      byType: {}
    };
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.history = [];
  }
}

/**
 * Custom event types for flexible event naming
 */
const CustomEventTypes = {
  ANY: '*:any'
};

/**
 * Helper to create typed events
 */
export function createEvent(type, payload, metadata = {}) {
  return {
    type,
    payload,
    metadata: {
      timestamp: Date.now(),
      ...metadata
    }
  };
}

/**
 * Helper to create agent events
 */
export function createAgentEvent(action, agentId, data = {}) {
  return createEvent(`agent:${action}`, {
    agentId,
    ...data
  });
}

/**
 * Helper to create task events
 */
export function createTaskEvent(action, taskId, data = {}) {
  return createEvent(`task:${action}`, {
    taskId,
    ...data
  });
}

/**
 * Event filter factory
 */
export function eventFilter(options = {}) {
  return {
    event: options.event,
    eventPattern: options.eventPattern ? new RegExp(options.eventPattern) : null,
    dataFilter: options.dataFilter || null,
    timeRange: options.timeRange,
    
    matches(event, data) {
      if (this.event && event !== this.event) return false;
      if (this.eventPattern && !this.eventPattern.test(event)) return false;
      if (this.dataFilter && !this.dataFilter(data)) return false;
      if (this.timeRange) {
        const now = Date.now();
        if (this.timeRange.since && now - data.timestamp < this.timeRange.since) return false;
        if (this.timeRange.until && now - data.timestamp > this.timeRange.until) return false;
      }
      return true;
    }
  };
}

// Export singleton
export const eventBus = new EventBus();

export default EventBus;