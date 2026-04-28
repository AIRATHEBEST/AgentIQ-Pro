/**
 * EventBus Throttling + React Binding
 * Prevents React re-render storms during high-frequency agent execution
 */

export class EventThrottler {
  constructor(options = {}) {
    this.events = {};
    this.timeouts = {};
    this.limits = options.limits || {};
    this.windowMs = options.windowMs || 1000;
  }

  throttle(eventType, callback, limit = 10) {
    if (!this.events[eventType]) {
      this.events[eventType] = [];
      this.timeouts[eventType] = null;
    }

    this.events[eventType].push(callback);

    if (!this.timeouts[eventType]) {
      const flush = () => {
        const callbacks = this.events[eventType];
        this.events[eventType] = [];
        this.timeouts[eventType] = null;
        callbacks.forEach(cb => cb());
      };

      this.timeouts[eventType] = setTimeout(flush, this.windowMs);
    }
  }

  clear(eventType) {
    if (eventType) {
      delete this.events[eventType];
      if (this.timeouts[eventType]) {
        clearTimeout(this.timeouts[eventType]);
        delete this.timeouts[eventType];
      }
    } else {
      Object.values(this.timeouts).forEach(t => clearTimeout(t));
      this.events = {};
      this.timeouts = {};
    }
  }
}

export class ThrottledEventBus {
  constructor(eventBus, options = {}) {
    this.eventBus = eventBus;
    this.throttler = new EventThrottler(options);
    this.listeners = new Map();
    this.debounceTimers = new Map();
    this.batchDuration = options.batchDuration || 50;
  }

  on(eventType, callback, options = {}) {
    const { throttle = true, debounceMs = 0 } = options;
    
    if (throttle && !options.raw) {
      const throttledCallback = (...args) => {
        if (debounceMs > 0) {
          this._debounce(eventType, callback, debounceMs, ...args);
        } else {
          callback(...args);
        }
      };
      
      this.throttler.throttle(eventType, throttledCallback, options.limit || 10);
      
      if (!this.listeners.has(eventType)) {
        this.listeners.set(eventType, []);
      }
      this.listeners.get(eventType).push(callback);
      
      return this.eventBus.on(eventType, throttledCallback, { raw: true });
    }
    
    return this.eventBus.on(eventType, callback, options);
  }

  _debounce(eventType, callback, ms, ...args) {
    const key = `${eventType}:${callback}`;
    
    if (this.debounceTimers.has(key)) {
      clearTimeout(this.debounceTimers.get(key));
    }
    
    const timer = setTimeout(() => {
      callback(...args);
      this.debounceTimers.delete(key);
    }, ms);
    
    this.debounceTimers.set(key, timer);
  }

  emit(eventType, data, options = {}) {
    const { batch = false, priority = 'normal' } = options;
    
    if (batch) {
      return this._batchEmit(eventType, data);
    }
    
    return this.eventBus.emit(eventType, data, { priority });
  }

  _batchEmit(eventType, data) {
    if (!this.batchedEvents) {
      this.batchedEvents = new Map();
    }
    
    if (!this.batchedEvents.has(eventType)) {
      this.batchedEvents.set(eventType, []);
    }
    
    this.batchedEvents.get(eventType).push(data);
    
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this._flushBatch();
      }, this.batchDuration);
    }
  }

  _flushBatch() {
    if (this.batchedEvents) {
      this.batchedEvents.forEach((events, eventType) => {
        if (events.length > 0) {
          this.eventBus.emit(eventType, {
            events,
            count: events.length,
            timestamp: Date.now()
          });
        }
      });
      this.batchedEvents.clear();
    }
    this.batchTimer = null;
  }

  off(eventType, callback) {
    this.throttler.clear(eventType);
    if (this.debounceTimers) {
      const prefix = `${eventType}:`;
      for (const [key, timer] of this.debounceTimers) {
        if (key.startsWith(prefix)) {
          clearTimeout(timer);
          this.debounceTimers.delete(key);
        }
      }
    }
    return this.eventBus.off(eventType, callback);
  }

  clear() {
    this.throttler.clear();
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    this.batchedEvents?.clear();
  }
}

// React Hook for EventBus subscription with automatic cleanup
export function useEventBus(eventBus, options = {}) {
  const { 
    throttleMs = 100, 
    debounceMs = 0, 
    batch = false,
    onEvent 
  } = options;

  const callbacksRef = useRef(new Map());
  const stableCallbackRef = useRef(onEvent);
  
  useEffect(() => {
    stableCallbackRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!eventBus) return;

    const throttledBus = new ThrottledEventBus(eventBus, {
      windowMs: throttleMs,
      batchDuration: batch ? throttleMs : undefined
    });

    const callbacks = callbacksRef.current;
    callbacks.forEach((unsubscribe, eventType) => {
      unsubscribe();
    });
    callbacks.clear();

    for (const [eventType, handler] of callbacks) {
      const unsub = throttledBus.on(eventType, handler, {
        throttle: throttleMs > 0,
        debounceMs,
        batch
      });
      callbacks.set(eventType, unsub);
    }

    return () => {
      callbacks.forEach(unsub => unsub());
      callbacks.clear();
      throttledBus.clear();
    };
  }, [eventBus, throttleMs, debounceMs, batch]);

  const subscribe = useCallback((eventType, handler) => {
    if (!eventBus) return () => {};
    
    const throttledBus = new ThrottledEventBus(eventBus, {
      windowMs: throttleMs,
      batchDuration: batch ? throttleMs : undefined
    });

    const unsub = throttledBus.on(eventType, handler, {
      throttle: throttleMs > 0,
      debounceMs,
      batch
    });

    callbacksRef.current.set(eventType, unsub);

    return () => {
      unsub();
      callbacksRef.current.delete(eventType);
      throttledBus.clear();
    };
  }, [eventBus, throttleMs, debounceMs, batch]);

  const emit = useCallback((eventType, data) => {
    if (eventBus) {
      eventBus.emit(eventType, data);
    }
  }, [eventBus]);

  return { subscribe, emit };
}

// Batch hook for collecting multiple events
export function useEventBatcher(eventBus, eventTypes, options = {}) {
  const { flushMs = 200 } = options;
  const bufferRef = useRef(new Map());
  const flushTimerRef = useRef(null);
  const listenersRef = useRef([]);

  useEffect(() => {
    if (!eventBus || !eventTypes.length) return;

    const handleEvent = (eventType) => (data) => {
      if (!bufferRef.current.has(eventType)) {
        bufferRef.current.set(eventType, []);
      }
      bufferRef.current.get(eventType).push(data);
    };

    eventTypes.forEach(type => {
      const unsub = eventBus.on(type, handleEvent(type));
      listenersRef.current.push(unsub);
    });

    const scheduleFlush = () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
      }
      flushTimerRef.current = setTimeout(flush, flushMs);
    };

    scheduleFlush();

    return () => {
      listenersRef.current.forEach(unsub => unsub());
      listenersRef.current = [];
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
      }
    };
  }, [eventBus, eventTypes.join(','), flushMs]);

  const flush = useCallback(() => {
    const batch = new Map(bufferRef.current);
    bufferRef.current.clear();
    return batch;
  }, []);

  return { flush };
}

// React context for global EventBus
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

const EventBusContext = createContext(null);

export function EventBusProvider({ eventBus, children, throttleMs = 100 }) {
  const [throttledBus] = useState(() => {
    return eventBus ? new ThrottledEventBus(eventBus, { windowMs: throttleMs }) : null;
  });

  return (
    <EventBusContext.Provider value={throttledBus || eventBus}>
      {children}
    </EventBusContext.Provider>
  );
}

export function useThrottledEventBus() {
  const bus = useContext(EventBusContext);
  const throttlerRef = useRef(new EventThrottler({ windowMs: 100 }));

  const emit = useCallback((eventType, data, options = {}) => {
    if (!bus) return;
    
    throttlerRef.current.throttle(eventType, () => {
      bus.emit(eventType, data, options);
    });
  }, [bus]);

  return { emit, bus };
}

export function wrapEventBusWithThrottle(eventBus, options = {}) {
  return new ThrottledEventBus(eventBus, options);
}

export default {
  EventThrottler,
  ThrottledEventBus,
  useEventBus,
  useEventBatcher,
  EventBusProvider,
  useThrottledEventBus,
  wrapEventBusWithThrottle
};