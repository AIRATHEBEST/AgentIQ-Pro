/**
 * FileHandlingAgent.js - Features 146-160: File Operations & Management
 * Handles file operations including reading, writing, organizing, and format conversions
 */

import { EventEmitter } from 'events';

export class FileHandlingAgent extends EventEmitter {
  constructor() {
    super();
    this.fileSystem = new Map();
    this.watchers = new Map();
    this.backupHistory = new Map();
  }

  /**
   * Read file contents
   * Features: 146 - File Reading, 147 - Multiple File Support
   */
  async readFile(filePath, options = {}) {
    this.emit('start', { agent: 'FileHandlingAgent', operation: 'readFile', filePath });

    try {
      const { encoding = 'utf8', format = 'text' } = options;

      if (this.fileSystem.has(filePath)) {
        const fileData = this.fileSystem.get(filePath);
        let content = fileData.content;

        if (format === 'json' && !fileData.format?.includes('json')) {
          content = JSON.stringify({ content });
        }

        this.emit('progress', { progress: 100, message: 'File read successfully' });
        this.emit('complete', { filePath, content, size: fileData.size });
        return { filePath, content, size: fileData.size };
      }

      throw new Error(`File not found: ${filePath}`);
    } catch (error) {
      this.emit('error', { error: error.message });
      throw error;
    }
  }

  /**
   * Read multiple files
   * Feature: 147 - Multiple File Support
   */
  async readMultipleFiles(filePaths, options = {}) {
    this.emit('start', { agent: 'FileHandlingAgent', operation: 'readMultipleFiles', count: filePaths.length });

    try {
      const results = [];
      for (let i = 0; i < filePaths.length; i++) {
        const result = await this.readFile(filePaths[i], options);
        results.push(result);
        this.emit('progress', { progress: ((i + 1) / filePaths.length) * 100 });
      }

      this.emit('complete', { results });
      return results;
    } catch (error) {
      this.emit('error', { error: error.message });
      throw error;
    }
  }

  /**
   * Write content to file
   * Features: 148 - File Writing, 149 - Auto-save
   */
  async writeFile(filePath, content, options = {}) {
    this.emit('start', { agent: 'FileHandlingAgent', operation: 'writeFile', filePath });

    try {
      const { autoBackup = true, metadata = {} } = options;

      if (autoBackup && this.fileSystem.has(filePath)) {
        await this.createBackup(filePath);
      }

      const fileData = {
        content,
        size: content.length,
        format: this.detectFormat(filePath),
        metadata: {
          ...metadata,
          lastModified: new Date().toISOString(),
          created: this.fileSystem.has(filePath) ? this.fileSystem.get(filePath).metadata.created : new Date().toISOString()
        }
      };

      this.fileSystem.set(filePath, fileData);
      this.emit('progress', { progress: 100, message: 'File written successfully' });
      this.emit('complete', { filePath, size: fileData.size });
      return { filePath, size: fileData.size };
    } catch (error) {
      this.emit('error', { error: error.message });
      throw error;
    }
  }

  /**
   * Auto-save functionality
   * Feature: 149 - Auto-save
   */
  async autoSave(filePath, content, interval = 30000) {
    this.emit('start', { agent: 'FileHandlingAgent', operation: 'autoSave', filePath, interval });

    try {
      await this.writeFile(filePath, content);
      const autoSaveTimer = setInterval(async () => {
        try {
          await this.writeFile(filePath, content, { autoBackup: true });
          this.emit('autosave', { filePath, timestamp: new Date().toISOString() });
        } catch (error) {
          this.emit('autosave_error', { filePath, error: error.message });
        }
      }, interval);

      this.emit('complete', { message: 'Auto-save enabled', interval });
      return { message: 'Auto-save enabled', interval, timer: autoSaveTimer };
    } catch (error) {
      this.emit('error', { error: error.message });
      throw error;
    }
  }

  /**
   * Create file backup
   * Feature: 150 - Backup System
   */
  async createBackup(filePath, options = {}) {
    this.emit('start', { agent: 'FileHandlingAgent', operation: 'createBackup', filePath });

    try {
      const { maxBackups = 10 } = options;

      if (!this.fileSystem.has(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileData = this.fileSystem.get(filePath);
      const backupKey = `${filePath}_backup_${Date.now()}`;
      const backupData = {
        content: fileData.content,
        size: fileData.size,
        format: fileData.format,
        metadata: { ...fileData.metadata, backupTimestamp: new Date().toISOString() }
      };

      if (!this.backupHistory.has(filePath)) {
        this.backupHistory.set(filePath, []);
      }

      const backups = this.backupHistory.get(filePath);
      backups.push({ key: backupKey, timestamp: new Date().toISOString() });

      if (backups.length > maxBackups) {
        const removed = backups.shift();
        this.fileSystem.delete(removed.key);
      }

      this.fileSystem.set(backupKey, backupData);
      this.emit('complete', { backupKey, timestamp: backupData.metadata.backupTimestamp });
      return { backupKey, timestamp: backupData.metadata.backupTimestamp };
    } catch (error) {
      this.emit('error', { error: error.message });
      throw error;
    }
  }

  /**
   * Restore from backup
   * Feature: 150 - Backup System
   */
  async restoreBackup(filePath, timestamp) {
    this.emit('start', { agent: 'FileHandlingAgent', operation: 'restoreBackup', filePath, timestamp });

    try {
      const backups = this.backupHistory.get(filePath);
      if (!backups || backups.length === 0) {
        throw new Error('No backups found');
      }

      const backup = backups.find(b => {
        const backupData = this.fileSystem.get(b.key);
        return backupData?.metadata?.backupTimestamp === timestamp;
      });

      if (!backup) {
        throw new Error('Backup not found');
      }

      const backupData = this.fileSystem.get(backup.key);
      if (backupData) {
        await this.writeFile(filePath, backupData.content);
      }

      this.emit('complete', { filePath, restoredFrom: timestamp });
      return { filePath, restoredFrom: timestamp };
    } catch (error) {
      this.emit('error', { error: error.message });
      throw error;
    }
  }

  /**
   * Detect file format
   * Feature: 151 - Format Detection
   */
  detectFormat(filePath) {
    const extension = filePath.split('.').pop()?.toLowerCase();
    const formatMap = {
      js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
      json: 'json', md: 'markdown', html: 'html', css: 'css', scss: 'scss',
      py: 'python', java: 'java', cpp: 'cpp', c: 'c', xml: 'xml', yaml: 'yaml',
      yml: 'yaml', sql: 'sql', sh: 'shell', bash: 'shell', txt: 'text',
      csv: 'csv', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
      pdf: 'pdf', doc: 'document', docx: 'document'
    };
    return formatMap[extension] || 'unknown';
  }

  /**
   * File format conversion
   * Feature: 152 - Format Conversion
   */
  async convertFileFormat(filePath, targetFormat) {
    this.emit('start', { agent: 'FileHandlingAgent', operation: 'convertFormat', filePath, targetFormat });

    try {
      if (!this.fileSystem.has(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileData = this.fileSystem.get(filePath);
      const sourceFormat = fileData.format;
      let convertedContent;

      const conversions = {
        'json_to_yaml': () => this.jsonToYaml(fileData.content),
        'yaml_to_json': () => this.yamlToJson(fileData.content),
        'csv_to_json': () => this.csvToJson(fileData.content),
        'json_to_csv': () => this.jsonToCsv(fileData.content),
        'markdown_to_html': () => this.markdownToHtml(fileData.content),
        'markdown_to_pdf': () => this.markdownToPdf(fileData.content),
        'text_to_json': () => this.textToJson(fileData.content)
      };

      const conversionKey = `${sourceFormat}_to_${targetFormat}`;
      if (conversions[conversionKey]) {
        convertedContent = conversions[conversionKey]();
      } else {
        throw new Error(`Conversion from ${sourceFormat} to ${targetFormat} not supported`);
      }

      const newFilePath = filePath.replace(/\.[^.]+$/, `.${targetFormat}`);
      await this.writeFile(newFilePath, convertedContent);

      this.emit('complete', { original: filePath, converted: newFilePath });
      return { original: filePath, converted: newFilePath };
    } catch (error) {
      this.emit('error', { error: error.message });
      throw error;
    }
  }

  jsonToYaml(jsonContent) {
    try {
      const data = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;
      return this.objectToYaml(data, 0);
    } catch (e) {
      return jsonContent;
    }
  }

  objectToYaml(obj, indent = 0) {
    const spaces = '  '.repeat(indent);
    let yaml = '';
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        value.forEach(item => {
          if (typeof item === 'object') {
            yaml += this.objectToYaml(item, indent + 1);
          } else {
            yaml += `${spaces}  - ${item}\n`;
          }
        });
      } else if (typeof value === 'object' && value !== null) {
        yaml += `${spaces}${key}:\n`;
        yaml += this.objectToYaml(value, indent + 1);
      } else {
        yaml += `${spaces}${key}: ${value}\n`;
      }
    }
    return yaml;
  }

  yamlToJson(yamlContent) {
    return JSON.stringify({ parsed: yamlContent }, null, 2);
  }

  csvToJson(csvContent) {
    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length === 0) return '[]';
    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      data.push(row);
    }
    return JSON.stringify(data, null, 2);
  }

  jsonToCsv(jsonContent) {
    try {
      const data = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;
      if (!Array.isArray(data) || data.length === 0) return '';
      const headers = Object.keys(data[0]);
      let csv = headers.join(',') + '\n';
      data.forEach(item => {
        const values = headers.map(h => {
          const val = item[h];
          return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
        });
        csv += values.join(',') + '\n';
      });
      return csv;
    } catch (e) {
      return jsonContent;
    }
  }

  markdownToHtml(markdown) {
    let html = markdown
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
      .replace(/^\*\s+(.+)$/gm, '<li>$1</li>')
      .replace(/\n/g, '<br>');
    return html;
  }

  markdownToPdf(markdown) {
    return { format: 'pdf', content: markdown, generated: new Date().toISOString() };
  }

  textToJson(text) {
    return JSON.stringify({ content: text, lines: text.split('\n').length }, null, 2);
  }

  /**
   * List directory contents
   * Feature: 153 - Directory Listing
   */
  async listDirectory(dirPath, options = {}) {
    this.emit('start', { agent: 'FileHandlingAgent', operation: 'listDirectory', dirPath });

    try {
      const { recursive = false, filter } = options;
      const files = [];
      this.fileSystem.forEach((data, path) => {
        if (path.startsWith(dirPath)) {
          const relativePath = path.substring(dirPath.length + 1);
          if (recursive || !relativePath.includes('/')) {
            if (!filter || this.matchesFilter(relativePath, filter)) {
              files.push({
                path,
                name: path.split('/').pop(),
                type: this.detectFileType(path),
                size: data.size,
                modified: data.metadata.lastModified
              });
            }
          }
        }
      });

      this.emit('complete', { files });
      return files;
    } catch (error) {
      this.emit('error', { error: error.message });
      throw error;
    }
  }

  detectFileType(path) {
    return path.includes('.') ? 'file' : 'directory';
  }

  matchesFilter(path, filter) {
    if (!filter) return true;
    const regex = new RegExp(filter.replace('*', '.*'), 'i');
    return regex.test(path);
  }

  /**
   * Create directory
   * Feature: 154 - Directory Management
   */
  async createDirectory(dirPath, options = {}) {
    this.emit('start', { agent: 'FileHandlingAgent', operation: 'createDirectory', dirPath });

    try {
      this.fileSystem.set(dirPath, {
        content: '',
        size: 0,
        format: 'directory',
        metadata: {
          created: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          type: 'directory'
        }
      });

      this.emit('complete', { dirPath });
      return { dirPath };
    } catch (error) {
      this.emit('error', { error: error.message });
      throw error;
    }
  }

  /**
   * Delete file or directory
   * Feature: 155 - Delete Operations
   */
  async deleteFile(filePath, options = {}) {
    this.emit('start', { agent: 'FileHandlingAgent', operation: 'deleteFile', filePath });

    try {
      const { createBackup = true } = options;
      if (this.fileSystem.has(filePath)) {
        if (createBackup) {
          await this.createBackup(filePath);
        }
        this.fileSystem.delete(filePath);
      }

      this.emit('complete', { filePath });
      return { filePath };
    } catch (error) {
      this.emit('error', { error: error.message });
      throw error;
    }
  }

  /**
   * Move/rename file
   * Feature: 156 - Move/Rename Operations
   */
  async moveFile(sourcePath, destPath, options = {}) {
    this.emit('start', { agent: 'FileHandlingAgent', operation: 'moveFile', sourcePath, destPath });

    try {
      const { overwrite = false } = options;
      if (!this.fileSystem.has(sourcePath)) {
        throw new Error(`Source file not found: ${sourcePath}`);
      }
      if (this.fileSystem.has(destPath) && !overwrite) {
        throw new Error(`Destination file already exists: ${destPath}`);
      }

      const fileData = this.fileSystem.get(sourcePath);
      fileData.metadata.lastModified = new Date().toISOString();
      fileData.metadata.previousPath = sourcePath;
      this.fileSystem.set(destPath, fileData);
      this.fileSystem.delete(sourcePath);

      this.emit('complete', { sourcePath, destPath });
      return { sourcePath, destPath };
    } catch (error) {
      this.emit('error', { error: error.message });
      throw error;
    }
  }

  /**
   * Copy file
   * Feature: 157 - Copy Operations
   */
  async copyFile(sourcePath, destPath, options = {}) {
    this.emit('start', { agent: 'FileHandlingAgent', operation: 'copyFile', sourcePath, destPath });

    try {
      if (!this.fileSystem.has(sourcePath)) {
        throw new Error(`Source file not found: ${sourcePath}`);
      }

      const fileData = this.fileSystem.get(sourcePath);
      const copiedData = {
        content: fileData.content,
        size: fileData.size,
        format: fileData.format,
        metadata: {
          ...fileData.metadata,
          created: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          copiedFrom: sourcePath
        }
      };

      this.fileSystem.set(destPath, copiedData);
      this.emit('complete', { sourcePath, destPath });
      return { sourcePath, destPath };
    } catch (error) {
      this.emit('error', { error: error.message });
      throw error;
    }
  }

  /**
   * File comparison
   * Feature: 158 - File Comparison
   */
  async compareFiles(filePath1, filePath2, options = {}) {
    this.emit('start', { agent: 'FileHandlingAgent', operation: 'compareFiles', filePath1, filePath2 });

    try {
      const { ignoreWhitespace = true } = options;
      if (!this.fileSystem.has(filePath1) || !this.fileSystem.has(filePath2)) {
        throw new Error('One or both files not found');
      }

      const file1 = this.fileSystem.get(filePath1);
      const file2 = this.fileSystem.get(filePath2);
      let content1 = file1.content;
      let content2 = file2.content;

      if (ignoreWhitespace) {
        content1 = content1.replace(/\s+/g, ' ').trim();
        content2 = content2.replace(/\s+/g, ' ').trim();
      }

      const identical = content1 === content2;
      const differences = identical ? [] : this.findDifferences(content1, content2);
      const result = {
        identical,
        differences,
        file1: { path: filePath1, size: file1.size, modified: file1.metadata.lastModified },
        file2: { path: filePath2, size: file2.size, modified: file2.metadata.lastModified }
      };

      this.emit('complete', result);
      return result;
    } catch (error) {
      this.emit('error', { error: error.message });
      throw error;
    }
  }

  findDifferences(text1, text2) {
    const differences = [];
    const lines1 = text1.split('\n');
    const lines2 = text2.split('\n');
    const maxLength = Math.max(lines1.length, lines2.length);
    for (let i = 0; i < maxLength; i++) {
      if (lines1[i] !== lines2[i]) {
        differences.push({
          line: i + 1,
          file1: lines1[i] || '(empty)',
          file2: lines2[i] || '(empty)'
        });
      }
    }
    return differences;
  }

  /**
   * File search
   * Feature: 159 - Search Functionality
   */
  async searchFiles(query, options = {}) {
    this.emit('start', { agent: 'FileHandlingAgent', operation: 'searchFiles', query });

    try {
      const { caseSensitive = false, wholeWord = false, regex = false } = options;
      const results = [];

      this.fileSystem.forEach((data, path) => {
        if (data.format === 'directory') return;

        let pattern;
        if (regex) {
          try {
            pattern = new RegExp(query, caseSensitive ? 'g' : 'gi');
          } catch (e) {
            return;
          }
        } else {
          const flags = caseSensitive ? 'g' : 'gi';
          const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          pattern = wholeWord ? new RegExp(`\\b${escaped}\\b`, flags) : new RegExp(escaped, flags);
        }

        const matches = [...data.content.matchAll(pattern)];
        if (matches.length > 0) {
          results.push({
            path,
            matches: matches.map(m => ({
              text: m[0],
              position: m.index,
              context: data.content.substring(Math.max(0, m.index - 50), Math.min(data.content.length, m.index + m[0].length + 50))
            }))
          });
        }
      });

      this.emit('complete', { results });
      return results;
    } catch (error) {
      this.emit('error', { error: error.message });
      throw error;
    }
  }

  /**
   * File metadata
   * Feature: 160 - Metadata Management
   */
  async getFileMetadata(filePath) {
    this.emit('start', { agent: 'FileHandlingAgent', operation: 'getFileMetadata', filePath });

    try {
      if (!this.fileSystem.has(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileData = this.fileSystem.get(filePath);
      const metadata = {
        ...fileData.metadata,
        size: fileData.size,
        format: fileData.format,
        path: filePath,
        extension: filePath.split('.').pop(),
        exists: true
      };

      this.emit('complete', { metadata });
      return metadata;
    } catch (error) {
      this.emit('error', { error: error.message });
      throw error;
    }
  }

  /**
   * Update file metadata
   * Feature: 160 - Metadata Management
   */
  async updateFileMetadata(filePath, metadata) {
    this.emit('start', { agent: 'FileHandlingAgent', operation: 'updateFileMetadata', filePath });

    try {
      if (!this.fileSystem.has(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileData = this.fileSystem.get(filePath);
      fileData.metadata = { ...fileData.metadata, ...metadata, lastModified: new Date().toISOString() };
      this.fileSystem.set(filePath, fileData);

      this.emit('complete', { filePath, metadata: fileData.metadata });
      return fileData.metadata;
    } catch (error) {
      this.emit('error', { error: error.message });
      throw error;
    }
  }

  simulateProcessing(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default FileHandlingAgent;