/**
 * Vector Database Long-Term Memory for AgentIQ Pro
 * Semantic retrieval, project/user/execution/tool memory with vector embeddings
 */

class MemoryEntry {
  constructor(id, type, content, metadata = {}) {
    this.id = id;
    this.type = type;
    this.content = content;
    this.metadata = metadata;
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    this.accessCount = 0;
    this.lastAccessed = null;
    this.embedding = null;
    this.importance = 0.5;
    this.tags = [];
    this.relatedMemories = [];
  }

  getAge() {
    return Date.now() - new Date(this.createdAt).getTime();
  }

  recordAccess() {
    this.accessCount++;
    this.lastAccessed = new Date().toISOString();
  }

  updateImportance(delta) {
    this.importance = Math.max(0, Math.min(1, this.importance + delta));
  }
}

class MemoryCluster {
  constructor(id, label, memories = []) {
    this.id = id;
    this.label = label;
    this.memories = memories;
    this.centroid = null;
    this.createdAt = new Date().toISOString();
  }

  addMemory(memory) {
    if (!this.memories.find(m => m.id === memory.id)) {
      this.memories.push(memory);
      this.updateCentroid();
    }
  }

  removeMemory(memoryId) {
    this.memories = this.memories.filter(m => m.id !== memoryId);
    this.updateCentroid();
  }

  updateCentroid() {
    if (this.memories.length === 0) {
      this.centroid = null;
      return;
    }
    
    const avgImportance = this.memories.reduce((sum, m) => sum + m.importance, 0) / this.memories.length;
    this.centroid = {
      importance: avgImportance,
      tagCounts: this.getTagCounts(),
    };
  }

  getTagCounts() {
    const counts = {};
    for (const memory of this.memories) {
      for (const tag of memory.tags) {
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }
    return counts;
  }
}

class VectorMemory {
  constructor() {
    this.memories = new Map();
    this.clusters = new Map();
    this.index = new Map();
    this.vectorCache = new Map();
    this.settings = {
      maxMemories: 10000,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
      similarityThreshold: 0.7,
      vectorDimensions: 384,
      autoCluster: true,
      decayRate: 0.01,
    };
    this.eventListeners = new Map();
    this.stats = {
      totalMemories: 0,
      totalRetrievals: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
    this.initBuiltInClusters();
  }

  initBuiltInClusters() {
    this.createCluster('project', 'Project Context');
    this.createCluster('user', 'User Preferences');
    this.createCluster('execution', 'Execution History');
    this.createCluster('tool', 'Tool Usage Patterns');
    this.createCluster('knowledge', 'General Knowledge');
    this.createCluster('goal', 'Goals & Objectives');
    this.createCluster('success', 'Successful Actions');
    this.createCluster('failure', 'Failure Patterns');
  }

  // Event handling
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) listeners.splice(index, 1);
    }
  }

  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(cb => cb(data));
    }
  }

  // Memory operations
  addMemory(type, content, metadata = {}) {
    const id = this.generateId(type);
    const memory = new MemoryEntry(id, type, content, metadata);
    
    this.memories.set(id, memory);
    this.stats.totalMemories++;
    
    // Auto-cluster if enabled
    if (this.settings.autoCluster) {
      this.assignToCluster(memory);
    }
    
    // Update index
    this.updateIndex(memory);
    
    // Check memory limit
    this.enforceMemoryLimit();
    
    this.emit('memoryAdded', memory);
    return memory;
  }

  generateId(type) {
    const prefix = type.substring(0, 3).toLowerCase();
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${random}`;
  }

  getMemory(id) {
    const memory = this.memories.get(id);
    if (memory) {
      memory.recordAccess();
      this.emit('memoryAccessed', memory);
    }
    return memory;
  }

  updateMemory(id, updates) {
    const memory = this.memories.get(id);
    if (!memory) return null;

    memory.content = updates.content || memory.content;
    memory.metadata = { ...memory.metadata, ...updates.metadata };
    memory.tags = updates.tags || memory.tags;
    memory.importance = updates.importance ?? memory.importance;
    memory.updatedAt = new Date().toISOString();
    memory.relatedMemories = updates.relatedMemories || memory.relatedMemories;

    this.updateIndex(memory);
    this.emit('memoryUpdated', memory);
    return memory;
  }

  deleteMemory(id) {
    const memory = this.memories.get(id);
    if (memory) {
      this.removeFromCluster(id);
      this.removeFromIndex(id);
      this.memories.delete(id);
      this.emit('memoryDeleted', { id, type: memory.type });
      return true;
    }
    return false;
  }

  // Vector embedding (simplified implementation)
  async embedText(text) {
    // Check cache first
    const cacheKey = this.hashText(text);
    if (this.vectorCache.has(cacheKey)) {
      this.stats.cacheHits++;
      return this.vectorCache.get(cacheKey);
    }
    
    this.stats.cacheMisses++;
    
    // Simplified embedding: generate deterministic vector based on text
    const vector = this.generateTextVector(text);
    this.vectorCache.set(cacheKey, vector);
    
    return vector;
  }

  hashText(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  generateTextVector(text) {
    const dimensions = this.settings.vectorDimensions;
    const vector = new Array(dimensions).fill(0);
    const words = text.toLowerCase().split(/\s+/);
    
    // Generate deterministic vector based on word hashes
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      for (let j = 0; j < Math.min(word.length, dimensions); j++) {
        const charCode = word.charCodeAt(j);
        const position = (i + j) % dimensions;
        vector[position] += (charCode / 255) * (1 / (i + 1));
      }
    }
    
    // Normalize
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < dimensions; i++) {
        vector[i] /= magnitude;
      }
    }
    
    return vector;
  }

  // Similarity calculations
  cosineSimilarity(vec1, vec2) {
    if (vec1.length !== vec2.length) return 0;
    
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      magnitude1 += vec1[i] * vec1[i];
      magnitude2 += vec2[i] * vec2[i];
    }
    
    const mag1 = Math.sqrt(magnitude1);
    const mag2 = Math.sqrt(magnitude2);
    
    if (mag1 === 0 || mag2 === 0) return 0;
    return dotProduct / (mag1 * mag2);
  }

  // Semantic retrieval
  async retrieve(query, options = {}) {
    const {
      type = null,
      limit = 10,
      minSimilarity = 0.3,
      timeRange = null,
      tags = [],
    } = options;

    const startTime = performance.now();
    
    // Generate query embedding
    const queryEmbedding = await this.embedText(query);
    
    // Get candidate memories
    let candidates = Array.from(this.memories.values());
    
    // Apply filters
    if (type) {
      candidates = candidates.filter(m => m.type === type);
    }
    
    if (timeRange) {
      const cutoff = Date.now() - timeRange;
      candidates = candidates.filter(m => 
        new Date(m.createdAt).getTime() >= cutoff
      );
    }
    
    if (tags.length > 0) {
      candidates = candidates.filter(m => 
        tags.some(tag => m.tags.includes(tag))
      );
    }
    
    // Calculate similarities
    const scored = [];
    for (const memory of candidates) {
      const embedding = await this.getMemoryEmbedding(memory);
      const similarity = this.cosineSimilarity(queryEmbedding, embedding);
      
      if (similarity >= minSimilarity) {
        // Boost score based on importance and recency
        const recencyBoost = this.calculateRecencyBoost(memory);
        const finalScore = similarity * (0.5 + memory.importance * 0.5) * recencyBoost;
        
        scored.push({
          memory,
          similarity,
          score: finalScore,
        });
      }
    }
    
    // Sort by score
    scored.sort((a, b) => b.score - a.score);
    
    const results = scored.slice(0, limit).map(r => ({
      ...r.memory,
      relevanceScore: r.similarity,
      boostFactors: {
        importance: memory.importance,
        recency: this.calculateRecencyBoost(r.memory),
      },
    }));
    
    this.stats.totalRetrievals++;
    this.emit('retrievalComplete', {
      query,
      results: results.length,
      duration: performance.now() - startTime,
    });
    
    return results;
  }

  async getMemoryEmbedding(memory) {
    if (memory.embedding) {
      return memory.embedding;
    }
    
    const fullContent = memory.content + ' ' + 
      (memory.tags.join(' ')) + ' ' + 
      JSON.stringify(memory.metadata);
    
    const embedding = await this.embedText(fullContent);
    memory.embedding = embedding;
    
    return embedding;
  }

  calculateRecencyBoost(memory) {
    const age = memory.getAge();
    const dayInMs = 24 * 60 * 60 * 1000;
    
    // Exponential decay based on age
    let boost = 1;
    if (age < dayInMs) boost = 1.2;
    else if (age < 7 * dayInMs) boost = 1.0;
    else if (age < 30 * dayInMs) boost = 0.8;
    else boost = 0.5;
    
    // Boost for recently accessed
    if (memory.lastAccessed) {
      const lastAccessAge = Date.now() - new Date(memory.lastAccessed).getTime();
      if (lastAccessAge < dayInMs) boost *= 1.2;
      else if (lastAccessAge < 7 * dayInMs) boost *= 1.1;
    }
    
    // Boost for high access count
    boost *= (1 + Math.log10(memory.accessCount + 1) * 0.1);
    
    return boost;
  }

  // Index management
  updateIndex(memory) {
    const words = memory.content.toLowerCase().split(/\s+/);
    
    for (const word of words) {
      if (word.length > 2) {
        if (!this.index.has(word)) {
          this.index.set(word, new Set());
        }
        this.index.get(word).add(memory.id);
      }
    }
  }

  removeFromIndex(id) {
    for (const [word, ids] of this.index.entries()) {
      ids.delete(id);
      if (ids.size === 0) {
        this.index.delete(word);
      }
    }
  }

  // Cluster management
  createCluster(id, label) {
    const cluster = new MemoryCluster(id, label);
    this.clusters.set(id, cluster);
    return cluster;
  }

  assignToCluster(memory) {
    const clusterId = this.getClusterForMemory(memory);
    const cluster = this.clusters.get(clusterId);
    
    if (cluster) {
      cluster.addMemory(memory);
    }
  }

  removeFromCluster(memoryId) {
    for (const cluster of this.clusters.values()) {
      cluster.removeMemory(memoryId);
    }
  }

  getClusterForMemory(memory) {
    // Assign based on type
    const typeMapping = {
      project: 'project',
      user: 'user',
      execution: 'execution',
      tool: 'tool',
      code: 'knowledge',
      research: 'knowledge',
      goal: 'goal',
      success: 'success',
      failure: 'failure',
    };
    
    return typeMapping[memory.type] || 'knowledge';
  }

  getCluster(id) {
    return this.clusters.get(id);
  }

  getAllClusters() {
    return Array.from(this.clusters.values());
  }

  // Memory limit enforcement
  enforceMemoryLimit() {
    if (this.memories.size > this.settings.maxMemories) {
      this.pruneOldMemories();
    }
  }

  pruneOldMemories() {
    const excess = this.memories.size - this.settings.maxMemories;
    const toRemove = [];
    
    // Sort by importance and age
    const sorted = Array.from(this.memories.values()).sort((a, b) => {
      const scoreA = a.importance - (a.getAge() / (100 * this.settings.maxAge));
      const scoreB = b.importance - (b.getAge() / (100 * this.settings.maxAge));
      return scoreA - scoreB;
    });
    
    // Remove least important memories
    for (let i = 0; i < Math.min(excess, sorted.length); i++) {
      toRemove.push(sorted[i].id);
    }
    
    for (const id of toRemove) {
      this.deleteMemory(id);
    }
    
    this.emit('memoriesPruned', { count: toRemove.length });
  }

  // Memory decay
  applyDecay() {
    for (const memory of this.memories.values()) {
      memory.updateImportance(-this.settings.decayRate);
    }
  }

  // Specialized memory operations
  addProjectMemory(projectId, content, metadata = {}) {
    return this.addMemory('project', content, {
      ...metadata,
      projectId,
    });
  }

  addUserMemory(userId, content, metadata = {}) {
    return this.addMemory('user', content, {
      ...metadata,
      userId,
    });
  }

  addExecutionMemory(executionId, content, metadata = {}) {
    return this.addMemory('execution', content, {
      ...metadata,
      executionId,
      timestamp: new Date().toISOString(),
    });
  }

  addToolMemory(toolId, content, metadata = {}) {
    return this.addMemory('tool', content, {
      ...metadata,
      toolId,
    });
  }

  // Retrieval helpers
  async retrieveRelated(id, limit = 5) {
    const memory = this.memories.get(id);
    if (!memory) return [];

    const related = [];
    for (const relatedId of memory.relatedMemories.slice(0, limit)) {
      const relatedMemory = this.memories.get(relatedId);
      if (relatedMemory) {
        related.push(relatedMemory);
      }
    }

    return related;
  }

  async retrieveByType(type, limit = 50) {
    const memories = Array.from(this.memories.values())
      .filter(m => m.type === type)
      .sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    
    return memories.slice(0, limit);
  }

  async retrieveRecent(limit = 20) {
    const sorted = Array.from(this.memories.values())
      .sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    
    return sorted.slice(0, limit);
  }

  async retrieveByTag(tag, limit = 50) {
    const memories = Array.from(this.memories.values())
      .filter(m => m.tags.includes(tag))
      .sort((a, b) => b.importance - a.importance);
    
    return memories.slice(0, limit);
  }

  // Relationship management
  linkMemories(id1, id2, relationship = 'related') {
    const mem1 = this.memories.get(id1);
    const mem2 = this.memories.get(id2);
    
    if (mem1 && mem2) {
      if (!mem1.relatedMemories.includes(id2)) {
        mem1.relatedMemories.push(id2);
      }
      if (!mem2.relatedMemories.includes(id1)) {
        mem2.relatedMemories.push(id1);
      }
      this.emit('memoriesLinked', { id1, id2, relationship });
    }
  }

  unlinkMemories(id1, id2) {
    const mem1 = this.memories.get(id1);
    const mem2 = this.memories.get(id2);
    
    if (mem1) {
      mem1.relatedMemories = mem1.relatedMemories.filter(id => id !== id2);
    }
    if (mem2) {
      mem2.relatedMemories = mem2.relatedMemories.filter(id => id !== id1);
    }
  }

  // Tag management
  addTag(memoryId, tag) {
    const memory = this.memories.get(memoryId);
    if (memory && !memory.tags.includes(tag)) {
      memory.tags.push(tag);
      this.emit('tagAdded', { memoryId, tag });
    }
  }

  removeTag(memoryId, tag) {
    const memory = this.memories.get(memoryId);
    if (memory) {
      memory.tags = memory.tags.filter(t => t !== tag);
      this.emit('tagRemoved', { memoryId, tag });
    }
  }

  getAllTags() {
    const tagCounts = new Map();
    for (const memory of this.memories.values()) {
      for (const tag of memory.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
    return Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  // Statistics
  getStats() {
    const typeStats = {};
    for (const [id, memory] of this.memories) {
      if (!typeStats[memory.type]) {
        typeStats[memory.type] = { count: 0, totalImportance: 0 };
      }
      typeStats[memory.type].count++;
      typeStats[memory.type].totalImportance += memory.importance;
    }

    return {
      totalMemories: this.memories.size,
      totalClusters: this.clusters.size,
      indexSize: this.index.size,
      cacheSize: this.vectorCache.size,
      ...this.stats,
      typeBreakdown: typeStats,
    };
  }

  // Export/Import
  exportMemories() {
    const data = {
      memories: Array.from(this.memories.values()),
      clusters: Array.from(this.clusters.values()).map(c => ({
        id: c.id,
        label: c.label,
      })),
      exportedAt: new Date().toISOString(),
    };
    return data;
  }

  importMemories(data) {
    let imported = 0;
    
    if (data.memories) {
      for (const memData of data.memories) {
        const memory = new MemoryEntry(
          memData.id || this.generateId(memData.type),
          memData.type,
          memData.content,
          memData.metadata
        );
        
        memory.importance = memData.importance || 0.5;
        memory.tags = memData.tags || [];
        memory.relatedMemories = memData.relatedMemories || [];
        memory.createdAt = memData.createdAt;
        memory.accessCount = memData.accessCount || 0;
        
        this.memories.set(memory.id, memory);
        this.assignToCluster(memory);
        imported++;
      }
    }
    
    this.emit('memoriesImported', { count: imported });
    return imported;
  }

  // Clear operations
  clearByType(type) {
    const toDelete = [];
    for (const [id, memory] of this.memories) {
      if (memory.type === type) {
        toDelete.push(id);
      }
    }
    
    for (const id of toDelete) {
      this.deleteMemory(id);
    }
    
    return toDelete.length;
  }

  clearByAge(maxAge = null) {
    const cutoff = maxAge || this.settings.maxAge;
    const threshold = Date.now() - cutoff;
    const toDelete = [];
    
    for (const [id, memory] of this.memories) {
      if (new Date(memory.createdAt).getTime() < threshold) {
        toDelete.push(id);
      }
    }
    
    for (const id of toDelete) {
      this.deleteMemory(id);
    }
    
    return toDelete.length;
  }

  clearAll() {
    const count = this.memories.size;
    this.memories.clear();
    this.index.clear();
    this.vectorCache.clear();
    
    for (const cluster of this.clusters.values()) {
      cluster.memories = [];
    }
    
    this.emit('allMemoriesCleared', { count });
    return count;
  }

  // Search with context
  async searchWithContext(query, context = {}) {
    const results = await this.retrieve(query, {
      type: context.type,
      limit: context.limit || 10,
      minSimilarity: context.minSimilarity || 0.3,
      tags: context.tags,
    });

    // Enrich results with cluster context
    for (const result of results) {
      const cluster = this.getCluster(this.getClusterForMemory(result));
      if (cluster) {
        result.cluster = {
          id: cluster.id,
          label: cluster.label,
        };
      }
    }

    return results;
  }
}

// Export
export default VectorMemory;
export { MemoryEntry, MemoryCluster };