/**
 * WebResearchAgent.js - Advanced Multi-Source Web Research Agent
 * Features: 41-60 from the feature list
 */

import { EventEmitter } from 'events';

export class SourceCredibilityDatabase {
  static HIGH_TRUST_DOMAINS = [
    'nature.com', 'science.org', 'arxiv.org', 'ieee.org', 'acm.org',
    'jstor.org', 'pubmed.ncbi.nlm.nih.gov', 'scholar.google.com',
    'reuters.com', 'apnews.com', 'bbc.com', 'npr.org', 'theguardian.com',
    'nytimes.com', 'washingtonpost.com', 'wsj.com', 'economist.com',
    'forbes.com', 'bloomberg.com', 'cnn.com',
    'wikipedia.org', 'wikimedia.org',
    'gov', 'edu', 'org'
  ];

  static DOMAIN_REPUTATIONS = {
    'nature.com': 95, 'science.org': 95, 'arxiv.org': 85, 'ieee.org': 90,
    'reuters.com': 88, 'apnews.com': 85, 'bbc.com': 86, 'npr.org': 84,
    'nytimes.com': 82, 'wsj.com': 80, 'forbes.com': 75, 'bloomberg.com': 82,
    'medium.com': 50, 'reddit.com': 40, 'twitter.com': 30, 'facebook.com': 20,
    'blogspot.com': 35, 'wordpress.com': 40
  };

  static calculateCredibility(url, metadata = {}) {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    
    // Domain reputation score (40% weight)
    let domainScore = 50;
    for (const trusted of SourceCredibilityDatabase.HIGH_TRUST_DOMAINS) {
      if (domain.includes(trusted)) {
        domainScore = SourceCredibilityDatabase.DOMAIN_REPUTATIONS[domain] || 80;
        break;
      }
    }
    
    // Author presence score (15% weight)
    const hasAuthor = metadata.author ? 1 : 0;
    const hasOrcid = metadata.orcidId ? 1 : 0;
    const authorScore = (hasAuthor * 0.6 + hasOrcid * 0.4) * 100;
    
    // Date recency score (10% weight)
    const ageInDays = metadata.publishDate 
      ? (Date.now() - new Date(metadata.publishDate).getTime()) / (1000 * 60 * 60 * 24)
      : 365;
    const dateScore = Math.max(0, 100 - ageInDays * 0.1);
    
    // Citations/references score (15% weight)
    const citationsScore = Math.min(100, (metadata.citationCount || 0) * 2);
    
    // HTTPS security (5% weight)
    const securityScore = url.startsWith('https') ? 100 : 0;
    
    // Content quality analysis (15% weight)
    const contentQualityScore = this.analyzeContentQuality(metadata.content || '');
    
    return Math.round(
      domainScore * 0.40 +
      authorScore * 0.15 +
      dateScore * 0.10 +
      citationsScore * 0.15 +
      securityScore * 0.05 +
      contentQualityScore * 0.15
    );
  }

  static analyzeContentQuality(content) {
    if (!content) return 50;
    
    const academicTerms = ['study', 'research', 'analysis', 'hypothesis', 'methodology', 
                          'conclusion', 'findings', 'peer-reviewed', 'abstract'];
    const sensationalTerms = ['shocking', 'unbelievable', 'must-see', 'you won\'t believe',
                             'breaking', 'exclusive', 'secret'];
    
    let score = 50;
    const lowerContent = content.toLowerCase();
    
    // Academic term bonus
    const academicMatches = academicTerms.filter(t => lowerContent.includes(t)).length;
    score += academicMatches * 5;
    
    // Sensational term penalty
    const sensationalMatches = sensationalTerms.filter(t => lowerContent.includes(t)).length;
    score -= sensationalMatches * 10;
    
    return Math.max(0, Math.min(100, score));
  }
}

export class CrossReferenceEngine {
  constructor() {
    this.cache = new Map();
  }

  async verifyClaim(claim, sources) {
    const cacheKey = `${claim}:${sources.map(s => s.url).join('|')}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const normalizedClaim = claim.toLowerCase().trim();
    const claimWords = new Set(normalizedClaim.split(/\s+/).filter(w => w.length > 3));

    const results = sources.map(source => {
      const sourceWords = new Set(
        (source.content || '').toLowerCase().split(/\s+/).filter(w => w.length > 3)
      );
      
      const overlap = [...claimWords].filter(w => sourceWords.has(w)).length;
      const similarity = overlap / claimWords.size;
      
      const supports = similarity > 0.6;
      const contradicts = source.contradicts?.some(c => 
        normalizedClaim.includes(c.toLowerCase())
      );

      return {
        source: source.url,
        similarity: Math.round(similarity * 100),
        status: contradicts ? 'contradicts' : supports ? 'supports' : 'neutral',
        evidence: this.extractEvidence(source.content, claim)
      };
    });

    const verification = {
      claim,
      supportingSources: results.filter(r => r.status === 'supports'),
      contradictingSources: results.filter(r => r.status === 'contradicts'),
      neutralSources: results.filter(r => r.status === 'neutral'),
      consensus: this.calculateConsensus(results),
      confidence: this.calculateConfidence(results)
    };

    this.cache.set(cacheKey, verification);
    return verification;
  }

  extractEvidence(content, claim) {
    const sentences = content.split(/[.!?]+/);
    const claimWords = claim.toLowerCase().split(/\s+/);
    
    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();
      const matches = claimWords.filter(w => lowerSentence.includes(w)).length;
      if (matches >= 3) {
        return sentence.trim();
      }
    }
    return sentences[0]?.trim() || '';
  }

  calculateConsensus(results) {
    const supporting = results.filter(r => r.status === 'supports').length;
    const contradicting = results.filter(r => r.status === 'contradicts').length;
    const total = supporting + contradicting;
    
    if (total === 0) return 'inconclusive';
    return supporting > contradicting ? 'supported' : 
           contradicting > supporting ? 'disputed' : 'mixed';
  }

  calculateConfidence(results) {
    const sources = results.filter(r => r.similarity > 50);
    if (sources.length === 0) return 0;
    
    const avgSimilarity = sources.reduce((sum, s) => sum + s.similarity, 0) / sources.length;
    const sourceCountBonus = Math.min(20, sources.length * 5);
    
    return Math.min(100, Math.round(avgSimilarity * 0.8 + sourceCountBonus));
  }
}

export class TemporalGeoFilter {
  constructor() {
    this.REGIONS = {
      'north_america': ['us', 'ca', 'mx', 'usa', 'canada', 'mexico'],
      'europe': ['uk', 'gb', 'de', 'fr', 'es', 'it', 'eu', 'europe'],
      'asia': ['cn', 'jp', 'kr', 'in', 'sg', 'hk', 'asia', 'china', 'japan', 'india'],
      'australia': ['au', 'nz', 'australia', 'new zealand'],
      'africa': ['za', 'ng', 'ke', 'africa', 'south africa'],
      'south_america': ['br', 'ar', 'cl', 'south america', 'brazil']
    };
  }

  filterByDateRange(results, startDate, endDate) {
    if (!startDate && !endDate) return results;

    return results.map(result => {
      const publishDate = result.metadata?.publishDate 
        ? new Date(result.metadata.publishDate) 
        : null;
      
      if (!publishDate) {
        result.relevanceScore = 50;
        return result;
      }

      let score = 100;
      const ageInDays = (Date.now() - publishDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (startDate && publishDate < new Date(startDate)) {
        score -= 30;
      }
      if (endDate && publishDate > new Date(endDate)) {
        score -= 30;
      }
      
      // Exponential decay for old content
      score *= Math.exp(-ageInDays * 0.001);
      
      result.relevanceScore = Math.max(0, Math.round(score));
      return result;
    }).sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  filterByRegion(results, targetRegion) {
    if (!targetRegion) return results;

    const regionKeywords = this.REGIONS[targetRegion] || [targetRegion];
    const regionLower = regionKeywords.map(r => r.toLowerCase());

    return results.map(result => {
      const content = (result.content + ' ' + (result.title || '')).toLowerCase();
      const matched = regionLower.filter(r => content.includes(r)).length;
      
      result.regionRelevance = matched > 0 ? Math.min(100, matched * 30) : 0;
      return result;
    }).sort((a, b) => b.regionRelevance - a.regionRelevance);
  }
}

export class SentimentAnalyzer {
  analyze(text) {
    const positiveWords = [
      'excellent', 'amazing', 'great', 'positive', 'success', 'improvement',
      'growth', 'innovation', 'breakthrough', 'achievement', 'benefits',
      'opportunity', 'promising', 'advantage', 'effective'
    ];
    const negativeWords = [
      'bad', 'terrible', 'negative', 'failure', 'decline', 'crisis',
      'problem', 'risk', 'danger', 'loss', 'concern', 'issue',
      'challenge', 'threat', 'deficit', 'decrease'
    ];
    const neutralWords = [
      'report', 'study', 'analysis', 'data', 'according', 'states',
      'says', 'according to', 'reported', 'announced'
    ];

    const lower = text.toLowerCase();
    let score = 50;
    
    const positiveCount = positiveWords.filter(w => lower.includes(w)).length;
    const negativeCount = negativeWords.filter(w => lower.includes(w)).length;
    const neutralCount = neutralWords.filter(w => lower.includes(w)).length;

    score += positiveCount * 5 - negativeCount * 7;
    score -= neutralCount * 2;
    
    const sentiment = score > 55 ? 'positive' : score < 45 ? 'negative' : 'neutral';
    
    return {
      score: Math.max(0, Math.min(100, score)),
      sentiment,
      confidence: Math.min(100, (positiveCount + negativeCount) * 15),
      breakdown: { positive: positiveCount, negative: negativeCount, neutral: neutralCount }
    };
  }
}

export class WebResearchAgent extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxConcurrentSources = options.maxConcurrentSources || 5;
    this.maxResultsPerSource = options.maxResultsPerSource || 10;
    this.credibilityThreshold = options.credibilityThreshold || 50;
    this.temporalFilter = new TemporalGeoFilter();
    this.crossReferenceEngine = new CrossReferenceEngine();
    this.sentimentAnalyzer = new SentimentAnalyzer();
    this.researchCache = new Map();
  }

  async conductWideResearch(query, options = {}) {
    const startTime = Date.now();
    this.emit('research:start', { query, options });

    try {
      // Decompose query into search aspects
      const searchAspects = this.decomposeQuery(query);
      
      // Execute parallel searches
      const searchPromises = searchAspects.map(aspect => 
        this.searchSource(aspect, options)
      );
      
      const results = await Promise.allSettled(searchPromises);
      
      // Aggregate and deduplicate
      const aggregated = this.aggregateResults(results);
      
      // Apply filters
      let filtered = aggregated;
      if (options.dateRange) {
        filtered = this.temporalFilter.filterByDateRange(
          filtered, options.dateRange.start, options.dateRange.end
        );
      }
      if (options.region) {
        filtered = this.temporalFilter.filterByRegion(filtered, options.region);
      }
      
      // Score credibility
      filtered = filtered.map(result => ({
        ...result,
        credibility: SourceCredibilityDatabase.calculateCredibility(
          result.url, result.metadata
        )
      }));

      // Filter by credibility threshold
      filtered = filtered.filter(r => r.credibility >= this.credibilityThreshold);

      // Cross-reference verification
      const topClaims = this.extractKeyClaims(filtered.slice(0, 5));
      const verifications = await Promise.all(
        topClaims.map(claim => this.crossReferenceEngine.verifyClaim(claim, filtered))
      );

      // Generate comprehensive report
      const report = this.generateResearchReport(query, filtered, verifications, {
        sentiment: options.includeSentiment ? this.analyzeSentimentTrend(filtered) : null
      });

      const duration = Date.now() - startTime;
      this.emit('research:complete', { report, duration, sourceCount: filtered.length });
      
      return report;

    } catch (error) {
      this.emit('research:error', { error: error.message });
      throw error;
    }
  }

  decomposeQuery(query) {
    const aspects = [];
    
    // Main query
    aspects.push({ type: 'web', query });
    
    // Academic sources
    aspects.push({ type: 'academic', query });
    
    // News sources
    aspects.push({ type: 'news', query });
    
    // Social media
    aspects.push({ type: 'social', query });
    
    // Competitor/industry specific
    if (query.match(/\b(competitor|comparison|alternative|vs|versus)\b/i)) {
      aspects.push({ type: 'comparison', query });
    }
    
    // Technical query
    if (query.match(/\b(how to|install|setup|configure|api|code|developer)\b/i)) {
      aspects.push({ type: 'technical', query });
    }
    
    return aspects;
  }

  async searchSource(aspect, options = {}) {
    const cacheKey = `${aspect.type}:${aspect.query}`;
    if (this.researchCache.has(cacheKey)) {
      return this.researchCache.get(cacheKey);
    }

    try {
      let results = [];
      
      switch (aspect.type) {
        case 'web':
          results = await this.searchWeb(aspect.query);
          break;
        case 'academic':
          results = await this.searchAcademic(aspect.query);
          break;
        case 'news':
          results = await this.searchNews(aspect.query);
          break;
        case 'social':
          results = await this.searchSocial(aspect.query);
          break;
        case 'comparison':
          results = await this.searchComparison(aspect.query);
          break;
        case 'technical':
          results = await this.searchTechnical(aspect.query);
          break;
      }

      this.emit('search:progress', { type: aspect.type, count: results.length });
      
      const result = { type: aspect.type, results, timestamp: Date.now() };
      this.researchCache.set(cacheKey, result);
      return result;

    } catch (error) {
      this.emit('search:error', { type: aspect.type, error: error.message });
      return { type: aspect.type, results: [], error: error.message };
    }
  }

  async searchWeb(query) {
    // Simulated web search - in production, integrate with DuckDuckGo or similar
    return this.simulateSearch('web', query);
  }

  async searchAcademic(query) {
    // Simulated academic search - integrate with arXiv, PubMed, Google Scholar API
    return this.simulateSearch('academic', query);
  }

  async searchNews(query) {
    // Simulated news search - integrate with NewsAPI or similar
    return this.simulateSearch('news', query);
  }

  async searchSocial(query) {
    // Simulated social search - integrate with Reddit, Twitter API
    return this.simulateSearch('social', query);
  }

  async searchComparison(query) {
    return this.simulateSearch('comparison', query);
  }

  async searchTechnical(query) {
    return this.simulateSearch('technical', query);
  }

  simulateSearch(type, query) {
    // Simulated results for demonstration
    const templates = {
      web: {
        title: `Web result for: ${query}`,
        content: `This is simulated content about ${query}. It contains relevant information for the search query.`,
        url: `https://example.com/search?q=${encodeURIComponent(query)}`,
        metadata: { author: 'Web Author', publishDate: new Date().toISOString() }
      },
      academic: {
        title: `Academic Paper: ${query}`,
        content: `This is simulated academic content about ${query} with proper citations and methodology.`,
        url: `https://arxiv.org/abs/example`,
        metadata: { author: 'Dr. Research', orcidId: '0000-0000-0000-0000', citationCount: 45 }
      },
      news: {
        title: `News: ${query}`,
        content: `Latest news coverage about ${query} with balanced reporting.`,
        url: `https://news.example.com/article`,
        metadata: { author: 'News Reporter', publishDate: new Date().toISOString() }
      },
      social: {
        title: `Discussion: ${query}`,
        content: `Community discussion about ${query} with various perspectives.`,
        url: `https://reddit.com/r/example`,
        metadata: { author: 'Community Member', publishDate: new Date().toISOString() }
      },
      comparison: {
        title: `Comparison: ${query}`,
        content: `Detailed comparison of options for ${query}.`,
        url: `https://compare.example.com`,
        metadata: { author: 'Reviewer', publishDate: new Date().toISOString() }
      },
      technical: {
        title: `Technical Documentation: ${query}`,
        content: `Technical documentation and guides for ${query}.`,
        url: `https://docs.example.com`,
        metadata: { author: 'Tech Writer', publishDate: new Date().toISOString() }
      }
    };

    const template = templates[type] || templates.web;
    const results = [];
    
    for (let i = 0; i < Math.min(this.maxResultsPerSource, 5); i++) {
      results.push({
        ...template,
        title: `${template.title} (Result ${i + 1})`,
        source: type,
        searchPosition: i + 1,
        relevanceScore: 100 - (i * 10)
      });
    }
    
    return results;
  }

  aggregateResults(results) {
    const aggregated = [];
    const seenUrls = new Set();

    for (const result of results) {
      if (result.status === 'rejected') continue;
      
      for (const item of result.value.results || []) {
        if (!seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          aggregated.push(item);
        }
      }
    }

    // Sort by relevance
    return aggregated.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
  }

  extractKeyClaims(results) {
    const claims = [];
    for (const result of results.slice(0, 5)) {
      const sentences = (result.content || '').split(/[.!?]+/);
      for (const sentence of sentences.slice(0, 3)) {
        if (sentence.split(' ').length >= 5 && sentence.split(' ').length <= 30) {
          claims.push(sentence.trim());
        }
      }
    }
    return claims.slice(0, 5);
  }

  analyzeSentimentTrend(results) {
    const sentiments = results.map(r => this.sentimentAnalyzer.analyze(r.content || ''));
    const avgScore = sentiments.reduce((sum, s) => sum + s.score, 0) / sentiments.length;
    const distribution = {
      positive: sentiments.filter(s => s.sentiment === 'positive').length,
      neutral: sentiments.filter(s => s.sentiment === 'neutral').length,
      negative: sentiments.filter(s => s.sentiment === 'negative').length
    };

    return {
      averageScore: Math.round(avgScore),
      overallSentiment: avgScore > 55 ? 'positive' : avgScore < 45 ? 'negative' : 'neutral',
      distribution,
      confidence: Math.min(100, results.length * 10)
    };
  }

  generateResearchReport(query, sources, verifications, options = {}) {
    const bySourceType = this.groupBySourceType(sources);
    
    return {
      query,
      timestamp: new Date().toISOString(),
      summary: this.generateSummary(sources),
      sourceCount: sources.length,
      sources: {
        web: bySourceType.web || [],
        academic: bySourceType.academic || [],
        news: bySourceType.news || [],
        social: bySourceType.social || []
      },
      credibilityDistribution: this.getCredibilityDistribution(sources),
      verifications,
      sentimentTrend: options.sentiment,
      recommendations: this.generateRecommendations(sources, verifications),
      citations: this.generateCitations(sources)
    };
  }

  groupBySourceType(sources) {
    return sources.reduce((groups, source) => {
      const type = source.source || 'web';
      if (!groups[type]) groups[type] = [];
      groups[type].push(source);
      return groups;
    }, {});
  }

  getCredibilityDistribution(sources) {
    const distribution = { high: 0, medium: 0, low: 0 };
    for (const source of sources) {
      if (source.credibility >= 70) distribution.high++;
      else if (source.credibility >= 40) distribution.medium++;
      else distribution.low++;
    }
    return distribution;
  }

  generateSummary(sources) {
    const topSources = sources.slice(0, 3);
    const avgCredibility = sources.reduce((sum, s) => sum + s.credibility, 0) / sources.length;
    
    return `Research on "${sources[0]?.searchPosition ? 'query' : 'topic'}" returned ${sources.length} sources. ` +
      `Top sources include: ${topSources.map(s => s.title).join(', ')}. ` +
      `Average source credibility: ${Math.round(avgCredibility)}%.`;
  }

  generateRecommendations(sources, verifications) {
    const recommendations = [];
    
    if (verifications.some(v => v.consensus === 'disputed')) {
      recommendations.push({
        type: 'warning',
        message: 'Some claims have conflicting evidence. Consider verifying with additional sources.'
      });
    }
    
    const lowCredibilityCount = sources.filter(s => s.credibility < 50).length;
    if (lowCredibilityCount > sources.length * 0.3) {
      recommendations.push({
        type: 'info',
        message: 'Some sources have low credibility. Prioritize high-trust sources for critical decisions.'
      });
    }
    
    recommendations.push({
      type: 'action',
      message: 'Cross-reference key claims with academic papers for best accuracy.'
    });
    
    return recommendations;
  }

  generateCitations(sources) {
    return sources.map((source, index) => ({
      number: index + 1,
      format: 'apa',
      text: `${source.metadata?.author || 'Unknown'}, ${source.title}, ${source.url}`
    }));
  }

  // Public API methods
  async searchWikipedia(query) {
    return this.searchWeb(`${query} site:wikipedia.org`);
  }

  async searchPatents(query) {
    // Integrate with USPTO or EPO API
    return this.simulateSearch('academic', `${query} patent`);
  }

  async getCompetitorAnalysis(topic) {
    return this.conductWideResearch(`${topic} competitor comparison`, {
      includeSentiment: true
    });
  }

  async getProductSpecs(product) {
    return this.conductWideResearch(`${product} specifications`, {
      sourceType: ['web', 'review']
    });
  }

  clearCache() {
    this.researchCache.clear();
  }
}

export default WebResearchAgent;