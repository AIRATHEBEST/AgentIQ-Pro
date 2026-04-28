/**
 * Advanced Memory System - Manus 1.6 Max Pro Feature
 * Long-term context retention, vector-based semantic search, and knowledge graphs
 */

import { EventEmitter } from 'events';

// Simple vector representation for semantic search
export class MemoryVector {
  constructor(dimensions = 128) {
    this.dimensions = dimensions;
    this.data = new Float32Array(dimensions);
  }

  static fromText(text) {
    // Generate deterministic vector from text using hashing
    const vector = new MemoryVector();
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash = hash & hash;
    }
    
    // Seed random with hash for consistent vectors
    const seed = Math.abs(hash);
    for (let i = 0; i < vector.dimensions; i++) {
      // Simple pseudo-random based on seed
      const x = Math.sin(seed + i * 12.9898) * 43758.5453;
      vector.data[i] = (x - Math.floor(x)) * 2 - 1;
    }
    
    // Normalize
    let magnitude = 0;
    for (let i = 0; i < vector.dimensions; i++) {
      magnitude += vector.data[i] * vector.data[i];
    }
    magnitude = Math.sqrt(magnitude);
    if (magnitude > 0) {
      for (let i = 0; i < vector.dimensions; i++) {
        vector.data[i] /= magnitude;
      }
    }
    
    return vector;
  }

  dot(other) {
    let sum = 0;
    for (let i = 0; i < this.dimensions; i++) {
      sum += this.data[i] * other.data[i];
    }
    return sum;
  }

  cosineSimilarity(other) {
    return this.dot(other);
  }
}

export class MemoryEntry {
  constructor(id, content, metadata = {}) {
    this.id = id;
    this.content = content;
    this.metadata = {
      createdAt: Date.now(),
      accessCount: 0,
      lastAccessed: Date.now(),
      importance: metadata.importance || 0.5,
      tags: metadata.tags || [],
      ...metadata
    };
    this.vector = MemoryVector.fromText(content);
    this.associations = new Set();
  }

  recordAccess() {
    this.metadata.accessCount++;
    this.metadata.lastAccessed = Date.now();
  }

  addAssociation(entryId, strength = 1.0) {
    this.associations.add(`${entryId}:${strength}`);
  }

  getAssociations() {
    return Array.from(this.associations).map(a => {
      const [id, strength] = a.split(':');
      return { id, strength: parseFloat(strength) };
    });
  }
}

export class KnowledgeNode {
  constructor(id, data = {}) {
    this.id = id;
    this.type = data.type || 'concept';
    this.label = data.label || '';
    this.data = data.data || {};
    this.properties = data.properties || {};
    this.connections = new Map(); // targetId -> { type, weight }
    this.metadata = {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      confidence: data.confidence || 1.0
    };
  }

  connect(targetId, connectionType = 'related', weight = 1.0) {
    this.connections.set(targetId, { type: connectionType, weight });
  }

  disconnect(targetId) {
    this.connections.delete(targetId);
  }

  getConnections(filter = {}) {
    let conns = Array.from(this.connections.entries());
    
    if (filter.type) {
      conns = conns.filter(([, c]) => c.type === filter.type);
    }
    if (filter.minWeight) {
      conns = conns.filter(([, c]) => c.weight >= filter.minWeight);
    }
    
    return conns.map(([id, c]) => ({ id, ...c }));
  }

  update(newData) {
    this.data = { ...this.data, ...newData };
    this.metadata.updatedAt = Date.now();
  }
}

export class KnowledgeGraph {
  constructor() {
    this.nodes = new Map();
    this.types = new Set();
    this.eventEmitter = new EventEmitter();
  }

  addNode(node) {
    this.nodes.set(node.id, node);
    this.types.add(node.type);
    this.eventEmitter.emit('node:added', { nodeId: node.id });
    return node;
  }

  createNode(id, data) {
    const node = new KnowledgeNode(id, data);
    return this.addNode(node);
  }

  getNode(id) {
    return this.nodes.get(id);
  }

  removeNode(id) {
    const node = this.nodes.get(id);
    if (node) {
      // Remove all connections to this node
      for (const [nodeId, n] of this.nodes) {
        n.disconnect(id);
      }
      this.nodes.delete(id);
      this.eventEmitter.emit('node:removed', { nodeId: id });
    }
    return node;
  }

  connect(sourceId, targetId, connectionType = 'related', weight = 1.0) {
    const source = this.nodes.get(sourceId);
    const target = this.nodes.get(targetId);
    
    if (source && target) {
      source.connect(targetId, connectionType, weight);
      this.eventEmitter.emit('connection:added', { sourceId, targetId, type: connectionType });
    }
  }

  findPath(startId, endId, maxDepth = 5) {
    const visited = new Set();
    const queue = [{ id: startId, path: [startId] }];
    
    while (queue.length > 0) {
      const { id, path } = queue.shift();
      
      if (id === endId) {
        return path;
      }
      
      if (visited.has(id) || path.length > maxDepth) {
        continue;
      }
      
      visited.add(id);
      const node = this.nodes.get(id);
      
      if (node) {
        for (const [connId, conn] of node.connections) {
          if (!visited.has(connId)) {
            queue.push({ id: connId, path: [...path, connId] });
          }
        }
      }
    }
    
    return null; // No path found
  }

  searchByType(type) {
    return Array.from(this.nodes.values()).filter(n => n.type === type);
  }

  searchByProperty(key, value) {
    return Array.from(this.nodes.values()).filter(n => n.properties[key] === value);
  }

  getSubgraph(startId, depth = 2) {
    const visited = new Set();
    const result = [];
    const queue = [{ id: startId, depth: 0 }];
    
    while (queue.length > 0) {
      const { id, depth: currentDepth } = queue.shift();
      
      if (visited.has(id) || currentDepth > depth) {
        continue;
      }
      
      visited.add(id);
      const node = this.nodes.get(id);
      
      if (node) {
        result.push(node);
        
        for (const [connId, conn] of node.connections) {
          if (!visited.has(connId)) {
            queue.push({ id: connId, depth: currentDepth + 1 });
          }
        }
      }
    }
    
    return result;
  }

  exportData() {
    return {
      nodes: Array.from(this.nodes.values()).map(n => ({
        id: n.id,
        type: n.type,
        label: n.label,
        data: n.data,
        properties: n.properties,
        connections: Array.from(n.connections.entries())
      })),
      types: Array.from(this.types),
      metadata: {
        totalNodes: this.nodes.size,
        exportedAt: Date.now()
      }
    };
  }
}

export class AdvancedMemory extends EventEmitter {
  constructor(config = {}) {
    super();
    this.shortTerm = new Map(); // Recent context
    this.longTerm = new Map(); // Persistent memories
    this.vectors = new Map(); // Vector store for semantic search
    this.knowledgeGraph = new KnowledgeGraph();
    this.maxShortTerm = config.maxShortTerm || 100;
    this.maxLongTerm = config.maxLongTerm || 10000;
    this.retentionPolicy = config.retentionPolicy || 'importance';
    this.entryCounter = 0;
  }

  store(content, metadata = {}) {
    this.entryCounter++;
    const id = metadata.id || `mem-${this.entryCounter}-${Date.now()}`;
    
    const entry = new MemoryEntry(id, content, metadata);
    
    if (metadata.persistent || metadata.importance > 0.7) {
      this.longTerm.set(id, entry);
      this.trimLongTerm();
    } else {
      this.shortTerm.set(id, entry);
      this.trimShortTerm();
    }
    
    this.vectors.set(id, entry.vector);
    
    this.emit('memory:stored', { id, content, metadata });
    
    return id;
  }

  recall(id) {
    let entry = this.shortTerm.get(id) || this.longTerm.get(id);
    
    if (entry) {
      entry.recordAccess();
      this.emit('memory:accessed', { id });
    }
    
    return entry;
  }

  semanticSearch(query, options = {}) {
    const limit = options.limit || 10;
    const queryVector = MemoryVector.fromText(query);
    
    const allEntries = [...this.shortTerm.values(), ...this.longTerm.values()];
    
    // Calculate similarities
    const results = allEntries.map(entry => ({
      id: entry.id,
      content: entry.content,
      similarity: entry.vector.cosineSimilarity(queryVector),
      metadata: entry.metadata
    }));
    
    // Sort by similarity and limit
    results.sort((a, b) => b.similarity - a.similarity);
    
    this.emit('memory:search', { query, results: results.length });
    
    return results.slice(0, limit);
  }

  searchByTags(tags, options = {}) {
    const limit = options.limit || 20;
    
    const allEntries = [...this.shortTerm.values(), ...this.longTerm.values()];
    
    const results = allEntries.filter(entry => 
      tags.some(tag => entry.metadata.tags.includes(tag))
    );
    
    // Sort by importance and access count
    results.sort((a, b) => {
      const scoreA = a.metadata.importance * 0.6 + (a.metadata.accessCount / 100) * 0.4;
      const scoreB = b.metadata.importance * 0.6 + (b.metadata.accessCount / 100) * 0.4;
      return scoreB - scoreA;
    });
    
    return results.slice(0, limit).map(entry => ({
      id: entry.id,
      content: entry.content,
      metadata: entry.metadata
    }));
  }

  createKnowledgeNode(id, data) {
    const node = this.knowledgeGraph.createNode(id, data);
    
    if (data.connections) {
      for (const conn of data.connections) {
        this.knowledgeGraph.connect(id, conn.targetId, conn.type, conn.weight);
      }
    }
    
    this.emit('knowledge:node-created', { id, type: data.type });
    
    return node;
  }

  linkKnowledge(sourceId, targetId, connectionType = 'related', weight = 1.0) {
    this.knowledgeGraph.connect(sourceId, targetId, connectionType, weight);
    
    // Also create memory associations
    const sourceEntry = this.shortTerm.get(sourceId) || this.longTerm.get(sourceId);
    const targetEntry = this.shortTerm.get(targetId) || this.longTerm.get(targetId);
    
    if (sourceEntry) sourceEntry.addAssociation(targetId, weight);
    if (targetEntry) targetEntry.addAssociation(sourceId, weight);
    
    this.emit('knowledge:linked', { sourceId, targetId, type: connectionType });
  }

  queryKnowledge(query, options = {}) {
    const node = this.knowledgeGraph.getNode(query);
    
    if (node) {
      return {
        node,
        subgraph: options.includeSubgraph 
          ? this.knowledgeGraph.getSubgraph(node.id, options.depth || 2)
          : null
      };
    }
    
    // Fallback to semantic search
    return { semanticResults: this.semanticSearch(query, options) };
  }

  consolidate() {
    // Move important short-term memories to long-term
    const toMigrate = Array.from(this.shortTerm.values())
      .filter(entry => {
        const recency = Date.now() - entry.metadata.lastAccessed < 300000; // 5 minutes
        return entry.metadata.importance > 0.6 || recency;
      });
    
    for (const entry of toMigrate) {
      this.longTerm.set(entry.id, entry);
      this.shortTerm.delete(entry.id);
    }
    
    this.emit('memory:consolidated', { migrated: toMigrate.length });
    
    return { migrated: toMigrate.length };
  }

  trimShortTerm() {
    while (this.shortTerm.size > this.maxShortTerm) {
      // Remove least recently accessed
      let oldest = null;
      let oldestTime = Infinity;
      
      for (const [id, entry] of this.shortTerm) {
        if (entry.metadata.lastAccessed < oldestTime) {
          oldest = id;
          oldestTime = entry.metadata.lastAccessed;
        }
      }
      
      if (oldest) {
        this.shortTerm.delete(oldest);
        this.vectors.delete(oldest);
      }
    }
  }

  trimLongTerm() {
    while (this.longTerm.size > this.maxLongTerm) {
      // Remove lowest importance
      let lowest = null;
      let lowestScore = Infinity;
      
      for (const [id, entry] of this.longTerm) {
        const score = entry.metadata.importance - (entry.metadata.accessCount / 1000);
        if (score < lowestScore) {
          lowest = id;
          lowestScore = score;
        }
      }
      
      if (lowest) {
        this.longTerm.delete(lowest);
        this.vectors.delete(lowest);
        this.knowledgeGraph.removeNode(lowest);
      }
    }
  }

  getStats() {
    return {
      shortTermSize: this.shortTerm.size,
      longTermSize: this.longTerm.size,
      totalVectors: this.vectors.size,
      knowledgeNodes: this.knowledgeGraph.nodes.size,
      knowledgeTypes: Array.from(this.knowledgeGraph.types)
    };
  }

  export() {
    return {
      shortTerm: Array.from(this.shortTerm.values()).map(e => ({
        id: e.id,
        content: e.content,
        metadata: e.metadata
      })),
      longTerm: Array.from(this.longTerm.values()).map(e => ({
        id: e.id,
        content: e.content,
        metadata: e.metadata
      })),
      knowledge: this.knowledgeGraph.exportData(),
      exportedAt: Date.now()
    };
  }

  clear(type = 'all') {
    if (type === 'short' || type === 'all') {
      this.shortTerm.clear();
    }
    if (type === 'long' || type === 'all') {
      this.longTerm.clear();
    }
    if (type === 'knowledge') {
      this.knowledgeGraph.nodes.clear();
    }
    
    this.vectors.clear();
    this.emit('memory:cleared', { type });
  }
}

// Factory function
export function createAdvancedMemory(config) {
  return new AdvancedMemory(config);
}