/**
 * Knowledge Graph Memory Module
 * Manages entities and relationships between Users, Projects, Goals, Tools, Failures, Successes, and Dependencies
 */

export const NodeType = {
  USER: 'user',
  PROJECT: 'project',
  GOAL: 'goal',
  TOOL: 'tool',
  FAILURE: 'failure',
  SUCCESS: 'success',
  DEPENDENCY: 'dependency',
  KNOWLEDGE: 'knowledge',
  EXECUTION: 'execution',
  AGENT: 'agent',
  WORKFLOW: 'workflow',
  POLICY: 'policy'
};

export const RelationshipType = {
  CREATED_BY: 'created_by',
  HAS_PROJECT: 'has_project',
  HAS_GOAL: 'has_goal',
  HAS_TOOL: 'has_tool',
  ACHIEVED: 'achieved',
  FAILED_BECAUSE: 'failed_because',
  DEPENDS_ON: 'depends_on',
  SUCCEEDED_WITH: 'succeeded_with',
  USES_TOOL: 'uses_tool',
  LEADS_TO: 'leads_to',
  CONTRADICTS: 'contradicts',
  SUPPORTS: 'supports',
  PART_OF: 'part_of',
  COLLABORATES_WITH: 'collaborates_with',
  CONFLICTS_WITH: 'conflicts_with',
  DERIVES_FROM: 'derives_from',
  REQUIRES: 'requires',
  ENABLES: 'enables',
  BLOCKS: 'blocks',
  TRIGGERS: 'triggers'
};

export class GraphNode {
  constructor(id, type, data = {}) {
    this.id = id;
    this.type = type;
    this.data = data;
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.properties = {
      name: data.name || data.title || id,
      description: data.description || '',
      importance: data.importance || 0.5,
      confidence: data.confidence || 0.5,
      tags: data.tags || [],
      metadata: data.metadata || {},
      centrality: 0,
      PageRank: 0,
      betweenness: 0,
      clusteringCoefficient: 0
    };
    this.embeddings = data.embeddings || null;
  }

  update(data) {
    this.data = { ...this.data, ...data };
    this.properties = {
      ...this.properties,
      name: data.name || data.title || this.properties.name,
      description: data.description || this.properties.description,
      importance: data.importance ?? this.properties.importance,
      confidence: data.confidence ?? this.properties.confidence,
      tags: data.tags || this.properties.tags,
      metadata: data.metadata || this.properties.metadata
    };
    this.updatedAt = new Date();
  }

  addTag(tag) {
    if (!this.properties.tags.includes(tag)) {
      this.properties.tags.push(tag);
      this.updatedAt = new Date();
    }
  }

  removeTag(tag) {
    this.properties.tags = this.properties.tags.filter(t => t !== tag);
    this.updatedAt = new Date();
  }

  getAge() {
    return Date.now() - this.createdAt.getTime();
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      data: this.data,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      properties: this.properties,
      embeddings: this.embeddings
    };
  }
}

export class GraphEdge {
  constructor(sourceId, targetId, relationship, weight = 1.0, data = {}) {
    this.id = `${sourceId}->${relationship}->${targetId}`;
    this.sourceId = sourceId;
    this.targetId = targetId;
    this.relationship = relationship;
    this.weight = weight;
    this.data = data;
    this.createdAt = new Date();
    this.properties = {
      label: data.label || relationship,
      description: data.description || '',
      strength: data.strength || weight,
      metadata: data.metadata || {},
      bidirectional: data.bidirectional || false
    };
  }

  update(data) {
    this.data = { ...this.data, ...data };
    this.weight = data.weight ?? this.weight;
    this.properties = {
      ...this.properties,
      label: data.label || this.properties.label,
      description: data.description || this.properties.description,
      strength: data.strength ?? this.properties.strength,
      metadata: data.metadata || this.properties.metadata
    };
  }

  getReverseRelationship() {
    const reverseMap = {
      [RelationshipType.CREATED_BY]: RelationshipType.HAS_PROJECT,
      [RelationshipType.HAS_PROJECT]: RelationshipType.CREATED_BY,
      [RelationshipType.HAS_GOAL]: RelationshipType.ACHIEVED,
      [RelationshipType.ACHIEVED]: RelationshipType.HAS_GOAL,
      [RelationshipType.FAILED_BECAUSE]: RelationshipType.CAUSED,
      [RelationshipType.DEPENDS_ON]: RelationshipType.REQUIRES,
      [RelationshipType.SUCCEEDED_WITH]: RelationshipType.USES_TOOL,
      [RelationshipType.USES_TOOL]: RelationshipType.SUCCEEDED_WITH,
      [RelationshipType.LEADS_TO]: RelationshipType.PART_OF,
      [RelationshipType.PART_OF]: RelationshipType.LEADS_TO,
      [RelationshipType.CONTRADICTS]: RelationshipType.CONTRADICTS,
      [RelationshipType.SUPPORTS]: RelationshipType.DERIVES_FROM,
      [RelationshipType.DERIVES_FROM]: RelationshipType.SUPPORTS,
      [RelationshipType.REQUIRES]: RelationshipType.DEPENDS_ON,
      [RelationshipType.ENABLES]: RelationshipType.TRIGGERS,
      [RelationshipType.TRIGGERS]: RelationshipType.ENABLES,
      [RelationshipType.BLOCKS]: RelationshipType.ENABLES,
      [RelationshipType.COLLABORATES_WITH]: RelationshipType.COLLABORATES_WITH
    };
    return reverseMap[this.relationship] || null;
  }

  toJSON() {
    return {
      id: this.id,
      sourceId: this.sourceId,
      targetId: this.targetId,
      relationship: this.relationship,
      weight: this.weight,
      data: this.data,
      createdAt: this.createdAt,
      properties: this.properties
    };
  }
}

export class KnowledgeGraph {
  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
    this.adjacencyList = new Map();
    this.reverseAdjacencyList = new Map();
    
    this.settings = {
      maxNodes: 50000,
      maxEdges: 500000,
      pruningInterval: 24 * 60 * 60 * 1000, // 24 hours
      minConfidence: 0.3,
      maxDepth: 10,
      cacheEnabled: true
    };
    
    this.metrics = {
      totalNodes: 0,
      totalEdges: 0,
      nodeTypes: {},
      relationshipTypes: {},
      avgDegree: 0,
      density: 0,
      connectedComponents: 0
    };
    
    this.eventListeners = new Map();
    this.cache = new Map();
    this.lastPruned = Date.now();
    
    // Initialize built-in node types tracking
    Object.values(NodeType).forEach(type => {
      this.metrics.nodeTypes[type] = 0;
    });
    
    Object.values(RelationshipType).forEach(rel => {
      this.metrics.relationshipTypes[rel] = 0;
    });
  }

  // Event System
  addEventListener(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event).add(callback);
  }

  removeEventListener(event, callback) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).delete(callback);
    }
  }

  emitEvent(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => callback(data));
    }
  }

  // Node Operations
  addNode(id, type, data = {}) {
    if (this.nodes.has(id)) {
      const existingNode = this.nodes.get(id);
      existingNode.update(data);
      this.emitEvent('nodeUpdated', existingNode);
      return existingNode;
    }

    if (this.nodes.size >= this.settings.maxNodes) {
      this.prune();
      if (this.nodes.size >= this.settings.maxNodes) {
        this.emitEvent('nodeLimitReached', { limit: this.settings.maxNodes });
        return null;
      }
    }

    const node = new GraphNode(id, type, data);
    this.nodes.set(id, node);
    this.adjacencyList.set(id, []);
    this.reverseAdjacencyList.set(id, []);
    
    this.metrics.totalNodes++;
    this.metrics.nodeTypes[type] = (this.metrics.nodeTypes[type] || 0) + 1;
    
    this.invalidateCache();
    this.emitEvent('nodeAdded', node);
    
    return node;
  }

  getNode(id) {
    return this.nodes.get(id) || null;
  }

  updateNode(id, data) {
    const node = this.nodes.get(id);
    if (!node) return null;
    
    node.update(data);
    this.invalidateCache();
    this.emitEvent('nodeUpdated', node);
    this.calculateCentrality();
    
    return node;
  }

  deleteNode(id) {
    const node = this.nodes.get(id);
    if (!node) return false;

    // Remove all edges connected to this node
    const edgesToRemove = this.getEdgesForNode(id);
    edgesToRemove.forEach(edge => this.deleteEdge(edge.id));

    this.nodes.delete(id);
    this.adjacencyList.delete(id);
    this.reverseAdjacencyList.delete(id);

    this.metrics.totalNodes--;
    this.metrics.nodeTypes[node.type]--;
    
    this.invalidateCache();
    this.emitEvent('nodeDeleted', { id, type: node.type });
    this.calculateCentrality();
    
    return true;
  }

  getNodesByType(type) {
    const nodes = [];
    this.nodes.forEach(node => {
      if (node.type === type) {
        nodes.push(node);
      }
    });
    return nodes;
  }

  // Edge Operations
  addEdge(sourceId, targetId, relationship, weight = 1.0, data = {}) {
    if (!this.nodes.has(sourceId) || !this.nodes.has(targetId)) {
      return null;
    }

    const edgeId = `${sourceId}->${relationship}->${targetId}`;
    if (this.edges.has(edgeId)) {
      const existingEdge = this.edges.get(edgeId);
      existingEdge.update(data);
      this.emitEvent('edgeUpdated', existingEdge);
      return existingEdge;
    }

    if (this.edges.size >= this.settings.maxEdges) {
      this.emitEvent('edgeLimitReached', { limit: this.settings.maxEdges });
      return null;
    }

    const edge = new GraphEdge(sourceId, targetId, relationship, weight, data);
    this.edges.set(edgeId, edge);
    
    this.adjacencyList.get(sourceId).push(edgeId);
    this.reverseAdjacencyList.get(targetId).push(edgeId);
    
    // If bidirectional, add reverse edge
    if (data.bidirectional) {
      const reverseEdgeId = `${targetId}->${relationship}->${sourceId}`;
      const reverseEdge = new GraphEdge(targetId, sourceId, relationship, weight, { ...data, bidirectional: false });
      this.edges.set(reverseEdgeId, reverseEdge);
      this.adjacencyList.get(targetId).push(reverseEdgeId);
      this.reverseAdjacencyList.get(sourceId).push(reverseEdgeId);
    }

    this.metrics.totalEdges++;
    this.metrics.relationshipTypes[relationship] = (this.metrics.relationshipTypes[relationship] || 0) + 1;
    
    this.invalidateCache();
    this.emitEvent('edgeAdded', edge);
    
    return edge;
  }

  getEdge(id) {
    return this.edges.get(id) || null;
  }

  getEdgesForNode(nodeId) {
    const edges = [];
    this.adjacencyList.get(nodeId)?.forEach(edgeId => {
      edges.push(this.edges.get(edgeId));
    });
    return edges.filter(Boolean);
  }

  getIncomingEdges(nodeId) {
    const edges = [];
    this.reverseAdjacencyList.get(nodeId)?.forEach(edgeId => {
      edges.push(this.edges.get(edgeId));
    });
    return edges.filter(Boolean);
  }

  deleteEdge(id) {
    const edge = this.edges.get(id);
    if (!edge) return false;

    const adjList = this.adjacencyList.get(edge.sourceId);
    const revAdjList = this.reverseAdjacencyList.get(edge.targetId);
    
    if (adjList) {
      const idx = adjList.indexOf(id);
      if (idx > -1) adjList.splice(idx, 1);
    }
    if (revAdjList) {
      const idx = revAdjList.indexOf(id);
      if (idx > -1) revAdjList.splice(idx, 1);
    }

    this.edges.delete(id);
    this.metrics.totalEdges--;
    this.metrics.relationshipTypes[edge.relationship]--;
    
    this.invalidateCache();
    this.emitEvent('edgeDeleted', { id, sourceId: edge.sourceId, targetId: edge.targetId });
    
    return true;
  }

  // Graph Traversal
  bfs(startId, relationshipFilter = null, maxDepth = 5) {
    const visited = new Set();
    const queue = [{ nodeId: startId, depth: 0 }];
    const results = [];

    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift();
      
      if (visited.has(nodeId) || depth > maxDepth) continue;
      visited.add(nodeId);
      
      const node = this.nodes.get(nodeId);
      if (node) {
        results.push({ node, depth });
      }

      const edges = this.getEdgesForNode(nodeId);
      edges.forEach(edge => {
        if (!relationshipFilter || edge.relationship === relationshipFilter) {
          if (!visited.has(edge.targetId)) {
            queue.push({ nodeId: edge.targetId, depth: depth + 1 });
          }
        }
      });
    }

    return results;
  }

  dfs(startId, relationshipFilter = null, maxDepth = 10) {
    const visited = new Set();
    const results = [];

    const dfsHelper = (nodeId, depth) => {
      if (visited.has(nodeId) || depth > maxDepth) return;
      visited.add(nodeId);

      const node = this.nodes.get(nodeId);
      if (node) {
        results.push({ node, depth });
      }

      const edges = this.getEdgesForNode(nodeId);
      for (const edge of edges) {
        if (!relationshipFilter || edge.relationship === relationshipFilter) {
          if (!visited.has(edge.targetId)) {
            dfsHelper(edge.targetId, depth + 1);
          }
        }
      }
    };

    dfsHelper(startId, 0);
    return results;
  }

  // Path Finding
  findPath(startId, endId, maxDepth = 10) {
    const visited = new Set();
    const queue = [{ nodeId: startId, path: [startId], weight: 0 }];

    while (queue.length > 0) {
      const { nodeId, path, weight } = queue.shift();
      
      if (nodeId === endId) {
        return { found: true, path, totalWeight: weight };
      }
      
      if (visited.has(nodeId) || path.length > maxDepth) continue;
      visited.add(nodeId);

      const edges = this.getEdgesForNode(nodeId);
      edges.forEach(edge => {
        if (!visited.has(edge.targetId)) {
          queue.push({
            nodeId: edge.targetId,
            path: [...path, edge.targetId],
            weight: weight + edge.weight
          });
        }
      });
    }

    return { found: false, path: [], totalWeight: 0 };
  }

  findAllPaths(startId, endId, maxDepth = 10) {
    const allPaths = [];

    const dfsPaths = (currentId, path, weight) => {
      if (currentId === endId) {
        allPaths.push({ path: [...path], weight });
        return;
      }
      
      if (path.length > maxDepth) return;

      const edges = this.getEdgesForNode(currentId);
      edges.forEach(edge => {
        if (!path.includes(edge.targetId)) {
          dfsPaths(edge.targetId, [...path, edge.targetId], weight + edge.weight);
        }
      });
    };

    dfsPaths(startId, [startId], 0);
    return allPaths.sort((a, b) => a.weight - b.weight);
  }

  findShortestPath(startId, endId) {
    return this.findPath(startId, endId);
  }

  findLongestPath(startId, endId) {
    const allPaths = this.findAllPaths(startId, endId);
    return allPaths.length > 0 ? allPaths[allPaths.length - 1] : { found: false, path: [], weight: 0 };
  }

  // Centrality Calculations
  calculateCentrality() {
    // Calculate degree centrality
    this.nodes.forEach(node => {
      const outDegree = this.getEdgesForNode(node.id).length;
      const inDegree = this.getIncomingEdges(node.id).length;
      node.properties.centrality = (outDegree + inDegree) / (this.nodes.size - 1);
    });

    // Calculate PageRank (simplified)
    this.calculatePageRank();
    
    // Calculate betweenness centrality (simplified)
    this.calculateBetweenness();
    
    // Calculate clustering coefficient
    this.calculateClusteringCoefficient();
  }

  calculatePageRank(damping = 0.85, iterations = 20) {
    const n = this.nodes.size;
    if (n === 0) return;

    let pagerank = new Map();
    this.nodes.forEach((_, id) => pagerank.set(id, 1 / n));

    for (let i = 0; i < iterations; i++) {
      const newRank = new Map();
      this.nodes.forEach((_, id) => {
        newRank.set(id, (1 - damping) / n);
      });

      this.edges.forEach(edge => {
        const currentRank = pagerank.get(edge.sourceId) || 0;
        const outLinks = this.getEdgesForNode(edge.sourceId).length;
        if (outLinks > 0) {
          const contribution = (damping * currentRank) / outLinks;
          const newVal = newRank.get(edge.targetId) + contribution;
          newRank.set(edge.targetId, newVal);
        }
      });

      pagerank = newRank;
    }

    pagerank.forEach((rank, id) => {
      const node = this.nodes.get(id);
      if (node) {
        node.properties.pageRank = rank;
      }
    });
  }

  calculateBetweenness() {
    this.nodes.forEach((node, id) => {
      let betweenness = 0;
      const otherNodes = Array.from(this.nodes.keys()).filter(n => n !== id);

      otherNodes.forEach(source => {
        otherNodes.forEach(target => {
          if (source !== target) {
            const path = this.findShortestPath(source, target);
            if (path.found && path.path.includes(id)) {
              betweenness += 1 / (path.path.length - 1);
            }
          }
        });
      });

      const node = this.nodes.get(id);
      if (node) {
        node.properties.betweenness = betweenness / (n * (n - 1) / 2);
      }
    });
  }

  calculateClusteringCoefficient() {
    this.nodes.forEach((node, id) => {
      const neighbors = new Set();
      this.getEdgesForNode(id).forEach(edge => neighbors.add(edge.targetId));
      this.getIncomingEdges(id).forEach(edge => neighbors.add(edge.sourceId));

      const neighborArray = Array.from(neighbors);
      let triangles = 0;
      let maxTriangles = 0;

      for (let i = 0; i < neighborArray.length; i++) {
        for (let j = i + 1; j < neighborArray.length; j++) {
          maxTriangles++;
          const edges = this.getEdgesForNode(neighborArray[i]);
          if (edges.some(e => e.targetId === neighborArray[j])) {
            triangles++;
          }
        }
      }

      const node = this.nodes.get(id);
      if (node) {
        node.properties.clusteringCoefficient = maxTriangles > 0 ? (2 * triangles) / maxTriangles : 0;
      }
    });
  }

  getMostCentralNodes(type = null, limit = 10) {
    const nodes = [];
    
    this.nodes.forEach(node => {
      if (!type || node.type === type) {
        nodes.push(node);
      }
    });

    return nodes
      .sort((a, b) => b.properties.centrality - a.properties.centrality)
      .slice(0, limit);
  }

  getMostConnectedNodes(limit = 10) {
    const connectionCounts = [];
    
    this.nodes.forEach(node => {
      const connections = this.getEdgesForNode(node.id).length + 
                         this.getIncomingEdges(node.id).length;
      connectionCounts.push({ node, connections });
    });

    return connectionCounts
      .sort((a, b) => b.connections - a.connections)
      .slice(0, limit)
      .map(item => item.node);
  }

  // Relationship Queries
  getRelatedNodes(nodeId, relationship = null, direction = 'both') {
    const related = [];

    if (direction === 'both' || direction === 'outgoing') {
      const edges = this.getEdgesForNode(nodeId);
      edges.forEach(edge => {
        if (!relationship || edge.relationship === relationship) {
          related.push({
            node: this.nodes.get(edge.targetId),
            relationship: edge.relationship,
            direction: 'outgoing'
          });
        }
      });
    }

    if (direction === 'both' || direction === 'incoming') {
      const edges = this.getIncomingEdges(nodeId);
      edges.forEach(edge => {
        if (!relationship || edge.relationship === relationship) {
          related.push({
            node: this.nodes.get(edge.sourceId),
            relationship: edge.relationship,
            direction: 'incoming'
          });
        }
      });
    }

    return related;
  }

  getNodesByRelationship(relationship, direction = 'outgoing') {
    const nodes = new Set();

    this.edges.forEach(edge => {
      if (edge.relationship === relationship) {
        if (direction === 'outgoing' || direction === 'both') {
          nodes.add(edge.sourceId);
        }
        if (direction === 'incoming' || direction === 'both') {
          nodes.add(edge.targetId);
        }
      }
    });

    return Array.from(nodes).map(id => this.nodes.get(id)).filter(Boolean);
  }

  findCommonNeighbors(nodeId1, nodeId2) {
    const neighbors1 = new Set();
    const neighbors2 = new Set();

    this.getEdgesForNode(nodeId1).forEach(e => neighbors1.add(e.targetId));
    this.getIncomingEdges(nodeId1).forEach(e => neighbors1.add(e.sourceId));
    this.getEdgesForNode(nodeId2).forEach(e => neighbors2.add(e.targetId));
    this.getIncomingEdges(nodeId2).forEach(e => neighbors2.add(e.sourceId));

    const common = new Set([...neighbors1].filter(x => neighbors2.has(x)));
    return Array.from(common).map(id => this.nodes.get(id)).filter(Boolean);
  }

  // Pattern Matching
  findPattern(pattern) {
    const results = [];
    const { nodeType, relationship, targetType, depth } = pattern;

    this.nodes.forEach(node => {
      if (!nodeType || node.type === nodeType) {
        const related = this.getRelatedNodes(node.id, relationship);
        const filtered = related.filter(r => 
          !targetType || (r.node && r.node.type === targetType)
        );

        if (filtered.length >= (depth || 1)) {
          results.push({
            rootNode: node,
            matches: filtered
          });
        }
      }
    });

    return results;
  }

  findCycles() {
    const cycles = [];
    const visited = new Set();
    const recStack = new Set();

    const dfsCycle = (nodeId, path) => {
      if (recStack.has(nodeId)) {
        const cycleStart = path.indexOf(nodeId);
        if (cycleStart !== -1) {
          cycles.push(path.slice(cycleStart));
        }
        return;
      }

      if (visited.has(nodeId)) return;

      visited.add(nodeId);
      recStack.add(nodeId);
      path.push(nodeId);

      const edges = this.getEdgesForNode(nodeId);
      edges.forEach(edge => {
        dfsCycle(edge.targetId, [...path]);
      });

      recStack.delete(nodeId);
    };

    this.nodes.forEach((_, id) => {
      if (!visited.has(id)) {
        dfsCycle(id, []);
      }
    });

    return cycles;
  }

  // Graph Metrics
  calculateMetrics() {
    this.metrics.avgDegree = this.nodes.size > 0 
      ? (2 * this.metrics.totalEdges) / this.nodes.size 
      : 0;
    
    const maxEdges = this.nodes.size * (this.nodes.size - 1) / 2;
    this.metrics.density = maxEdges > 0 
      ? this.metrics.totalEdges / maxEdges 
      : 0;
    
    this.metrics.connectedComponents = this.countConnectedComponents();
    
    return this.metrics;
  }

  countConnectedComponents() {
    const visited = new Set();
    let components = 0;

    this.nodes.forEach((_, id) => {
      if (!visited.has(id)) {
        this.bfs(id).forEach(item => visited.add(item.node.id));
        components++;
      }
    });

    return components;
  }

  // Subgraph Operations
  getSubgraph(nodeIds, includeEdges = true) {
    const subgraph = {
      nodes: new Map(),
      edges: new Map()
    };

    nodeIds.forEach(id => {
      const node = this.nodes.get(id);
      if (node) {
        subgraph.nodes.set(id, node);
      }
    });

    if (includeEdges) {
      this.edges.forEach((edge, id) => {
        if (subgraph.nodes.has(edge.sourceId) && subgraph.nodes.has(edge.targetId)) {
          subgraph.edges.set(id, edge);
        }
      });
    }

    return subgraph;
  }

  exportSubgraph(centerNodeId, depth = 2) {
    const visited = new Set([centerNodeId]);
    const queue = [centerNodeId];

    for (let i = 0; i < depth; i++) {
      const currentQueue = [...queue];
      queue.length = 0;

      currentQueue.forEach(nodeId => {
        const edges = this.getEdgesForNode(nodeId);
        edges.forEach(edge => {
          if (!visited.has(edge.targetId)) {
            visited.add(edge.targetId);
            queue.push(edge.targetId);
          }
        });

        const incoming = this.getIncomingEdges(nodeId);
        incoming.forEach(edge => {
          if (!visited.has(edge.sourceId)) {
            visited.add(edge.sourceId);
            queue.push(edge.sourceId);
          }
        });
      });
    }

    return this.getSubgraph(Array.from(visited));
  }

  // Serialization
  toJSON() {
    return {
      nodes: Array.from(this.nodes.values()).map(n => n.toJSON()),
      edges: Array.from(this.edges.values()).map(e => e.toJSON()),
      metrics: this.metrics,
      settings: this.settings,
      createdAt: this.createdAt
    };
  }

  fromJSON(data) {
    this.nodes.clear();
    this.edges.clear();
    this.adjacencyList.clear();
    this.reverseAdjacencyList.clear();

    data.nodes.forEach(nodeData => {
      const node = new GraphNode(nodeData.id, nodeData.type, nodeData.data);
      node.createdAt = new Date(nodeData.createdAt);
      node.updatedAt = new Date(nodeData.updatedAt);
      node.properties = nodeData.properties;
      this.nodes.set(nodeData.id, node);
      this.adjacencyList.set(nodeData.id, []);
      this.reverseAdjacencyList.set(nodeData.id, []);
    });

    data.edges.forEach(edgeData => {
      const edge = new GraphEdge(edgeData.sourceId, edgeData.targetId, edgeData.relationship, edgeData.weight, edgeData.data);
      edge.createdAt = new Date(edgeData.createdAt);
      edge.properties = edgeData.properties;
      this.edges.set(edgeData.id, edge);
      this.adjacencyList.get(edgeData.sourceId)?.push(edgeData.id);
      this.reverseAdjacencyList.get(edgeData.targetId)?.push(edgeData.id);
    });

    this.metrics = data.metrics;
    this.settings = { ...this.settings, ...data.settings };
  }

  // Cache Management
  invalidateCache() {
    if (this.settings.cacheEnabled) {
      this.cache.clear();
    }
  }

  getCached(key) {
    if (!this.settings.cacheEnabled) return null;
    const item = this.cache.get(key);
    if (item && Date.now() - item.timestamp < 60000) {
      return item.value;
    }
    return null;
  }

  setCache(key, value) {
    if (this.settings.cacheEnabled) {
      this.cache.set(key, { value, timestamp: Date.now() });
    }
  }

  // Pruning
  prune() {
    const now = Date.now();
    if (now - this.lastPruned < this.settings.pruningInterval) return;

    const toDelete = [];
    
    this.nodes.forEach(node => {
      const age = now - node.updatedAt.getTime();
      if (age > 90 * 24 * 60 * 60 * 1000 && node.properties.importance < 0.2) {
        toDelete.push(node.id);
      }
    });

    toDelete.forEach(id => this.deleteNode(id));
    this.lastPruned = now;
    
    this.emitEvent('graphPruned', { nodesRemoved: toDelete.length });
  }

  // Search
  search(query, options = {}) {
    const { type, tags, minImportance, relationships, limit = 50 } = options;
    const results = [];

    this.nodes.forEach(node => {
      let score = 0;
      
      if (type && node.type !== type) return;
      if (minImportance && node.properties.importance < minImportance) return;
      if (tags && !tags.some(tag => node.properties.tags.includes(tag))) return;
      
      const queryLower = query.toLowerCase();
      if (node.properties.name.toLowerCase().includes(queryLower)) score += 10;
      if (node.properties.description.toLowerCase().includes(queryLower)) score += 5;
      if (node.properties.tags.some(tag => tag.toLowerCase().includes(queryLower))) score += 3;
      
      if (relationships) {
        const related = this.getRelatedNodes(node.id, relationships);
        score += related.length * 0.5;
      }

      if (score > 0) {
        results.push({ node, score });
      }
    });

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.node);
  }

  // Visualization Data
  getVisualizationData() {
    const nodes = [];
    const links = [];

    this.nodes.forEach((node, id) => {
      nodes.push({
        id,
        label: node.properties.name,
        type: node.type,
        importance: node.properties.importance,
        centrality: node.properties.centrality,
        group: this.getGroupForType(node.type)
      });
    });

    this.edges.forEach(edge => {
      links.push({
        source: edge.sourceId,
        target: edge.targetId,
        relationship: edge.relationship,
        weight: edge.weight,
        bidirectional: edge.properties.bidirectional
      });
    });

    return { nodes, links };
  }

  getGroupForType(type) {
    const groups = {
      [NodeType.USER]: 1,
      [NodeType.PROJECT]: 2,
      [NodeType.GOAL]: 3,
      [NodeType.TOOL]: 4,
      [NodeType.FAILURE]: 5,
      [NodeType.SUCCESS]: 6,
      [NodeType.DEPENDENCY]: 7,
      [NodeType.KNOWLEDGE]: 8,
      [NodeType.EXECUTION]: 9,
      [NodeType.AGENT]: 10,
      [NodeType.WORKFLOW]: 11,
      [NodeType.POLICY]: 12
    };
    return groups[type] || 0;
  }

  // Statistics
  getStatistics() {
    return {
      totalNodes: this.nodes.size,
      totalEdges: this.edges.size,
      nodeTypes: { ...this.metrics.nodeTypes },
      relationshipTypes: { ...this.metrics.relationshipTypes },
      avgDegree: this.calculateMetrics().avgDegree,
      density: this.calculateMetrics().density,
      connectedComponents: this.countConnectedComponents(),
      mostCentral: this.getMostCentralNodes(null, 5).map(n => ({
        id: n.id,
        name: n.properties.name,
        type: n.type,
        centrality: n.properties.centrality
      })),
      mostConnected: this.getMostConnectedNodes(5).map(n => ({
        id: n.id,
        name: n.properties.name,
        type: n.type,
        connections: this.getEdgesForNode(n.id).length + this.getIncomingEdges(n.id).length
      }))
    };
  }
}

// Singleton instance
const knowledgeGraph = new KnowledgeGraph();
export default knowledgeGraph;