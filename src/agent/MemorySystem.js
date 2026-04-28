// Phase 1: Persistent Memory System
// Provides long-term memory, semantic retrieval, and context management

class MemorySystem {
  constructor() {
    this.shortTerm = []; // Current session context
    this.longTerm = [];  // Persistent memory entries
    this.preferences = {}; // User preferences
    this.projects = {};   // Project-specific memory
    this.maxShortTerm = 50; // Keep last 50 messages
    this.storageKey = 'ollama_hub_memory';
    this.loadFromStorage();
  }

  // Load from localStorage for persistence
  loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        this.longTerm = data.longTerm || [];
        this.preferences = data.preferences || {};
        this.projects = data.projects || {};
      }
    } catch (e) {
      console.error('Failed to load memory:', e);
    }
  }

  // Save to localStorage
  saveToStorage() {
    try {
      const data = {
        longTerm: this.longTerm,
        preferences: this.preferences,
        projects: this.projects,
        lastUpdated: Date.now()
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save memory:', e);
    }
  }

  // Add to short-term memory (current session)
  addToShortTerm(entry) {
    this.shortTerm.push({
      ...entry,
      timestamp: Date.now(),
      id: crypto.randomUUID()
    });
    
    // Keep only recent entries
    if (this.shortTerm.length > this.maxShortTerm) {
      this.shortTerm.shift();
    }
  }

  // Add important information to long-term memory
  addToLongTerm(content, type = 'general', metadata = {}) {
    const entry = {
      id: crypto.randomUUID(),
      content,
      type, // 'fact', 'preference', 'task', 'project', 'learned'
      metadata,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccessed: Date.now()
    };
    
    this.longTerm.push(entry);
    
    // Limit long-term memory to 500 entries
    if (this.longTerm.length > 500) {
      this.removeOldestMemories();
    }
    
    this.saveToStorage();
    return entry;
  }

  // Semantic-like search (simple keyword matching for now)
  search(query, type = null, limit = 10) {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);
    
    let results = this.longTerm.filter(entry => {
      if (type && entry.type !== type) return false;
      
      const contentLower = entry.content.toLowerCase();
      return queryWords.some(word => contentLower.includes(word));
    });
    
    // Score by relevance and recency
    results = results.map(entry => ({
      ...entry,
      relevanceScore: this.calculateRelevance(entry, queryWords),
      accessCount: entry.accessCount,
      recency: Date.now() - entry.lastAccessed
    }));
    
    // Sort by relevance and recency
    results.sort((a, b) => {
      const scoreA = a.relevanceScore * 0.7 + (1 / (a.recency + 1)) * 0.3;
      const scoreB = b.relevanceScore * 0.7 + (1 / (b.recency + 1)) * 0.3;
      return scoreB - scoreA;
    });
    
    // Update access counts
    results.slice(0, limit).forEach(entry => {
      entry.accessCount++;
      entry.lastAccessed = Date.now();
    });
    
    this.saveToStorage();
    return results.slice(0, limit);
  }

  // Calculate keyword relevance
  calculateRelevance(entry, queryWords) {
    const contentLower = entry.content.toLowerCase();
    let score = 0;
    
    queryWords.forEach(word => {
      if (contentLower.includes(word)) score += 1;
      if (contentLower.startsWith(word)) score += 2; // Bonus for word at start
    });
    
    return score;
  }

  // Remove oldest/least accessed memories
  removeOldestMemories() {
    // Sort by (lastAccessed * accessCount) to remove least important
    this.longTerm.sort((a, b) => {
      const priorityA = a.lastAccessed * (1 / (a.accessCount + 1));
      const priorityB = b.lastAccessed * (1 / (b.accessCount + 1));
      return priorityA - priorityB;
    });
    
    // Remove oldest 50 entries
    this.longTerm = this.longTerm.slice(50);
  }

  // Store user preference
  setPreference(key, value) {
    this.preferences[key] = {
      value,
      timestamp: Date.now()
    };
    this.saveToStorage();
  }

  // Get user preference
  getPreference(key, defaultValue = null) {
    return this.preferences[key]?.value ?? defaultValue;
  }

  // Project memory management
  setProjectMemory(projectId, key, value) {
    if (!this.projects[projectId]) {
      this.projects[projectId] = { created: Date.now(), entries: {} };
    }
    this.projects[projectId].entries[key] = {
      value,
      timestamp: Date.now()
    };
    this.saveToStorage();
  }

  getProjectMemory(projectId, key = null) {
    if (!this.projects[projectId]) return null;
    if (key) {
      return this.projects[projectId].entries[key]?.value ?? null;
    }
    return this.projects[projectId];
  }

  // Build context for AI
  buildContext(currentQuery = '') {
    const context = {
      shortTerm: this.shortTerm.slice(-10), // Last 10 exchanges
      relevantMemories: currentQuery ? this.search(currentQuery, null, 5) : [],
      preferences: this.preferences,
      timestamp: Date.now()
    };
    return context;
  }

  // Summarize and consolidate memories (called periodically)
  consolidate() {
    // Find related memories and merge summaries
    const facts = this.longTerm.filter(m => m.type === 'fact');
    const grouped = {};
    
    facts.forEach(fact => {
      const key = fact.content.substring(0, 50);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(fact);
    });
    
    // Merge related memories into summaries
    Object.values(grouped).forEach(group => {
      if (group.length > 3) {
        // Keep most recent, mark as summary
        group[0].content = `[Summary of ${group.length} related memories] ${group[0].content}`;
        group.slice(1).forEach(m => {
          const idx = this.longTerm.indexOf(m);
          if (idx > -1) this.longTerm.splice(idx, 1);
        });
      }
    });
    
    this.saveToStorage();
  }

  // Clear all memories
  clearAll() {
    this.shortTerm = [];
    this.longTerm = [];
    this.preferences = {};
    this.projects = {};
    localStorage.removeItem(this.storageKey);
  }

  // Export memories
  export() {
    return {
      longTerm: this.longTerm,
      preferences: this.preferences,
      projects: this.projects,
      exportedAt: Date.now()
    };
  }

  // Import memories
  import(data) {
    if (data.longTerm) this.longTerm = data.longTerm;
    if (data.preferences) this.preferences = data.preferences;
    if (data.projects) this.projects = data.projects;
    this.saveToStorage();
  }
}

export const memorySystem = new MemorySystem();
export default MemorySystem;