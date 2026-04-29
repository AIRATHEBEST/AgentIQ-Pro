/**
 * DataAnalysisAgent.js - Multi-Format Data Analysis & Visualization Agent
 * Features: 61-80 from the feature list
 */

import { EventEmitter } from 'events';

export class DataIngestionEngine {
  static parseCSV(content) {
    const lines = content.trim().split('\n');
    if (lines.length === 0) return { headers: [], rows: [], schema: {} };

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map(line => {
      const values = this.parseCSVLine(line);
      const row = {};
      headers.forEach((h, i) => {
        row[h] = values[i]?.trim().replace(/^"|"$/g, '') || '';
      });
      return row;
    });

    return { headers, rows, schema: this.inferSchema(rows, headers) };
  }

  static parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  static parseJSON(content) {
    try {
      const data = JSON.parse(content);
      const items = Array.isArray(data) ? data : [data];
      
      if (items.length === 0) return { headers: [], rows: [], schema: {} };

      const headers = [...new Set(items.flatMap(obj => Object.keys(obj)))];
      const rows = items.map(item => {
        const row = {};
        headers.forEach(h => {
          row[h] = item[h] !== undefined ? item[h] : null;
        });
        return row;
      });

      return { headers, rows, schema: this.inferSchema(rows, headers) };
    } catch (e) {
      throw new Error('Invalid JSON format');
    }
  }

  static parseXML(content) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/xml');
    const items = doc.querySelectorAll('item, record, entry');
    
    if (items.length === 0) {
      const root = doc.documentElement;
      const children = [...root.children];
      const headers = children.map(c => c.tagName);
      const rows = [{}];
      children.forEach(c => {
        rows[0][c.tagName] = c.textContent;
      });
      return { headers, rows, schema: this.inferSchema(rows, headers) };
    }

    const headers = [...new Set([...items].flatMap(item => [...item.children].map(c => c.tagName)))];
    const rows = [...items].map(item => {
      const row = {};
      headers.forEach(h => {
        const el = item.querySelector(h);
        row[h] = el ? el.textContent : null;
      });
      return row;
    });

    return { headers, rows, schema: this.inferSchema(rows, headers) };
  }

  static inferSchema(rows, headers) {
    const schema = {};
    
    headers.forEach(header => {
      const values = rows.map(r => r[header]).filter(v => v !== null && v !== undefined && v !== '');
      const types = values.map(v => this.detectType(v));
      const typeCounts = {};
      types.forEach(t => typeCounts[t] = (typeCounts[t] || 0) + 1);
      const primaryType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'string';

      schema[header] = {
        type: primaryType,
        nullable: values.length < rows.length,
        unique: new Set(values).size === values.length,
        sample: values[0],
        stats: this.generateBasicStats(values, primaryType)
      };
    });

    return schema;
  }

  static detectType(value) {
    if (value === null || value === undefined || value === '') return 'null';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (value === 'true' || value === 'false') return 'boolean';
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'datetime';
    if (!isNaN(parseFloat(value)) && value.trim() !== '') return 'number';
    return 'string';
  }

  static generateBasicStats(values, type) {
    if (type === 'number') {
      const nums = values.map(Number).filter(n => !isNaN(n));
      return {
        min: Math.min(...nums),
        max: Math.max(...nums),
        count: nums.length,
        unique: new Set(nums).size
      };
    }
    return {
      count: values.length,
      unique: new Set(values).size,
      mode: this.getMode(values)
    };
  }

  static getMode(values) {
    const counts = {};
    values.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  }
}

export class StatisticalAnalyzer {
  static calculateBasicStats(numbers) {
    if (numbers.length === 0) return null;
    
    const sorted = [...numbers].sort((a, b) => a - b);
    const sum = numbers.reduce((a, b) => a + b, 0);
    const mean = sum / numbers.length;
    const median = numbers.length % 2 === 0
      ? (sorted[numbers.length / 2 - 1] + sorted[numbers.length / 2]) / 2
      : sorted[Math.floor(numbers.length / 2)];

    const variance = numbers.reduce((acc, n) => acc + Math.pow(n - mean, 2), 0) / numbers.length;
    const stdDev = Math.sqrt(variance);

    return {
      count: numbers.length,
      sum,
      mean: Math.round(mean * 100) / 100,
      median,
      stdDev: Math.round(stdDev * 100) / 100,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      range: sorted[sorted.length - 1] - sorted[0]
    };
  }

  static calculateCorrelation(x, y) {
    if (x.length !== y.length || x.length < 2) return null;

    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
    const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
    const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    return denominator === 0 ? 0 : numerator / denominator;
  }

  static detectOutliers(numbers, threshold = 1.5) {
    const stats = this.calculateBasicStats(numbers);
    if (!stats) return [];

    const q1 = this.percentile(numbers, 25);
    const q3 = this.percentile(numbers, 75);
    const iqr = q3 - q1;
    const lowerBound = q1 - threshold * iqr;
    const upperBound = q3 + threshold * iqr;

    return numbers
      .map((v, i) => ({ value: v, index: i }))
      .filter(item => item.value < lowerBound || item.value > upperBound)
      .map(item => ({ index: item.index, value: item.value, type: item.value < lowerBound ? 'low' : 'high' }));
  }

  static percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
  }

  static detectTrend(data, windowSize = 3) {
    if (data.length < windowSize) return 'insufficient_data';

    const movingAvg = [];
    for (let i = windowSize - 1; i < data.length; i++) {
      const window = data.slice(i - windowSize + 1, i + 1);
      movingAvg.push(window.reduce((a, b) => a + b, 0) / windowSize);
    }

    const trend = (movingAvg[movingAvg.length - 1] - movingAvg[0]) / movingAvg[0];
    
    return {
      direction: trend > 0.05 ? 'upward' : trend < -0.05 ? 'downward' : 'stable',
      magnitude: Math.abs(trend),
      movingAverages: movingAvg
    };
  }
}

export class VisualizationGenerator {
  static generateChartConfig(data, chartType = 'bar') {
    const labels = data.map(d => d.label || d.x);
    const values = data.map(d => d.value || d.y);

    const templates = {
      bar: {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Values',
            data: values,
            backgroundColor: 'rgba(54, 162, 235, 0.6)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true } }
        }
      },
      line: {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Values',
            data: values,
            fill: true,
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            borderColor: 'rgba(54, 162, 235, 1)',
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } }
        }
      },
      pie: {
        type: 'pie',
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: [
              'rgba(255, 99, 132, 0.6)',
              'rgba(54, 162, 235, 0.6)',
              'rgba(255, 206, 86, 0.6)',
              'rgba(75, 192, 192, 0.6)',
              'rgba(153, 102, 255, 0.6)'
            ]
          }]
        },
        options: { responsive: true }
      },
      scatter: {
        type: 'scatter',
        data: {
          datasets: [{
            label: 'Data Points',
            data: data.map((d, i) => ({ x: d.x, y: d.y })),
            backgroundColor: 'rgba(54, 162, 235, 0.6)'
          }]
        },
        options: {
          responsive: true,
          scales: { x: { title: { display: true, text: 'X' } }, y: { title: { display: true, text: 'Y' } } }
        }
      }
    };

    return templates[chartType] || templates.bar;
  }

  static generateHeatmap(data, xLabels, yLabels) {
    return {
      type: 'matrix',
      data: {
        xLabels,
        yLabels,
        datasets: [{
          data: data.map(row => row.map(v => v || 0)),
          backgroundColor: data.map(row => 
            row.map(v => {
              const intensity = Math.min(v / 10, 1);
              return `rgba(255, 99, 132, ${intensity * 0.8})`;
            })
          )
        }]
      },
      options: {
        responsive: true,
        plugins: {
          tooltip: { callbacks: { label: (ctx) => `Value: ${ctx.raw}` } }
        }
      }
    };
  }
}

export class FinancialAnalyzer {
  static calculateNPV(cashFlows, discountRate) {
    return cashFlows.reduce((npv, cf, i) => npv + cf / Math.pow(1 + discountRate, i), 0);
  }

  static calculateIRR(cashFlows, guess = 0.1) {
    const maxIterations = 100;
    const tolerance = 0.00001;
    
    let rate = guess;
    for (let i = 0; i < maxIterations; i++) {
      const npv = this.calculateNPV(cashFlows, rate);
      const derivative = cashFlows.reduce((acc, cf, j) => 
        acc - j * cf / Math.pow(1 + rate, j + 1), 0);
      
      const newRate = rate - npv / derivative;
      if (Math.abs(newRate - rate) < tolerance) {
        return newRate * 100;
      }
      rate = newRate;
    }
    return rate * 100;
  }

  static generateCashFlowProjection(initialInvestment, monthlyRevenue, monthlyCosts, months) {
    const cashFlows = [-initialInvestment];
    
    for (let i = 0; i < months; i++) {
      cashFlows.push(monthlyRevenue - monthlyCosts);
    }

    return {
      cashFlows,
      totalRevenue: monthlyRevenue * months,
      totalCosts: monthlyCosts * months,
      netCashFlow: monthlyRevenue * months - monthlyCosts * months - initialInvestment,
      paybackPeriod: this.calculatePaybackPeriod(initialInvestment, monthlyRevenue - monthlyCosts),
      npv: this.calculateNPV(cashFlows, 0.1),
      irr: this.calculateIRR(cashFlows)
    };
  }

  static calculatePaybackPeriod(initial, monthlyNet) {
    if (monthlyNet <= 0) return Infinity;
    return Math.ceil(initial / monthlyNet);
  }

  static scenarioAnalysis(baseCase, variations) {
    return variations.map(variation => ({
      scenario: variation.name,
      result: this.calculateNPV(variation.cashFlows, variation.discountRate),
      change: ((this.calculateNPV(variation.cashFlows, variation.discountRate) - baseCase) / baseCase * 100).toFixed(2) + '%'
    }));
  }
}

export class ABTestAnalyzer {
  static analyzeResults(control, treatment, significanceLevel = 0.05) {
    const controlMean = this.calculateMean(control);
    const treatmentMean = this.calculateMean(treatment);
    
    const pooledStdDev = Math.sqrt(
      this.variance(control) / control.length +
      this.variance(treatment) / treatment.length
    );
    
    const tStatistic = (treatmentMean - controlMean) / pooledStdDev;
    const degreesOfFreedom = control.length + treatment.length - 2;
    const pValue = this.tDistPValue(tStatistic, degreesOfFreedom);
    
    const controlStats = StatisticalAnalyzer.calculateBasicStats(control);
    const treatmentStats = StatisticalAnalyzer.calculateBasicStats(treatment);

    return {
      control: { mean: controlMean, stats: controlStats },
      treatment: { mean: treatmentMean, stats: treatmentStats },
      lift: ((treatmentMean - controlMean) / controlMean * 100).toFixed(2) + '%',
      tStatistic: tStatistic.toFixed(4),
      pValue: pValue.toFixed(6),
      isSignificant: pValue < significanceLevel,
      confidenceLevel: ((1 - pValue) * 100).toFixed(1) + '%',
      recommendation: pValue < significanceLevel 
        ? (treatmentMean > controlMean ? 'Implement treatment' : 'Keep control')
        : 'Need more data'
    };
  }

  static calculateMean(values) {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  static variance(values) {
    const mean = this.calculateMean(values);
    return values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (values.length - 1);
  }

  static tDistPValue(t, df) {
    // Simplified approximation
    const x = df / (df + t * t);
    return 1 - 0.5 * Math.pow(x, df / 2);
  }
}

export class DataAnalysisAgent extends EventEmitter {
  constructor(options = {}) {
    super();
    this.ingestion = new DataIngestionEngine();
    this.stats = new StatisticalAnalyzer();
    this.viz = new VisualizationGenerator();
    this.financial = new FinancialAnalyzer();
    this.abTest = new ABTestAnalyzer();
  }

  async ingestData(content, format) {
    this.emit('data:ingest', { format });

    try {
      let result;
      switch (format.toLowerCase()) {
        case 'csv':
          result = this.ingestion.parseCSV(content);
          break;
        case 'json':
          result = this.ingestion.parseJSON(content);
          break;
        case 'xml':
          result = this.ingestion.parseXML(content);
          break;
        default:
          // Try auto-detect
          if (content.trim().startsWith('[') || content.trim().startsWith('{')) {
            result = this.ingestion.parseJSON(content);
          } else {
            result = this.ingestion.parseCSV(content);
          }
      }

      this.emit('data:ingested', { rowCount: result.rows.length, columns: result.headers });
      return result;
    } catch (error) {
      this.emit('data:error', { error: error.message });
      throw error;
    }
  }

  async analyzeData(data) {
    this.emit('analysis:start', { rowCount: data.rows?.length || 0 });

    const analysis = {
      schema: data.schema || {},
      statistics: {},
      correlations: [],
      outliers: [],
      trends: []
    };

    // Calculate statistics for numeric columns
    const numericColumns = Object.entries(data.schema || {})
      .filter(([_, meta]) => meta.type === 'number')
      .map(([name]) => name);

    for (const column of numericColumns) {
      const values = data.rows.map(r => parseFloat(r[column])).filter(n => !isNaN(n));
      if (values.length > 0) {
        analysis.statistics[column] = this.stats.calculateBasicStats(values);
        analysis.outliers[column] = this.stats.detectOutliers(values);
        
        const trend = this.stats.detectTrend(values);
        if (trend !== 'insufficient_data') {
          analysis.trends[column] = trend;
        }
      }
    }

    // Calculate correlations between numeric columns
    for (let i = 0; i < numericColumns.length; i++) {
      for (let j = i + 1; j < numericColumns.length; j++) {
        const x = data.rows.map(r => parseFloat(r[numericColumns[i]])).filter(n => !isNaN(n));
        const y = data.rows.map(r => parseFloat(r[numericColumns[j]])).filter(n => !isNaN(n));
        
        const minLen = Math.min(x.length, y.length);
        const corr = this.stats.calculateCorrelation(x.slice(0, minLen), y.slice(0, minLen));
        
        if (corr !== null) {
          analysis.correlations.push({
            x: numericColumns[i],
            y: numericColumns[j],
            coefficient: Math.round(corr * 100) / 100,
            strength: Math.abs(corr) > 0.7 ? 'strong' : Math.abs(corr) > 0.4 ? 'moderate' : 'weak'
          });
        }
      }
    }

    this.emit('analysis:complete', analysis);
    return analysis;
  }

  async cleanData(data, strategy = 'default') {
    const cleaned = JSON.parse(JSON.stringify(data));
    
    const strategies = {
      default: {
        missing: 'flag',    // Mark rows with missing values
        duplicates: 'remove',
        outliers: 'flag'
      },
      aggressive: {
        missing: 'impute',
        duplicates: 'remove',
        outliers: 'remove'
      },
      conservative: {
        missing: 'keep',
        duplicates: 'keep',
        outliers: 'keep'
      }
    };

    const config = strategies[strategy] || strategies.default;

    // Remove duplicates
    const seen = new Set();
    cleaned.rows = cleaned.rows.filter((row, i) => {
      const key = JSON.stringify(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Flag rows with missing values
    cleaned.rows = cleaned.rows.map(row => {
      const hasMissing = Object.values(row).some(v => v === null || v === undefined || v === '');
      return { ...row, _hasMissing: hasMissing };
    });

    // Flag outliers
    const numericColumns = Object.entries(cleaned.schema || {})
      .filter(([_, meta]) => meta.type === 'number')
      .map(([name]) => name);

    for (const column of numericColumns) {
      const values = cleaned.rows.map(r => parseFloat(r[column])).filter(n => !isNaN(n));
      const outliers = this.stats.detectOutliers(values);
      const outlierIndices = new Set(outliers.map(o => o.index));
      
      cleaned.rows = cleaned.rows.map((row, i) => ({
        ...row,
        [`_${column}_outlier`]: outlierIndices.has(i)
      }));
    }

    return cleaned;
  }

  async generateVisualization(data, chartType = 'bar') {
    const numericColumns = Object.entries(data.schema || {})
      .filter(([_, meta]) => meta.type === 'number')
      .map(([name]) => name);

    if (numericColumns.length === 0) {
      // Use categorical data
      const firstCat = Object.entries(data.schema || {})
        .find(([_, meta]) => meta.type === 'string');
      
      if (firstCat) {
        const counts = {};
        data.rows.forEach(row => {
          const val = row[firstCat[0]];
          counts[val] = (counts[val] || 0) + 1;
        });

        return this.viz.generateChartConfig(
          Object.entries(counts).map(([label, value]) => ({ label, value })),
          chartType
        );
      }
    }

    // Use first numeric column vs label
    const chartData = data.rows.map(row => ({
      label: row[data.headers[0]] || data.rows.indexOf(row),
      value: parseFloat(row[numericColumns[0]]) || 0
    }));

    return this.viz.generateChartConfig(chartData, chartType);
  }

  async createDashboard(data) {
    const widgets = [];

    // Overview stats
    widgets.push({
      type: 'stats',
      title: 'Overview',
      data: {
        totalRows: data.rows.length,
        totalColumns: data.headers.length,
        numericColumns: Object.values(data.schema).filter(s => s.type === 'number').length
      }
    });

    // Visualizations
    const numericColumns = Object.entries(data.schema || {})
      .filter(([_, meta]) => meta.type === 'number')
      .map(([name]) => name);

    for (const col of numericColumns.slice(0, 4)) {
      const chartData = data.rows.map((row, i) => ({
        label: i,
        value: parseFloat(row[col]) || 0
      }));
      widgets.push({
        type: 'chart',
        title: col,
        config: this.viz.generateChartConfig(chartData, 'bar')
      });
    }

    // Correlation matrix
    if (numericColumns.length > 1) {
      widgets.push({
        type: 'correlation',
        title: 'Correlations',
        data: (await this.analyzeData(data)).correlations
      });
    }

    return { widgets };
  }

  async performFinancialAnalysis(projections) {
    return {
      npv: this.financial.calculateNPV(projections.cashFlows, projections.discountRate),
      irr: this.financial.calculateIRR(projections.cashFlows),
      cashFlowProjection: this.financial.generateCashFlowProjection(
        projections.initialInvestment,
        projections.monthlyRevenue,
        projections.monthlyCosts,
        projections.months
      ),
      scenarios: this.financial.scenarioAnalysis(
        projections.baseNPV,
        projections.variations
      )
    };
  }

  async analyzeABTest(controlData, treatmentData) {
    return this.abTest.analyzeResults(controlData, treatmentData);
  }

  async generateReport(data, analysis) {
    return {
      title: 'Data Analysis Report',
      timestamp: new Date().toISOString(),
      overview: {
        totalRows: data.rows.length,
        totalColumns: data.headers.length,
        columns: data.headers
      },
      schema: data.schema,
      statistics: analysis.statistics,
      correlations: analysis.correlations,
      trends: analysis.trends,
      recommendations: this.generateRecommendations(analysis)
    };
  }

  generateRecommendations(analysis) {
    const recommendations = [];

    if (analysis.correlations.length > 0) {
      const strongCorr = analysis.correlations.filter(c => c.strength === 'strong');
      if (strongCorr.length > 0) {
        recommendations.push({
          type: 'insight',
          message: `Found ${strongCorr.length} strong correlations that may warrant further investigation`
        });
      }
    }

    const hasOutliers = Object.values(analysis.outliers || {}).some(o => o.length > 0);
    if (hasOutliers) {
      recommendations.push({
        type: 'warning',
        message: 'Outliers detected in some columns - consider reviewing data quality'
      });
    }

    const trends = Object.entries(analysis.trends || {}).filter(([_, t]) => t.direction !== 'stable');
    if (trends.length > 0) {
      recommendations.push({
        type: 'info',
        message: `${trends.length} columns show significant trends`
      });
    }

    return recommendations;
  }
}

export default DataAnalysisAgent;