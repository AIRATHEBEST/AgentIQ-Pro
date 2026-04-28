/**
 * Checkpoint/Restore Manager for TaskGraph + MemorySystem
 * Persists state to IndexedDB for crash recovery and browser refresh survival
 */

class CheckpointManager {
  constructor(options = {}) {
    this.dbName = options.dbName || 'AgentCheckpointDB';
    this.storeName = options.storeName || 'checkpoints';
    this.version = options.version || 1;
    this.db = null;
    this.autoSaveInterval = options.autoSaveInterval || 30000; // 30 seconds
    this.maxCheckpoints = options.maxCheckpoints || 50;
    this.autoSaveTimer = null;
    this.lastCheckpoint = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('component', 'component', { unique: false });
        }
      };
    });
  }

  async save(component, data, metadata = {}) {
    if (!this.db) await this.init();
    
    const checkpoint = {
      component,
      data: this.serializeData(data),
      timestamp: Date.now(),
      metadata,
      version: this.version
    };
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.add(checkpoint);
      
      request.onsuccess = () => {
        this.lastCheckpoint = checkpoint;
        this.enforceMaxCheckpoints();
        resolve(request.result);
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  serializeData(data) {
    // Handle special types like functions, symbols
    const seen = new WeakSet();
    
    const serialize = (obj) => {
      if (obj === null || obj === undefined) return obj;
      if (typeof obj === 'function') return `[Function: ${obj.name || 'anonymous'}]`;
      if (typeof obj === 'symbol') return `[Symbol]`;
      if (seen.has(obj)) return '[Circular]';
      if (Array.isArray(obj)) {
        seen.add(obj);
        return obj.map(serialize);
      }
      if (typeof obj === 'object') {
        seen.add(obj);
        const result = {};
        for (const key of Object.keys(obj)) {
          result[key] = serialize(obj[key]);
        }
        return result;
      }
      return obj;
    };
    
    return serialize(data);
  }

  async restore(component, options = {}) {
    if (!this.db) await this.init();
    
    const { latest = true, timestamp = null } = options;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('component');
      const request = index.getAll(component);
      
      request.onsuccess = () => {
        const checkpoints = request.result.sort((a, b) => b.timestamp - a.timestamp);
        
        if (checkpoints.length === 0) {
          resolve(null);
          return;
        }
        
        if (latest) {
          resolve(checkpoints[0]);
        } else if (timestamp) {
          const found = checkpoints.find(c => c.timestamp <= timestamp);
          resolve(found || checkpoints[0]);
        } else {
          resolve(checkpoints[0]);
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  async restoreLatest(component) {
    return this.restore(component, { latest: true });
  }

  async restoreAtTime(component, timestamp) {
    return this.restore(component, { latest: false, timestamp });
  }

  async getHistory(component, limit = 10) {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('component');
      const request = index.getAll(component);
      
      request.onsuccess = () => {
        const checkpoints = request.result
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, limit);
        resolve(checkpoints);
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  async delete(id) {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);
      
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async clear(component = null) {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      if (component) {
        const index = store.index('component');
        const request = index.getAllKeys(component);
        request.onsuccess = () => {
          request.result.forEach(key => store.delete(key));
          resolve(true);
        };
        request.onerror = () => reject(request.error);
      } else {
        const request = store.clear();
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      }
    });
  }

  async enforceMaxCheckpoints() {
    const transaction = this.db.transaction([this.storeName], 'readonly');
    const store = transaction.objectStore(this.storeName);
    const index = store.index('timestamp');
    const countRequest = index.count();
    
    countRequest.onsuccess = () => {
      if (countRequest.result > this.maxCheckpoints) {
        const deleteTransaction = this.db.transaction([this.storeName], 'readwrite');
        const deleteStore = deleteTransaction.objectStore(this.storeName);
        const cursorRequest = deleteStore.openCursor();
        
        let deleteCount = 0;
        const toDelete = countRequest.result - this.maxCheckpoints;
        
        cursorRequest.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor && deleteCount < toDelete) {
            cursor.delete();
            deleteCount++;
            cursor.continue();
          }
        };
      }
    };
  }

  startAutoSave(taskGraph, memorySystem, interval = null) {
    this.stopAutoSave();
    this.autoSaveInterval = interval || this.autoSaveInterval;
    
    this.autoSaveTimer = setInterval(async () => {
      try {
        if (taskGraph) {
          await this.save('TaskGraph', taskGraph.getState());
        }
        if (memorySystem) {
          await this.save('MemorySystem', memorySystem.getState());
        }
      } catch (error) {
        console.error('Auto-save checkpoint failed:', error);
      }
    }, this.autoSaveInterval);
  }

  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  getLastCheckpoint() {
    return this.lastCheckpoint;
  }

  async getStats() {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const countRequest = store.count();
      
      countRequest.onsuccess = () => {
        const components = ['TaskGraph', 'MemorySystem'];
        const stats = { total: countRequest.result, byComponent: {} };
        
        let completed = 0;
        components.forEach(comp => {
          const index = store.index('component');
          const req = index.count(comp);
          req.onsuccess = () => {
            stats.byComponent[comp] = req.result;
            completed++;
            if (completed === components.length) {
              resolve(stats);
            }
          };
        });
        
        if (components.length === 0) resolve(stats);
      };
      
      countRequest.onerror = () => reject(countRequest.error);
    });
  }

  async close() {
    this.stopAutoSave();
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// TaskGraph with Checkpoint Support
class CheckpointableTaskGraph {
  constructor(taskGraph, checkpointManager) {
    this.taskGraph = taskGraph;
    this.checkpointManager = checkpointManager;
    this.lastCheckpointTime = null;
  }

  async executeLevel(level) {
    const result = await this.taskGraph.executeLevel(level);
    await this.checkpoint('LevelExecution');
    return result;
  }

  async addTask(task) {
    const result = this.taskGraph.addTask(task);
    await this.checkpoint('TaskAdded');
    return result;
  }

  async checkpoint(reason = 'manual') {
    const state = this.taskGraph.getState();
    state._checkpointReason = reason;
    state._checkpointTime = Date.now();
    
    await this.checkpointManager.save('TaskGraph', state, { reason });
    this.lastCheckpointTime = state._checkpointTime;
  }

  async restore() {
    const checkpoint = await this.checkpointManager.restoreLatest('TaskGraph');
    if (checkpoint) {
      this.taskGraph.restoreState(checkpoint.data);
      return true;
    }
    return false;
  }

  async restoreToTime(timestamp) {
    const checkpoint = await this.checkpointManager.restoreAtTime('TaskGraph', timestamp);
    if (checkpoint) {
      this.taskGraph.restoreState(checkpoint.data);
      return true;
    }
    return false;
  }
}

// MemorySystem with Checkpoint Support
class CheckpointableMemorySystem {
  constructor(memorySystem, checkpointManager) {
    this.memorySystem = memorySystem;
    this.checkpointManager = checkpointManager;
    this.autoCheckpoint = true;
    this.checkpointOnChanges = ['addToShortTerm', 'addToLongTerm', 'addPreference'];
  }

  wrapMethod(methodName) {
    const original = this.memorySystem[methodName];
    const self = this;
    
    this.memorySystem[methodName] = async function(...args) {
      const result = await original.apply(this, args);
      if (self.autoCheckpoint && self.checkpointOnChanges.includes(methodName)) {
        await self.checkpoint(methodName);
      }
      return result;
    };
  }

  async checkpoint(reason = 'memory_change') {
    const state = this.memorySystem.getState();
    state._checkpointReason = reason;
    state._checkpointTime = Date.now();
    
    await this.checkpointManager.save('MemorySystem', state, { reason });
  }

  async restore() {
    const checkpoint = await this.checkpointManager.restoreLatest('MemorySystem');
    if (checkpoint) {
      this.memorySystem.restoreState(checkpoint.data);
      return true;
    }
    return false;
  }

  getStats() {
    return this.checkpointManager.getStats();
  }
}

// Factory functions
let checkpointManagerInstance = null;

async function getCheckpointManager(options) {
  if (!checkpointManagerInstance) {
    checkpointManagerInstance = new CheckpointManager(options);
    await checkpointManagerInstance.init();
  }
  return checkpointManagerInstance;
}

function wrapTaskGraphWithCheckpoint(taskGraph, checkpointManager) {
  return new CheckpointableTaskGraph(taskGraph, checkpointManager);
}

function wrapMemorySystemWithCheckpoint(memorySystem, checkpointManager) {
  const wrapper = new CheckpointableMemorySystem(memorySystem, checkpointManager);
  
  // Wrap mutation methods
  wrapper.wrapMethod('addToShortTerm');
  wrapper.wrapMethod('addToLongTerm');
  wrapper.wrapMethod('addPreference');
  wrapper.wrapMethod('clearShortTerm');
  wrapper.wrapMethod('clearLongTerm');
  
  return wrapper;
}

export { 
  CheckpointManager, 
  CheckpointableTaskGraph, 
  CheckpointableMemorySystem,
  getCheckpointManager,
  wrapTaskGraphWithCheckpoint,
  wrapMemorySystemWithCheckpoint
};
export default CheckpointManager;