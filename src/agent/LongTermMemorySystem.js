/**
 * LongTermMemorySystem.js
 * 
 * Persistent long-term memory with:
 * - Cross-task learning
 * - Memory ranking & importance scoring
 * - Automatic summarization & compression
 * - Relevance-based context injection
 * 
 * FEATURE #3: Persistent Long-Term Memory
 */

class LongTermMemorySystem {
  constructor(maxMemories = 1000, compressionThreshold = 5000) {
    this.memories = [];
    this.summaries = [];
    this.learnings = [];
    this.maxMemories = maxMemories;
    this.compressionThreshold = compressionThreshold;
    this.accessLog = [];
  }

  /**
   * Store a memory
   */
  storeMemory(content, metadata = {}) {
    const memory = {
      id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content,
      metadata,
      importance: metadata.importance || this.calculateImportance(content),
      timestamp: Date.now(),
      accessCount: 0,
      lastAccessed: Date.now(),
      embedding: this.simpleEmbedding(content), // Simplified embedding
    };

    this.memories.push(memory);
    this.accessLog.push({ memoryId: memory.id, timestamp: Date.now(), action: 'stored' });

    // Auto-compress if needed
    if (this.memories.length > this.maxMemories) {
      this.compressMemories();
    }

    return memory.id;
  }

  /**
   * Retrieve relevant memories for context
   */
  retrieveRelevantMemories(query, limit = 5) {
    const queryEmbedding = this.simpleEmbedding(query);
    const scored = this.memories.map(mem => ({
      ...mem,
      relevanceScore: this.calculateRelevance(queryEmbedding, mem.embedding),
      recencyScore: Math.exp(-((Date.now() - mem.timestamp) / (1000 * 60 * 60 * 24))), // Decay over days
    }));

    // Sort by combined score
    scored.sort((a, b) => {
      const aScore = (a.relevanceScore * 0.6 + a.recencyScore * 0.2 + (a.importance / 100) * 0.2);
      const bScore = (b.relevanceScore * 0.6 + b.recencyScore * 0.2 + (b.importance / 100) * 0.2);
      return bScore - aScore;
    });

    // Update access log
    scored.slice(0, limit).forEach(mem => {
      mem.accessCount++;
      mem.lastAccessed = Date.now();
      this.accessLog.push({ memoryId: mem.id, timestamp: Date.now(), action: 'retrieved' });
    });

    return scored.slice(0, limit);
  }

  /**
   * Extract learnings from task execution
   */
  extractLearnings(taskDescription, outcome) {
    const learning = {
      id: `learning-${Date.now()}`,
      task: taskDescription,
      outcome,
      timestamp: Date.now(),
      successRate: outcome.success ? 1 : 0,
      strategies: outcome.strategies || [],
      insights: this.generateInsights(outcome),
    };

    this.learnings.push(learning);
    return learning;
  }

  /**
   * Generate insights from an outcome
   */
  generateInsights(outcome) {
    const insights = [];

    if (outcome.success && outcome.duration < 1000) {
      insights.push('Fast execution - this approach is efficient');
    }

    if (outcome.toolsUsed?.length > 5) {
      insights.push('Multi-tool coordination worked well - save this pattern');
    }

    if (outcome.retries > 3) {
      insights.push('High retry count - consider alternative approach');
    }

    return insights;
  }

  /**
   * Compress memories via summarization
   */
  compressMemories() {
    // Remove low-importance, old, rarely-accessed memories
    const scores = this.memories.map(mem => ({
      id: mem.id,
      score: (mem.importance / 100) * 0.5 + (mem.accessCount / 100) * 0.3 + Math.exp(-((Date.now() - mem.timestamp) / (1000 * 60 * 60 * 24))) * 0.2,
    }));

    scores.sort((a, b) => a.score - b.score);

    // Remove bottom 20%
    const toRemove = Math.floor(scores.length * 0.2);
    const idsToRemove = new Set(scores.slice(0, toRemove).map(s => s.id));

    this.memories = this.memories.filter(m => !idsToRemove.has(m.id));

    // Generate summaries for clusters
    this.generateSummaries();
  }

  /**
   * Generate summaries for memory clusters
   */
  generateSummaries() {
    const clusters = this.clusterMemories();

    for (const cluster of clusters) {
      const summary = {
        id: `summary-${Date.now()}`,
        cluster: cluster.memories.slice(0, 3).map(m => m.id),
        content: this.summarizeCluster(cluster),
        timestamp: Date.now(),
        compressionRatio: cluster.memories.length,
      };
      this.summaries.push(summary);
    }
  }

  /**
   * Cluster similar memories
   */
  clusterMemories() {
    const clusters = [];
    const clustered = new Set();

    for (let i = 0; i < this.memories.length; i++) {
      if (clustered.has(i)) continue;

      const cluster = { memories: [this.memories[i]] };
      clustered.add(i);

      for (let j = i + 1; j < this.memories.length; j++) {
        if (!clustered.has(j)) {
          const similarity = this.calculateRelevance(this.memories[i].embedding, this.memories[j].embedding);
          if (similarity > 0.7) {
            cluster.memories.push(this.memories[j]);
            clustered.add(j);
          }
        }
      }

      if (cluster.memories.length > 1) {
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  /**
   * Summarize a memory cluster
   */
  summarizeCluster(cluster) {
    const contents = cluster.memories.map(m => m.content).join(' ');
    // Simplified summarization
    const sentences = contents.split('. ').slice(0, 2).join('. ');
    return sentences.substring(0, 200) + '...';
  }

  /**
   * Calculate memory importance
   */
  calculateImportance(content) {
    let importance = 50; // Base

    if (content.includes('ERROR') || content.includes('FAILED')) importance += 20;
    if (content.includes('SUCCESS')) importance += 10;
    if (content.length > 500) importance += 10;

    return Math.min(100, importance);
  }

  /**
   * Simple embedding for similarity calculation
   */
  simpleEmbedding(text) {
    const words = text.toLowerCase().split(/\s+/);
    const embedding = {};

    for (const word of words) {
      embedding[word] = (embedding[word] || 0) + 1;
    }

    return embedding;
  }

  /**
   * Calculate relevance between two embeddings
   */
  calculateRelevance(emb1, emb2) {
    const keys = new Set([...Object.keys(emb1), ...Object.keys(emb2)]);
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    for (const key of keys) {
      const v1 = emb1[key] || 0;
      const v2 = emb2[key] || 0;
      dotProduct += v1 * v2;
      mag1 += v1 * v1;
      mag2 += v2 * v2;
    }

    const magnitude = Math.sqrt(mag1) * Math.sqrt(mag2);
    return magnitude > 0 ? dotProduct / magnitude : 0;
  }

  /**
   * Get memory statistics
   */
  getStats() {
    return {
      totalMemories: this.memories.length,
      totalLearnings: this.learnings.length,
      totalSummaries: this.summaries.length,
      averageImportance: this.memories.length > 0
        ? this.memories.reduce((sum, m) => sum + m.importance, 0) / this.memories.length
        : 0,
      accessCount: this.accessLog.length,
    };
  }

  /**
   * Export learnings
   */
  exportLearnings() {
    return this.learnings;
  }

  /**
   * Clear old memories
   */
  clearOldMemories(daysOld = 30) {
    const cutoff = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    const before = this.memories.length;
    this.memories = this.memories.filter(m => m.timestamp > cutoff);
    return before - this.memories.length;
  }
}

export default LongTermMemorySystem;
