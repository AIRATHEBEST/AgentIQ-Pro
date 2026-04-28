/**
 * FilesystemIntelligence.js
 * Intelligent filesystem operations with project scanning, code analysis,
 * semantic search, dependency tracking, and change management.
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');

// ============================================================================
// CUSTOM ERRORS
// ============================================================================

class FilesystemError extends Error {
  constructor(message, code = 'FILESYSTEM_ERROR') {
    super(message);
    this.name = 'FilesystemError';
    this.code = code;
  }
}

class FileNotFoundError extends FilesystemError {
  constructor(filePath) {
    super(`File not found: ${filePath}`, 'FILE_NOT_FOUND');
    this.filePath = filePath;
  }
}

class PermissionError extends FilesystemError {
  constructor(filePath) {
    super(`Permission denied: ${filePath}`, 'PERMISSION_DENIED');
    this.filePath = filePath;
  }
}

class FileOperationError extends FilesystemError {
  constructor(operation, filePath, originalError) {
    super(`Failed to ${operation} ${filePath}: ${originalError.message}`, 'FILE_OPERATION_FAILED');
    this.operation = operation;
    this.filePath = filePath;
    this.originalError = originalError;
  }
}

// ============================================================================
// FILE METADATA
// ============================================================================

class FileMetadata {
  constructor(filePath, stats) {
    this.path = filePath;
    this.name = path.basename(filePath);
    this.extension = path.extname(filePath);
    this.size = stats.size;
    this.created = stats.birthtime;
    this.modified = stats.mtime;
    this.isDirectory = stats.isDirectory();
    this.isFile = stats.isFile();
    this.isSymlink = stats.isSymbolicLink();
    this.permissions = this.parsePermissions(stats.mode);
    this.contentHash = null;
  }

  parsePermissions(mode) {
    const permissions = {};
    permissions.owner = {
      read: Boolean(mode & 0o400),
      write: Boolean(mode & 0o200),
      execute: Boolean(mode & 0o100)
    };
    permissions.group = {
      read: Boolean(mode & 0o040),
      write: Boolean(mode & 0o020),
      execute: Boolean(mode & 0o010)
    };
    permissions.others = {
      read: Boolean(mode & 0o004),
      write: Boolean(mode & 0o002),
      execute: Boolean(mode & 0o001)
    };
    return permissions;
  }

  toJSON() {
    return {
      path: this.path,
      name: this.name,
      extension: this.extension,
      size: this.size,
      created: this.created.toISOString(),
      modified: this.modified.toISOString(),
      isDirectory: this.isDirectory,
      isFile: this.isFile,
      isSymlink: this.isSymlink,
      permissions: this.permissions,
      contentHash: this.contentHash
    };
  }
}

// ============================================================================
// CODE STRUCTURE
// ============================================================================

class CodeStructure {
  constructor(filePath) {
    this.filePath = filePath;
    this.language = this.detectLanguage(filePath);
    this.functions = [];
    this.classes = [];
    this.imports = [];
    this.exports = [];
    this.interfaces = [];
    this.types = [];
    this.decorators = [];
    this.comments = {
      singleLine: [],
      multiLine: [],
      jsDoc: []
    };
    this.metrics = {
      linesOfCode: 0,
      blankLines: 0,
      commentLines: 0,
      cyclomaticComplexity: 0
    };
  }

  detectLanguage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.rb': 'ruby',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.cpp': 'cpp',
      '.c': 'c',
      '.csharp': 'csharp',
      '.cs': 'csharp',
      '.php': 'php',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.less': 'less',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.md': 'markdown',
      '.sql': 'sql',
      '.sh': 'bash',
      '.bash': 'bash',
      '.zsh': 'bash'
    };
    return languageMap[ext] || 'unknown';
  }

  addFunction(func) {
    this.functions.push({
      name: func.name,
      visibility: func.visibility || 'public',
      parameters: func.parameters || [],
      returnType: func.returnType,
      lineStart: func.lineStart,
      lineEnd: func.lineEnd,
      async: func.async || false,
      generator: func.generator || false,
      decorators: func.decorators || []
    });
  }

  addClass(cls) {
    this.classes.push({
      name: cls.name,
      visibility: cls.visibility || 'public',
      extends: cls.extends,
      implements: cls.implements || [],
      lineStart: cls.lineStart,
      lineEnd: cls.lineEnd,
      methods: cls.methods || [],
      properties: cls.properties || [],
      decorators: cls.decorators || []
    });
  }

  addImport(imp) {
    this.imports.push({
      source: imp.source,
      default: imp.default,
      named: imp.named || [],
      namespace: imp.namespace,
      line: imp.line
    });
  }

  addExport(exp) {
    this.exports.push({
      name: exp.name,
      type: exp.type, // 'named', 'default', 'all'
      line: exp.line
    });
  }

  calculateMetrics(content) {
    const lines = content.split('\n');
    this.metrics.linesOfCode = lines.length;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '') {
        this.metrics.blankLines++;
      } else if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
        this.metrics.commentLines++;
      } else if (trimmed.startsWith('/*') || trimmed.startsWith('<!--')) {
        this.metrics.commentLines++;
      }
    }
  }

  toJSON() {
    return {
      filePath: this.filePath,
      language: this.language,
      functions: this.functions,
      classes: this.classes,
      imports: this.imports,
      exports: this.exports,
      interfaces: this.interfaces,
      types: this.types,
      decorators: this.decorators,
      comments: this.comments,
      metrics: this.metrics
    };
  }
}

// ============================================================================
// PROJECT ANALYSIS
// ============================================================================

class ProjectAnalysis {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.language = null;
    this.framework = null;
    this.packageManager = null;
    this.structure = {
      sourceDirs: [],
      testDirs: [],
      configFiles: [],
      buildFiles: [],
      docsDirs: [],
      publicDirs: [],
      src: [],
      components: [],
      pages: [],
      routes: [],
      services: [],
      utils: [],
      hooks: [],
      stores: []
    };
    this.dependencies = {
      production: [],
      development: [],
      peer: [],
      optional: []
    };
    this.devTools = {
      linters: [],
      formatters: [],
      testRunners: [],
      bundlers: []
    };
    this.metrics = {
      totalFiles: 0,
      totalLines: 0,
      codeFiles: 0,
      testFiles: 0,
      configFiles: 0,
      averageFileSize: 0,
      largestFiles: [],
      fileTypeDistribution: {}
    };
    this.codeQuality = {
      codeClimate: null,
      technicalDebt: null,
      maintainability: null
    };
    this.scanDate = new Date();
  }

  addSourceDirectory(dir) {
    this.structure.sourceDirs.push(dir);
  }

  addDependency(name, version, type = 'production') {
    const depType = type === 'dev' ? 'development' : type;
    if (!this.dependencies[depType]) {
      this.dependencies[depType] = [];
    }
    this.dependencies[depType].push({ name, version });
  }

  addMetric(metric, value) {
    this.metrics[metric] = value;
  }

  toJSON() {
    return {
      projectRoot: this.projectRoot,
      language: this.language,
      framework: this.framework,
      packageManager: this.packageManager,
      structure: this.structure,
      dependencies: this.dependencies,
      devTools: this.devTools,
      metrics: this.metrics,
      codeQuality: this.codeQuality,
      scanDate: this.scanDate.toISOString()
    };
  }
}

// ============================================================================
// SEMANTIC SEARCH RESULT
// ============================================================================

class SearchResult {
  constructor(filePath, lineNumber, lineContent, matchContext, relevanceScore) {
    this.filePath = filePath;
    this.lineNumber = lineNumber;
    this.lineContent = lineContent;
    this.matchContext = matchContext;
    this.relevanceScore = relevanceScore;
    this.matches = [];
    this.snippet = this.generateSnippet(lineContent, matchContext);
  }

  generateSnippet(lineContent, matchContext) {
    const maxLength = 200;
    let snippet = lineContent;
    
    if (snippet.length > maxLength) {
      const index = snippet.indexOf(matchContext);
      if (index !== -1) {
        const start = Math.max(0, index - 50);
        const end = Math.min(snippet.length, index + matchContext.length + 150);
        snippet = (start > 0 ? '...' : '') + 
                  snippet.substring(start, end) + 
                  (end < snippet.length ? '...' : '');
      } else {
        snippet = snippet.substring(0, maxLength) + '...';
      }
    }
    
    return snippet;
  }

  toJSON() {
    return {
      filePath: this.filePath,
      lineNumber: this.lineNumber,
      lineContent: this.lineContent,
      matchContext: this.matchContext,
      relevanceScore: this.relevanceScore,
      matches: this.matches,
      snippet: this.snippet
    };
  }
}

// ============================================================================
// DEPENDENCY GRAPH NODE
// ============================================================================

class DependencyNode {
  constructor(name, type = 'package') {
    this.name = name;
    this.type = type; // 'package', 'file', 'module'
    this.dependencies = [];
    this.dependents = [];
    this.version = null;
    this.devOnly = false;
    this.optional = false;
    this.conflicts = [];
    this.metadata = {};
  }

  addDependency(node) {
    if (!this.dependencies.includes(node.name)) {
      this.dependencies.push(node.name);
    }
  }

  addDependent(node) {
    if (!this.dependents.includes(node.name)) {
      this.dependents.push(node.name);
    }
  }

  toJSON() {
    return {
      name: this.name,
      type: this.type,
      dependencies: this.dependencies,
      dependents: this.dependents,
      version: this.version,
      devOnly: this.devOnly,
      optional: this.optional,
      conflicts: this.conflicts,
      metadata: this.metadata
    };
  }
}

// ============================================================================
// FILE CHANGE TRACKER
// ============================================================================

class FileChange {
  constructor(filePath, changeType, previousHash, currentHash, timestamp) {
    this.filePath = filePath;
    this.changeType = changeType; // 'created', 'modified', 'deleted', 'renamed'
    this.previousHash = previousHash;
    this.currentHash = currentHash;
    this.timestamp = timestamp;
    this.diff = null;
    this.author = null;
    this.commitHash = null;
  }

  setDiff(diff) {
    this.diff = diff;
  }

  setAuthor(author, commitHash) {
    this.author = author;
    this.commitHash = commitHash;
  }

  toJSON() {
    return {
      filePath: this.filePath,
      changeType: this.changeType,
      previousHash: this.previousHash,
      currentHash: this.currentHash,
      timestamp: this.timestamp.toISOString(),
      diff: this.diff,
      author: this.author,
      commitHash: this.commitHash
    };
  }
}

// ============================================================================
// FILE HISTORY
// ============================================================================

class FileHistory {
  constructor(filePath) {
    this.filePath = filePath;
    this.changes = [];
    this.versions = new Map();
  }

  addChange(change) {
    this.changes.push(change);
  }

  addVersion(version, content) {
    this.versions.set(version, {
      content,
      timestamp: new Date()
    });
  }

  getVersion(version) {
    return this.versions.get(version);
  }

  getChangeHistory() {
    return this.changes.sort((a, b) => b.timestamp - a.timestamp);
  }

  toJSON() {
    return {
      filePath: this.filePath,
      changes: this.changes.map(c => c.toJSON()),
      versionCount: this.versions.size
    };
  }
}

// ============================================================================
// FILESYSTEM INTELLIGENCE
// ============================================================================

class FilesystemIntelligence extends EventEmitter {
  constructor(options = {}) {
    super();
    this.rootPath = options.rootPath || process.cwd();
    this.excludePatterns = options.excludePatterns || [
      'node_modules',
      '.git',
      'dist',
      'build',
      'coverage',
      '__pycache__',
      '.venv',
      'venv',
      'vendor',
      '.next',
      '.nuxt',
      '.cache'
    ];
    this.includePatterns = options.includePatterns || ['*'];
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.fileHistory = new Map();
    this.projectCache = new Map();
    this.codeStructureCache = new Map();
    this.searchIndex = null;
    this.watchers = new Map();

    // Configuration for different project types
    this.projectConfigs = {
      javascript: {
        packageFile: 'package.json',
        srcDirs: ['src', 'lib', 'app'],
        testDirs: ['test', 'tests', '__tests__', 'spec'],
        configFiles: ['.eslintrc', '.eslintrc.js', '.eslintrc.json', '.prettierrc', 'jsconfig.json']
      },
      typescript: {
        packageFile: 'package.json',
        srcDirs: ['src', 'lib', 'app'],
        testDirs: ['test', 'tests', '__tests__', 'spec'],
        configFiles: ['tsconfig.json', '.eslintrc', '.prettierrc']
      },
      python: {
        packageFile: ['setup.py', 'pyproject.toml', 'requirements.txt'],
        srcDirs: ['src', 'lib', 'app'],
        testDirs: ['tests', 'test', 'spec'],
        configFiles: ['setup.py', 'pyproject.toml', '.flake8', 'pytest.ini', 'tox.ini']
      },
      go: {
        packageFile: 'go.mod',
        srcDirs: ['cmd', 'pkg', 'internal'],
        testDirs: ['*_test.go'],
        configFiles: ['go.mod', 'go.sum', '.golangci.yml']
      },
      rust: {
        packageFile: 'Cargo.toml',
        srcDirs: ['src', 'examples', 'tests'],
        testDirs: ['tests', 'benches'],
        configFiles: ['Cargo.toml', 'Cargo.lock', 'rustfmt.toml', '.clippy.toml']
      },
      java: {
        packageFile: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
        srcDirs: ['src/main/java', 'src/main/kotlin'],
        testDirs: ['src/test/java', 'src/test/kotlin'],
        configFiles: ['pom.xml', 'build.gradle', 'build.gradle.kts', 'gradle.properties']
      }
    };
  }

  // ============================================================================
  // FILE OPERATIONS
  // ============================================================================

  /**
   * Read a file with metadata
   */
  async readFile(filePath, options = {}) {
    try {
      const fullPath = path.resolve(filePath);
      const stats = await fs.stat(fullPath);
      const metadata = new FileMetadata(fullPath, stats);

      if (stats.size > this.maxFileSize) {
        throw new FilesystemError(`File too large: ${stats.size} bytes`, 'FILE_TOO_LARGE');
      }

      let content = null;
      if (!options.metadataOnly) {
        content = await fs.readFile(fullPath, options.encoding || 'utf-8');
        metadata.contentHash = crypto.createHash('sha256').update(content).digest('hex');
      }

      this.emit('file:read', { filePath: fullPath, metadata });
      return { metadata, content };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new FileNotFoundError(filePath);
      }
      if (error.code === 'EACCES') {
        throw new PermissionError(filePath);
      }
      throw new FileOperationError('read', filePath, error);
    }
  }

  /**
   * Write content to a file
   */
  async writeFile(filePath, content, options = {}) {
    try {
      const fullPath = path.resolve(filePath);
      const dir = path.dirname(fullPath);

      // Ensure directory exists
      await fs.mkdir(dir, { recursive: true });

      const previousHash = await this.getFileHash(fullPath).catch(() => null);
      
      await fs.writeFile(fullPath, content, options.encoding || 'utf-8');
      
      const stats = await fs.stat(fullPath);
      const metadata = new FileMetadata(fullPath, stats);
      metadata.contentHash = crypto.createHash('sha256').update(content).digest('hex');

      // Track change
      this.trackChange(fullPath, 'modified', previousHash, metadata.contentHash);

      this.emit('file:written', { filePath: fullPath, metadata });
      return metadata;
    } catch (error) {
      if (error.code === 'EACCES') {
        throw new PermissionError(filePath);
      }
      throw new FileOperationError('write', filePath, error);
    }
  }

  /**
   * Edit specific lines in a file
   */
  async editFile(filePath, edits) {
    try {
      const { content } = await this.readFile(filePath);
      const lines = content.split('\n');
      
      // Sort edits in reverse order to maintain line numbers
      const sortedEdits = [...edits].sort((a, b) => b.line - a.line);
      
      for (const edit of sortedEdits) {
        const { line, replacement, deleteCount = 1 } = edit;
        const lineIndex = line - 1; // Convert to 0-based index
        
        if (deleteCount > 0) {
          lines.splice(lineIndex, deleteCount);
        }
        
        if (replacement !== null && replacement !== undefined) {
          const replacementLines = replacement.split('\n');
          lines.splice(lineIndex, 0, ...replacementLines);
        }
      }
      
      const newContent = lines.join('\n');
      return await this.writeFile(filePath, newContent);
    } catch (error) {
      throw new FileOperationError('edit', filePath, error);
    }
  }

  /**
   * Delete a file or directory
   */
  async deleteFile(filePath, options = {}) {
    try {
      const fullPath = path.resolve(filePath);
      const stats = await fs.stat(fullPath);
      const previousHash = await this.getFileHash(fullPath).catch(() => null);

      if (stats.isDirectory()) {
        if (!options.recursive) {
          throw new FilesystemError('Cannot delete directory without recursive option', 'DIRECTORY_DELETE');
        }
        await fs.rm(fullPath, { recursive: true });
      } else {
        await fs.unlink(fullPath);
      }

      // Track deletion
      this.trackChange(fullPath, 'deleted', previousHash, null);

      this.emit('file:deleted', { filePath: fullPath });
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false; // Already deleted
      }
      throw new FileOperationError('delete', filePath, error);
    }
  }

  /**
   * Copy a file or directory
   */
  async copyFile(source, destination, options = {}) {
    try {
      const fullSource = path.resolve(source);
      const fullDest = path.resolve(destination);
      const stats = await fs.stat(fullSource);

      if (stats.isDirectory()) {
        await this.copyDirectory(fullSource, fullDest, options);
      } else {
        const destDir = path.dirname(fullDest);
        await fs.mkdir(destDir, { recursive: true });
        await fs.copyFile(fullSource, fullDest);
      }

      this.emit('file:copied', { source: fullSource, destination: fullDest });
      return true;
    } catch (error) {
      throw new FileOperationError('copy', source, error);
    }
  }

  /**
   * Move/rename a file or directory
   */
  async moveFile(source, destination, options = {}) {
    try {
      const fullSource = path.resolve(source);
      const fullDest = path.resolve(destination);
      const previousHash = await this.getFileHash(fullSource).catch(() => null);

      const destDir = path.dirname(fullDest);
      await fs.mkdir(destDir, { recursive: true });
      
      await fs.rename(fullSource, fullDest);
      
      const currentHash = await this.getFileHash(fullDest).catch(() => null);
      this.trackChange(fullDest, 'renamed', previousHash, currentHash);

      this.emit('file:moved', { source: fullSource, destination: fullDest });
      return true;
    } catch (error) {
      throw new FileOperationError('move', source, error);
    }
  }

  /**
   * Get file hash
   */
  async getFileHash(filePath) {
    try {
      const content = await fs.readFile(filePath);
      return crypto.createHash('sha256').update(content).digest('hex');
    } catch {
      return null;
    }
  }

  /**
   * Copy directory recursively
   */
  async copyDirectory(source, destination, options = {}) {
    const entries = await fs.readdir(source, { withFileTypes: true });
    const fullSource = path.resolve(source);
    const fullDest = path.resolve(destination);

    await fs.mkdir(fullDest, { recursive: true });

    for (const entry of entries) {
      if (this.shouldExclude(entry.name)) continue;

      const srcPath = path.join(fullSource, entry.name);
      const destPath = path.join(fullDest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath, options);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  // ============================================================================
  // PROJECT SCANNING
  // ============================================================================

  /**
   * Scan a project directory
   */
  async scanProject(projectRoot = this.rootPath) {
    this.emit('scan:start', { projectRoot });

    const analysis = new ProjectAnalysis(projectRoot);
    
    // Detect project type
    const projectType = await this.detectProjectType(projectRoot);
    analysis.language = projectType.language;
    analysis.framework = projectType.framework;
    analysis.packageManager = projectType.packageManager;

    const config = this.projectConfigs[projectType.language] || this.projectConfigs.javascript;

    // Scan for structure
    await this.scanProjectStructure(projectRoot, analysis, config);

    // Parse dependencies
    await this.parseDependencies(projectRoot, analysis, config);

    // Calculate metrics
    await this.calculateProjectMetrics(projectRoot, analysis);

    // Build dependency graph
    const dependencyGraph = await this.buildDependencyGraph(projectRoot, analysis);

    this.projectCache.set(projectRoot, {
      analysis,
      dependencyGraph,
      timestamp: new Date()
    });

    this.emit('scan:complete', { projectRoot, analysis });
    return { analysis, dependencyGraph };
  }

  /**
   * Detect project type from files
   */
  async detectProjectType(projectRoot) {
    const result = { language: 'javascript', framework: null, packageManager: null };
    const files = await fs.readdir(projectRoot);

    // JavaScript/TypeScript detection
    if (files.includes('package.json')) {
      try {
        const packageJson = JSON.parse(await fs.readFile(path.join(projectRoot, 'package.json'), 'utf-8'));
        
        // Detect framework
        if (packageJson.dependencies?.react) result.framework = 'react';
        else if (packageJson.dependencies?.vue) result.framework = 'vue';
        else if (packageJson.dependencies?.angular) result.framework = 'angular';
        else if (packageJson.dependencies?.next) result.framework = 'next';
        else if (packageJson.dependencies?.nuxt) result.framework = 'nuxt';
        else if (packageJson.dependencies?.express) result.framework = 'express';
        else if (packageJson.dependencies?.fastify) result.framework = 'fastify';

        // Detect TypeScript
        if (packageJson.devDependencies?.typescript || files.includes('tsconfig.json')) {
          result.language = 'typescript';
        }

        // Detect package manager
        if (files.includes('yarn.lock')) result.packageManager = 'yarn';
        else if (files.includes('pnpm-lock.yaml')) result.packageManager = 'pnpm';
        else if (files.includes('package-lock.json')) result.packageManager = 'npm';
      } catch {}
    }

    // Python detection
    if (files.some(f => ['setup.py', 'pyproject.toml', 'requirements.txt'].includes(f))) {
      result.language = 'python';
      if (files.includes('pyproject.toml')) {
        try {
          const pyproject = await fs.readFile(path.join(projectRoot, 'pyproject.toml'), 'utf-8');
          if (pyproject.includes('flask')) result.framework = 'flask';
          else if (pyproject.includes('django')) result.framework = 'django';
          else if (pyproject.includes('fastapi')) result.framework = 'fastapi';
        } catch {}
      }
    }

    // Go detection
    if (files.includes('go.mod')) {
      result.language = 'go';
      result.packageManager = 'go';
    }

    // Rust detection
    if (files.includes('Cargo.toml')) {
      result.language = 'rust';
      result.packageManager = 'cargo';
    }

    // Java detection
    if (files.some(f => ['pom.xml', 'build.gradle', 'build.gradle.kts'].includes(f))) {
      result.language = 'java';
      if (files.includes('pom.xml')) {
        result.packageManager = 'maven';
      } else {
        result.packageManager = 'gradle';
      }
    }

    return result;
  }

  /**
   * Scan project structure
   */
  async scanProjectStructure(projectRoot, analysis, config) {
    const scanRecursive = async (dir, depth = 0, maxDepth = 5) => {
      if (depth > maxDepth) return;

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (this.shouldExclude(entry.name)) continue;

          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            // Categorize directories
            if (this.isSourceDir(entry.name, config)) {
              analysis.structure.sourceDirs.push(fullPath);
            } else if (this.isTestDir(entry.name, config)) {
              analysis.structure.testDirs.push(fullPath);
            } else if (['docs', 'doc'].includes(entry.name.toLowerCase())) {
              analysis.structure.docsDirs.push(fullPath);
            } else if (['public', 'static', 'assets', 'public'].includes(entry.name.toLowerCase())) {
              analysis.structure.publicDirs.push(fullPath);
            }

            // Component directories (for JS/TS)
            if (['components', 'Component', 'ui'].includes(entry.name)) {
              analysis.structure.components.push(fullPath);
            } else if (['pages', 'views', 'screens'].includes(entry.name)) {
              analysis.structure.pages.push(fullPath);
            } else if (['routes', 'router'].includes(entry.name)) {
              analysis.structure.routes.push(fullPath);
            } else if (['services', 'api'].includes(entry.name)) {
              analysis.structure.services.push(fullPath);
            } else if (['utils', 'helpers', 'lib'].includes(entry.name)) {
              analysis.structure.utils.push(fullPath);
            } else if (['hooks'].includes(entry.name)) {
              analysis.structure.hooks.push(fullPath);
            } else if (['stores', 'state', 'redux'].includes(entry.name)) {
              analysis.structure.stores.push(fullPath);
            }

            await scanRecursive(fullPath, depth + 1, maxDepth);
          } else {
            // Categorize files
            const ext = path.extname(entry.name);
            
            if (this.isConfigFile(entry.name, config)) {
              analysis.structure.configFiles.push(fullPath);
            } else if (this.isBuildFile(entry.name)) {
              analysis.structure.buildFiles.push(fullPath);
            } else if (ext === '.test' || ext === '.spec') {
              analysis.structure.src.push(fullPath);
            }
          }
        }
      } catch (error) {
        this.emit('scan:error', { directory: dir, error: error.message });
      }
    };

    await scanRecursive(projectRoot);
  }

  /**
   * Parse dependencies from package files
   */
  async parseDependencies(projectRoot, analysis, config) {
    const packageFile = config.packageFile;
    const packagePath = path.join(projectRoot, packageFile);

    try {
      if (Array.isArray(packageFile)) {
        for (const pf of packageFile) {
          const fp = path.join(projectRoot, pf);
          if (fsSync.existsSync(fp)) {
            await this.parseDependencyFile(fp, analysis);
            break;
          }
        }
      } else {
        await this.parseDependencyFile(packagePath, analysis);
      }
    } catch (error) {
      this.emit('scan:error', { file: packagePath, error: error.message });
    }
  }

  /**
   * Parse a single dependency file
   */
  async parseDependencyFile(filePath, analysis) {
    const content = await fs.readFile(filePath, 'utf-8');

    if (filePath.endsWith('package.json')) {
      const pkg = JSON.parse(content);
      for (const [name, version] of Object.entries(pkg.dependencies || {})) {
        analysis.addDependency(name, version, 'production');
      }
      for (const [name, version] of Object.entries(pkg.devDependencies || {})) {
        analysis.addDependency(name, version, 'dev');
      }
      for (const [name, version] of Object.entries(pkg.peerDependencies || {})) {
        analysis.addDependency(name, version, 'peer');
      }
      for (const [name, version] of Object.entries(pkg.optionalDependencies || {})) {
        analysis.addDependency(name, version, 'optional');
      }
    } else if (filePath.endsWith('go.mod')) {
      const lines = content.split('\n');
      for (const line of lines) {
        const match = line.match(/^\s*([\w\-\.]+)\s+([\w\.\-]+)/);
        if (match) {
          analysis.addDependency(match[1], match[2]);
        }
      }
    } else if (filePath.endsWith('Cargo.toml')) {
      const lines = content.split('\n');
      let currentSection = null;
      for (const line of lines) {
        if (line.startsWith('[')) {
          currentSection = line.trim();
        } else if (currentSection === '[dependencies]' || currentSection === '[dev-dependencies]') {
          const match = line.match(/^\s*([\w\-\.]+)\s*=/);
          if (match) {
            analysis.addDependency(match[1], 'unknown', currentSection === '[dev-dependencies]' ? 'dev' : 'production');
          }
        }
      }
    }
  }

  /**
   * Calculate project metrics
   */
  async calculateProjectMetrics(projectRoot, analysis) {
    const metrics = analysis.metrics;
    const fileSizes = [];

    const scanFiles = async (dir, depth = 0, maxDepth = 3) => {
      if (depth > maxDepth) return;

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (this.shouldExclude(entry.name)) continue;

          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            await scanFiles(fullPath, depth + 1, maxDepth);
          } else {
            const ext = path.extname(entry.name);
            metrics.totalFiles++;
            
            const stats = await fs.stat(fullPath);
            fileSizes.push({ path: fullPath, size: stats.size, ext });
            metrics.fileTypeDistribution[ext] = (metrics.fileTypeDistribution[ext] || 0) + 1;

            if (this.isCodeFile(entry.name)) {
              metrics.codeFiles++;
            } else if (this.isTestFile(entry.name)) {
              metrics.testFiles++;
            } else if (this.isConfigFile(entry.name)) {
              metrics.configFiles++;
            }

            // Count lines
            if (this.isCodeFile(entry.name) && stats.size < this.maxFileSize) {
              try {
                const content = await fs.readFile(fullPath, 'utf-8');
                metrics.totalLines += content.split('\n').length;
              } catch {}
            }
          }
        }
      } catch {}
    };

    await scanFiles(projectRoot);

    metrics.averageFileSize = metrics.totalFiles > 0 
      ? fileSizes.reduce((sum, f) => sum + f.size, 0) / metrics.totalFiles 
      : 0;

    // Find largest files
    metrics.largestFiles = fileSizes
      .sort((a, b) => b.size - a.size)
      .slice(0, 10)
      .map(f => ({ path: f.path, size: f.size }));
  }

  /**
   * Build dependency graph
   */
  async buildDependencyGraph(projectRoot, analysis) {
    const graph = new Map();

    // Add package dependencies as nodes
    for (const [type, deps] of Object.entries(analysis.dependencies)) {
      for (const dep of deps) {
        const node = new DependencyNode(dep.name, 'package');
        node.version = dep.version;
        node.devOnly = type === 'development';
        node.optional = type === 'optional';
        graph.set(dep.name, node);
      }
    }

    // Scan for local dependencies
    await this.scanLocalDependencies(projectRoot, graph);

    return graph;
  }

  /**
   * Scan for local file dependencies
   */
  async scanLocalDependencies(projectRoot, graph) {
    const codeFiles = await this.findFiles(projectRoot, (f) => this.isCodeFile(f));

    for (const file of codeFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const structure = this.extractCodeStructure(file, content);
        
        // Add file as node
        const relativePath = path.relative(projectRoot, file);
        const fileNode = new DependencyNode(relativePath, 'file');
        graph.set(relativePath, fileNode);

        // Process imports
        for (const imp of structure.imports) {
          const importPath = this.resolveImportPath(file, imp.source);
          
          if (importPath) {
            const importNode = graph.get(importPath);
            if (importNode) {
              importNode.addDependent(relativePath);
              fileNode.addDependency(importPath);
            }
          }
        }
      } catch {}
    }
  }

  /**
   * Resolve import path to relative path
   */
  resolveImportPath(sourceFile, importSource) {
    const sourceDir = path.dirname(sourceFile);
    let importPath;

    if (importSource.startsWith('.')) {
      importPath = path.resolve(sourceDir, importSource);
    } else {
      // External module - skip
      return null;
    }

    // Add extensions
    const extensions = ['.js', '.jsx', '.ts', '.tsx', '.json'];
    for (const ext of extensions) {
      if (fsSync.existsSync(importPath + ext)) {
        return path.relative(this.rootPath, importPath + ext);
      }
    }

    // Check if it's a directory with index
    if (fsSync.existsSync(importPath) && fsSync.statSync(importPath).isDirectory()) {
      for (const ext of extensions) {
        const indexPath = path.join(importPath, 'index' + ext);
        if (fsSync.existsSync(indexPath)) {
          return path.relative(this.rootPath, indexPath);
        }
      }
    }

    return path.relative(this.rootPath, importPath);
  }

  // ============================================================================
  // CODE STRUCTURE EXTRACTION
  // ============================================================================

  /**
   * Extract code structure from a file
   */
  async extractCodeStructure(filePath, content = null) {
    if (!content) {
      const result = await this.readFile(filePath);
      content = result.content;
    }

    const structure = new CodeStructure(filePath);
    structure.calculateMetrics(content);

    // Use language-specific parsers
    const parser = this.getLanguageParser(structure.language);
    if (parser) {
      parser(structure, content);
    }

    this.codeStructureCache.set(filePath, {
      structure,
      timestamp: new Date()
    });

    return structure;
  }

  /**
   * Get language-specific parser function
   */
  getLanguageParser(language) {
    const parsers = {
      javascript: this.parseJavaScript,
      typescript: this.parseTypeScript,
      python: this.parsePython,
      go: this.parseGo,
      rust: this.parseRust,
      java: this.parseJava
    };
    return parsers[language]?.bind(this);
  }

  /**
   * Parse JavaScript/TypeScript code
   */
  parseJavaScript(structure, content) {
    const lines = content.split('\n');

    // Regex patterns for JS/TS
    const patterns = {
      function: /(?:(?:export|async|await)\s+)*(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)\s*=>|function\s*\([^)]*\))|(\w+)\s*\([^)]*\)\s*{/g,
      class: /class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/g,
      import: /import\s+(?:(?:(\w+)|(?:\{[^}]*\}|\*\s+as\s+\w+))\s+from\s+)?['"]([^'"]+)['"]/g,
      export: /export\s+(?:default\s+)?(?:const|let|var|function|class|interface|type)\s+(\w+)/g,
      comment: /\/\/|\/\*|\*\//g
    };

    let match;
    
    // Parse functions
    const functionRegex = /(?:function\s+(\w+)|(\w+)\s*\([^)]*\)\s*(?::\s*\w+\s*)?\{|const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|(\w+)\s*:\s*(?:async\s*)?\([^)]*\)\s*(?::\s*[\w<>[\],\s]+\s*)?=>)/g;
    while ((match = functionRegex.exec(content)) !== null) {
      const name = match[1] || match[2] || match[3] || match[4];
      if (name && !['if', 'for', 'while', 'switch', 'catch', 'class'].includes(name)) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        structure.addFunction({
          name,
          lineStart: lineNumber,
          lineEnd: lineNumber + 10 // Approximate
        });
      }
    }

    // Parse classes
    while ((match = patterns.class.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      structure.addClass({
        name: match[1],
        extends: match[2],
        implements: match[3]?.split(',').map(s => s.trim()) || [],
        lineStart: lineNumber,
        lineEnd: lineNumber + 50 // Approximate
      });
    }

    // Parse imports
    while ((match = patterns.import.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      structure.addImport({
        source: match[3],
        default: match[1] || null,
        named: match[2] ? match[2].split(',').map(s => s.trim()) : [],
        line: lineNumber
      });
    }

    // Parse exports
    while ((match = patterns.export.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      structure.addExport({
        name: match[1],
        type: 'named',
        line: lineNumber
      });
    }
  }

  /**
   * Parse TypeScript code
   */
  parseTypeScript(structure, content) {
    this.parseJavaScript(structure, content);

    // Additional TS patterns
    const interfaceRegex = /interface\s+(\w+)(?:\s+extends\s+([\w,\s]+))?/g;
    const typeRegex = /type\s+(\w+)\s*=/g;
    const enumRegex = /enum\s+(\w+)/g;

    let match;
    while ((match = interfaceRegex.exec(content)) !== null) {
      structure.interfaces.push({
        name: match[1],
        extends: match[2]?.split(',').map(s => s.trim()) || []
      });
    }
    while ((match = typeRegex.exec(content)) !== null) {
      structure.types.push({ name: match[1] });
    }
    while ((match = enumRegex.exec(content)) !== null) {
      structure.types.push({ name: match[1], type: 'enum' });
    }
  }

  /**
   * Parse Python code
   */
  parsePython(structure, content) {
    const lines = content.split('\n');

    // Parse functions
    const functionRegex = /(?:def\s+(\w+)|class\s+(\w+))/g;
    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      if (match[1]) {
        // Function
        const lineNumber = content.substring(0, match.index).split('\n').length;
        structure.addFunction({
          name: match[1],
          lineStart: lineNumber,
          lineEnd: lineNumber + 10
        });
      } else if (match[2]) {
        // Class
        const lineNumber = content.substring(0, match.index).split('\n').length;
        structure.addClass({
          name: match[2],
          lineStart: lineNumber,
          lineEnd: lineNumber + 50
        });
      }
    }

    // Parse imports
    const importRegex = /(?:from\s+([\w.]+)\s+import|import\s+)([^;\n]+)/g;
    while ((match = importRegex.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      structure.addImport({
        source: match[1] || match[2],
        named: match[2]?.split(',').map(s => s.trim()) || []
      });
    }
  }

  /**
   * Parse Go code
   */
  parseGo(structure, content) {
    const functionRegex = /func\s+(?:\([^)]+\)\s+)?(\w+)/g;
    const structRegex = /type\s+(\w+)\s+struct/g;
    const interfaceRegex = /type\s+(\w+)\s+interface/g;
    const importRegex = /import\s+(?:"[^"]+"|\([^)]+\))/g;

    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      structure.addFunction({
        name: match[1],
        lineStart: lineNumber,
        lineEnd: lineNumber + 10
      });
    }
    while ((match = structRegex.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      structure.addClass({
        name: match[1],
        lineStart: lineNumber,
        lineEnd: lineNumber + 20
      });
    }
    while ((match = interfaceRegex.exec(content)) !== null) {
      structure.interfaces.push({ name: match[1] });
    }
    while ((match = importRegex.exec(content)) !== null) {
      structure.addImport({ source: match[1] || match[2] });
    }
  }

  /**
   * Parse Rust code
   */
  parseRust(structure, content) {
    const functionRegex = /fn\s+(\w+)/g;
    const structRegex = /struct\s+(\w+)/g;
    const implRegex = /impl\s+(?:[^ ]+\s+)?(\w+)/g;
    const useRegex = /use\s+([^;]+)/g;

    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      structure.addFunction({
        name: match[1],
        lineStart: lineNumber,
        lineEnd: lineNumber + 10
      });
    }
    while ((match = structRegex.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      structure.addClass({
        name: match[1],
        lineStart: lineNumber,
        lineEnd: lineNumber + 20
      });
    }
    while ((match = useRegex.exec(content)) !== null) {
      structure.addImport({ source: match[1].trim() });
    }
  }

  /**
   * Parse Java code
   */
  parseJava(structure, content) {
    const functionRegex = /(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?(?:void|int|String|\w+)\s+(\w+)\s*\(/g;
    const classRegex = /(?:public\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/g;
    const importRegex = /import\s+([^;]+);/g;

    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      structure.addFunction({
        name: match[1],
        lineStart: lineNumber,
        lineEnd: lineNumber + 10
      });
    }
    while ((match = classRegex.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      structure.addClass({
        name: match[1],
        extends: match[2],
        implements: match[3]?.split(',').map(s => s.trim()) || [],
        lineStart: lineNumber,
        lineEnd: lineNumber + 50
      });
    }
    while ((match = importRegex.exec(content)) !== null) {
      structure.addImport({ source: match[1].trim() });
    }
  }

  // ============================================================================
  // SEMANTIC SEARCH
  // ============================================================================

  /**
   * Search for text in files
   */
  async search(query, options = {}) {
    const {
      caseSensitive = false,
      wholeWord = false,
      regex = false,
      files = null,
      maxResults = options.maxResults || 100
    } = options;

    this.emit('search:start', { query, options });

    const results = [];
    
    // Determine files to search
    const searchFiles = files || await this.findFiles(this.rootPath, (f) => this.isCodeFile(f));

    // Build search pattern
    let pattern;
    if (regex) {
      pattern = new RegExp(query, caseSensitive ? 'g' : 'gi');
    } else {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wordBoundaries = wholeWord ? '\\b' : '';
      pattern = new RegExp(wordBoundaries + escaped + wordBoundaries, caseSensitive ? 'g' : 'gi');
    }

    // Search through files
    for (const file of searchFiles) {
      try {
        const stats = await fs.stat(file);
        if (stats.size > this.maxFileSize) continue;

        const content = await fs.readFile(file, 'utf-8');
        const fileLines = content.split('\n');
        let matchCount = 0;

        for (let i = 0; i < fileLines.length; i++) {
          const line = fileLines[i];
          if (pattern.test(line)) {
            const relevanceScore = this.calculateRelevanceScore(line, query, pattern);
            results.push(new SearchResult(file, i + 1, line, query, relevanceScore));
            matchCount++;

            if (results.length >= maxResults) break;
          }
          pattern.lastIndex = 0; // Reset regex state
        }

        if (results.length >= maxResults) break;
      } catch {}
    }

    // Sort by relevance
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    this.emit('search:complete', { query, resultCount: results.length });
    return results;
  }

  /**
   * Search for code patterns (function definitions, class usage, etc.)
   */
  async searchCode(query, options = {}) {
    const searchResults = await this.search(query, { ...options, regex: true });
    
    // Filter to code-relevant matches
    return searchResults.filter(result => {
      const line = result.lineContent.toLowerCase();
      return !this.isCommentLine(line, result.filePath);
    });
  }

  /**
   * Calculate relevance score for a search result
   */
  calculateRelevanceScore(line, query, pattern) {
    let score = 1;

    // Exact match bonus
    if (line.toLowerCase().includes(query.toLowerCase())) {
      score += 2;
    }

    // Start of line bonus
    if (line.trim().startsWith(query)) {
      score += 1;
    }

    // Match position
    const index = line.toLowerCase().indexOf(query.toLowerCase());
    if (index === 0) {
      score += 1;
    }

    return score;
  }

  /**
   * Check if a line is a comment
   */
  isCommentLine(line, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const trimmed = line.trim();

    // Single-line comments
    if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
      return true;
    }

    // Check for comment blocks (rough check)
    if (trimmed.startsWith('/*') || trimmed.startsWith('<!--')) {
      return true;
    }

    return false;
  }

  // ============================================================================
  // FILE CHANGE TRACKING
  // ============================================================================

  /**
   * Track a file change
   */
  trackChange(filePath, changeType, previousHash, currentHash) {
    const change = new FileChange(
      filePath,
      changeType,
      previousHash,
      currentHash,
      new Date()
    );

    if (!this.fileHistory.has(filePath)) {
      this.fileHistory.set(filePath, new FileHistory(filePath));
    }

    this.fileHistory.get(filePath).addChange(change);
    this.emit('change:tracked', { change });
  }

  /**
   * Get file history
   */
  getFileHistory(filePath) {
    return this.fileHistory.get(path.resolve(filePath));
  }

  /**
   * Compare two versions of a file
   */
  async diff(filePath, version1, version2) {
    const history = this.getFileHistory(filePath);
    if (!history) {
      return null;
    }

    const v1 = history.getVersion(version1);
    const v2 = history.getVersion(version2);

    if (!v1 || !v2) {
      return null;
    }

    return this.computeDiff(v1.content, v2.content);
  }

  /**
   * Compute diff between two contents
   */
  computeDiff(oldContent, newContent) {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const diff = [];

    // Simple line-by-line diff (LCS would be more sophisticated)
    let i = 0, j = 0;
    while (i < oldLines.length || j < newLines.length) {
      if (i >= oldLines.length) {
        diff.push({ type: 'add', line: j + 1, content: newLines[j] });
        j++;
      } else if (j >= newLines.length) {
        diff.push({ type: 'remove', line: i + 1, content: oldLines[i] });
        i++;
      } else if (oldLines[i] === newLines[j]) {
        diff.push({ type: 'unchanged', line: i + 1, content: oldLines[i] });
        i++;
        j++;
      } else {
        diff.push({ type: 'remove', line: i + 1, content: oldLines[i] });
        diff.push({ type: 'add', line: j + 1, content: newLines[j] });
        i++;
        j++;
      }
    }

    return diff;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Find files matching a predicate
   */
  async findFiles(directory, predicate, results = []) {
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });

      for (const entry of entries) {
        if (this.shouldExclude(entry.name)) continue;

        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
          await this.findFiles(fullPath, predicate, results);
        } else if (predicate(entry.name)) {
          results.push(fullPath);
        }
      }
    } catch {}

    return results;
  }

  /**
   * Check if a file/directory should be excluded
   */
  shouldExclude(name) {
    return this.excludePatterns.some(pattern => {
      if (pattern.startsWith('*')) {
        return name.endsWith(pattern.slice(1));
      }
      return name === pattern || name.startsWith(pattern + '/');
    });
  }

  /**
   * Check if a file is a source directory
   */
  isSourceDir(name, config) {
    return config.srcDirs.some(dir => name === dir);
  }

  /**
   * Check if a directory is a test directory
   */
  isTestDir(name, config) {
    return config.testDirs.some(dir => name === dir);
  }

  /**
   * Check if a file is a config file
   */
  isConfigFile(name, config) {
    return config.configFiles.some(cf => name.includes(cf));
  }

  /**
   * Check if a file is a build file
   */
  isBuildFile(name) {
    return ['webpack.config', 'vite.config', 'rollup.config', 'babel.config', 'tsconfig'].some(
      b => name.includes(b)
    );
  }

  /**
   * Check if a file is a code file
   */
  isCodeFile(name) {
    const codeExtensions = [
      '.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.java', '.go', '.rs',
      '.cpp', '.c', '.cs', '.php', '.swift', '.kt', '.scala', '.html',
      '.css', '.scss', '.less', '.sql', '.sh', '.bash', '.zsh'
    ];
    return codeExtensions.includes(path.extname(name).toLowerCase());
  }

  /**
   * Check if a file is a test file
   */
  isTestFile(name) {
    return name.includes('.test.') || name.includes('.spec.') ||
           name.includes('.test.') || name.includes('__tests__') ||
           name.includes('__specs__');
  }

  /**
   * Watch a directory for changes
   */
  watch(directory, callback) {
    const watcher = fsSync.watch(directory, { recursive: true }, (eventType, filename) => {
      if (filename) {
        callback({ eventType, filename: path.join(directory, filename) });
      }
    });

    this.watchers.set(directory, watcher);
    return watcher;
  }

  /**
   * Stop watching a directory
   */
  unwatch(directory) {
    const watcher = this.watchers.get(directory);
    if (watcher) {
      watcher.close();
      this.watchers.delete(directory);
    }
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.projectCache.clear();
    this.codeStructureCache.clear();
    this.fileHistory.clear();
    this.emit('cache:cleared');
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      cachedProjects: this.projectCache.size,
      cachedStructures: this.codeStructureCache.size,
      trackedFiles: this.fileHistory.size,
      activeWatchers: this.watchers.size,
      excludedPatterns: this.excludePatterns.length
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  FilesystemIntelligence,
  FileMetadata,
  CodeStructure,
  ProjectAnalysis,
  SearchResult,
  DependencyNode,
  FileChange,
  FileHistory,
  FilesystemError,
  FileNotFoundError,
  PermissionError,
  FileOperationError
};