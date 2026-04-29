/**
 * FileCreationManager.js
 * AgentIQ Pro - Comprehensive File Creation & Management System
 * Handles creation, editing, conversion, and management of all file types
 */

export class FileCreationManager {
  constructor(sandboxFS = null) {
    this.fs = sandboxFS;
    this.openFiles = new Map();
    this.recentFiles = [];
    this.templates = this._initTemplates();
    this.converters = this._initConverters();
  }

  // ─── File Creation ────────────────────────────────────────────────────────

  createFile(name, type, content = '', options = {}) {
    const file = {
      id: `file_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name,
      type: type || this._detectType(name),
      content,
      size: new Blob([content]).size,
      created: Date.now(),
      modified: Date.now(),
      path: options.path || `/home/user/${name}`,
      metadata: options.metadata || {},
      version: 1,
      history: [],
    };

    if (this.fs) {
      this.fs.writeFile(file.path, content);
    }

    this.openFiles.set(file.id, file);
    this._addToRecent(file);
    return file;
  }

  createFromTemplate(templateName, filename, variables = {}) {
    const template = this.templates[templateName];
    if (!template) throw new Error(`Template not found: ${templateName}`);
    let content = template.content;
    Object.entries(variables).forEach(([key, val]) => {
      content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
    });
    return this.createFile(filename || template.defaultName, template.type, content);
  }

  createCodeFile(language, filename, code = '') {
    const ext = CODE_EXTENSIONS[language] || language;
    const name = filename || `main.${ext}`;
    const starter = code || CODE_STARTERS[language] || `// ${language} file\n`;
    return this.createFile(name, 'code', starter, { metadata: { language } });
  }

  createDocument(type, title, content = '') {
    const templates = {
      markdown: `# ${title}\n\n${content || 'Start writing here...'}`,
      html: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>${title}</title>\n</head>\n<body>\n  <h1>${title}</h1>\n  ${content || '<p>Content here</p>'}\n</body>\n</html>`,
      txt: `${title}\n${'='.repeat(title.length)}\n\n${content}`,
      json: JSON.stringify({ title, content, created: new Date().toISOString() }, null, 2),
      csv: `id,name,value\n1,example,${content || 'data'}`,
      xml: `<?xml version="1.0" encoding="UTF-8"?>\n<document>\n  <title>${title}</title>\n  <content>${content}</content>\n</document>`,
    };
    const ext = type === 'markdown' ? 'md' : type;
    return this.createFile(`${title.replace(/\s+/g, '_')}.${ext}`, type, templates[type] || content);
  }

  // ─── File Editing ─────────────────────────────────────────────────────────

  editFile(fileId, newContent) {
    const file = this.openFiles.get(fileId);
    if (!file) throw new Error(`File not found: ${fileId}`);
    file.history.push({ content: file.content, modified: file.modified, version: file.version });
    file.content = newContent;
    file.size = new Blob([newContent]).size;
    file.modified = Date.now();
    file.version++;
    if (this.fs) this.fs.writeFile(file.path, newContent);
    return file;
  }

  appendToFile(fileId, content) {
    const file = this.openFiles.get(fileId);
    if (!file) throw new Error(`File not found: ${fileId}`);
    return this.editFile(fileId, file.content + content);
  }

  insertInFile(fileId, position, content) {
    const file = this.openFiles.get(fileId);
    if (!file) throw new Error(`File not found: ${fileId}`);
    const newContent = file.content.slice(0, position) + content + file.content.slice(position);
    return this.editFile(fileId, newContent);
  }

  replaceInFile(fileId, search, replacement, all = true) {
    const file = this.openFiles.get(fileId);
    if (!file) throw new Error(`File not found: ${fileId}`);
    const newContent = all
      ? file.content.split(search).join(replacement)
      : file.content.replace(search, replacement);
    return this.editFile(fileId, newContent);
  }

  undoEdit(fileId) {
    const file = this.openFiles.get(fileId);
    if (!file || file.history.length === 0) return null;
    const prev = file.history.pop();
    file.content = prev.content;
    file.modified = prev.modified;
    file.version = prev.version;
    if (this.fs) this.fs.writeFile(file.path, file.content);
    return file;
  }

  // ─── File Conversion ──────────────────────────────────────────────────────

  convertFile(fileId, targetFormat) {
    const file = this.openFiles.get(fileId);
    if (!file) throw new Error(`File not found: ${fileId}`);
    const converter = this.converters[`${file.type}_to_${targetFormat}`];
    if (!converter) throw new Error(`No converter for ${file.type} → ${targetFormat}`);
    const newContent = converter(file.content);
    const newName = file.name.replace(/\.[^.]+$/, '') + '.' + targetFormat;
    return this.createFile(newName, targetFormat, newContent);
  }

  // ─── File Export ──────────────────────────────────────────────────────────

  exportFile(fileId, format = null) {
    const file = this.openFiles.get(fileId);
    if (!file) throw new Error(`File not found: ${fileId}`);
    const content = file.content;
    const mimeTypes = {
      js: 'application/javascript', ts: 'application/typescript',
      json: 'application/json', html: 'text/html', css: 'text/css',
      md: 'text/markdown', txt: 'text/plain', csv: 'text/csv',
      xml: 'application/xml', py: 'text/x-python',
    };
    const ext = format || file.name.split('.').pop() || 'txt';
    const mime = mimeTypes[ext] || 'text/plain';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
    return { success: true, filename: file.name };
  }

  exportAllAsZip(fileIds = null) {
    const files = fileIds
      ? fileIds.map(id => this.openFiles.get(id)).filter(Boolean)
      : [...this.openFiles.values()];
    // Simple zip-like export: create a JSON manifest + all files
    const manifest = {
      created: new Date().toISOString(),
      files: files.map(f => ({ name: f.name, type: f.type, path: f.path, size: f.size })),
    };
    const zipContent = JSON.stringify({ manifest, files: files.map(f => ({ name: f.name, content: f.content })) }, null, 2);
    const blob = new Blob([zipContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agentiq_files_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return { success: true, count: files.length };
  }

  // ─── File Analysis ────────────────────────────────────────────────────────

  analyzeFile(fileId) {
    const file = this.openFiles.get(fileId);
    if (!file) throw new Error(`File not found: ${fileId}`);
    const lines = file.content.split('\n');
    const words = file.content.split(/\s+/).filter(Boolean);
    const chars = file.content.length;
    const analysis = {
      name: file.name,
      type: file.type,
      size: file.size,
      lines: lines.length,
      words: words.length,
      chars,
      created: new Date(file.created).toISOString(),
      modified: new Date(file.modified).toISOString(),
      version: file.version,
      encoding: 'UTF-8',
    };
    if (file.type === 'code' || file.metadata?.language) {
      analysis.language = file.metadata?.language || this._detectLanguage(file.name, file.content);
      analysis.functions = this._countFunctions(file.content, analysis.language);
      analysis.imports = this._countImports(file.content, analysis.language);
      analysis.comments = this._countComments(file.content, analysis.language);
    }
    if (file.type === 'csv') {
      const rows = lines.filter(Boolean);
      analysis.rows = rows.length - 1;
      analysis.columns = rows[0]?.split(',').length || 0;
    }
    return analysis;
  }

  searchInFiles(query, fileIds = null) {
    const files = fileIds
      ? fileIds.map(id => this.openFiles.get(id)).filter(Boolean)
      : [...this.openFiles.values()];
    const results = [];
    files.forEach(file => {
      const lines = file.content.split('\n');
      lines.forEach((line, i) => {
        if (line.toLowerCase().includes(query.toLowerCase())) {
          results.push({ fileId: file.id, fileName: file.name, line: i + 1, content: line.trim(), context: lines.slice(Math.max(0, i - 1), i + 2).join('\n') });
        }
      });
    });
    return results;
  }

  // ─── File Organization ────────────────────────────────────────────────────

  organizeFiles(fileIds, strategy = 'by-type') {
    const files = fileIds.map(id => this.openFiles.get(id)).filter(Boolean);
    const organized = {};
    files.forEach(file => {
      let key;
      if (strategy === 'by-type') key = file.type;
      else if (strategy === 'by-date') key = new Date(file.created).toDateString();
      else if (strategy === 'by-size') key = file.size < 1024 ? 'small' : file.size < 102400 ? 'medium' : 'large';
      else key = 'all';
      if (!organized[key]) organized[key] = [];
      organized[key].push(file);
    });
    return organized;
  }

  detectDuplicates(fileIds = null) {
    const files = fileIds
      ? fileIds.map(id => this.openFiles.get(id)).filter(Boolean)
      : [...this.openFiles.values()];
    const hashes = new Map();
    const duplicates = [];
    files.forEach(file => {
      const hash = this._simpleHash(file.content);
      if (hashes.has(hash)) {
        duplicates.push({ original: hashes.get(hash), duplicate: file });
      } else {
        hashes.set(hash, file);
      }
    });
    return duplicates;
  }

  // ─── Getters ──────────────────────────────────────────────────────────────

  getFile(fileId) { return this.openFiles.get(fileId); }
  getAllFiles() { return [...this.openFiles.values()]; }
  getRecentFiles(n = 10) { return this.recentFiles.slice(0, n); }
  getFilesByType(type) { return [...this.openFiles.values()].filter(f => f.type === type); }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  _detectType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const typeMap = {
      js: 'code', jsx: 'code', ts: 'code', tsx: 'code', py: 'code',
      java: 'code', cpp: 'code', c: 'code', h: 'code', go: 'code',
      rs: 'code', rb: 'code', php: 'code', swift: 'code', kt: 'code',
      html: 'html', css: 'css', scss: 'css', less: 'css',
      md: 'markdown', txt: 'text', rtf: 'text',
      json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yaml',
      csv: 'csv', tsv: 'csv',
      pdf: 'pdf', doc: 'document', docx: 'document',
      xls: 'spreadsheet', xlsx: 'spreadsheet',
      png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image', webp: 'image',
      mp3: 'audio', wav: 'audio', ogg: 'audio',
      mp4: 'video', avi: 'video', mov: 'video',
      zip: 'archive', rar: 'archive', tar: 'archive', gz: 'archive',
      sh: 'script', bash: 'script', zsh: 'script',
      sql: 'database', db: 'database',
    };
    return typeMap[ext] || 'other';
  }

  _detectLanguage(filename, content) {
    const ext = filename.split('.').pop().toLowerCase();
    const langMap = { js: 'JavaScript', jsx: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript', py: 'Python', java: 'Java', cpp: 'C++', c: 'C', go: 'Go', rs: 'Rust', rb: 'Ruby', php: 'PHP', swift: 'Swift', kt: 'Kotlin', html: 'HTML', css: 'CSS', sh: 'Bash', sql: 'SQL' };
    return langMap[ext] || 'Unknown';
  }

  _countFunctions(content, language) {
    const patterns = {
      JavaScript: /function\s+\w+|const\s+\w+\s*=\s*(?:async\s+)?\(|=>\s*{/g,
      Python: /def\s+\w+/g,
      Java: /(?:public|private|protected|static)\s+\w+\s+\w+\s*\(/g,
    };
    const pattern = patterns[language];
    if (!pattern) return 0;
    return (content.match(pattern) || []).length;
  }

  _countImports(content, language) {
    const patterns = {
      JavaScript: /^(?:import|require)/gm,
      Python: /^(?:import|from)\s/gm,
      Java: /^import\s/gm,
    };
    const pattern = patterns[language];
    if (!pattern) return 0;
    return (content.match(pattern) || []).length;
  }

  _countComments(content, language) {
    const singleLine = (content.match(/\/\/.*/g) || []).length + (content.match(/#.*/g) || []).length;
    const multiLine = (content.match(/\/\*[\s\S]*?\*\//g) || []).length;
    return singleLine + multiLine;
  }

  _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  _addToRecent(file) {
    this.recentFiles = [file, ...this.recentFiles.filter(f => f.id !== file.id)].slice(0, 20);
  }

  _initTemplates() {
    return {
      'react-component': {
        type: 'code',
        defaultName: 'Component.jsx',
        content: `import React, { useState } from 'react';\n\nconst {{name}} = ({ {{props}} }) => {\n  const [state, setState] = useState(null);\n\n  return (\n    <div className="{{className}}">\n      <h2>{{name}}</h2>\n    </div>\n  );\n};\n\nexport default {{name}};\n`,
      },
      'express-api': {
        type: 'code',
        defaultName: 'api.js',
        content: `const express = require('express');\nconst router = express.Router();\n\n// GET {{endpoint}}\nrouter.get('{{endpoint}}', async (req, res) => {\n  try {\n    res.json({ success: true, data: [] });\n  } catch (err) {\n    res.status(500).json({ error: err.message });\n  }\n});\n\nmodule.exports = router;\n`,
      },
      'python-script': {
        type: 'code',
        defaultName: 'script.py',
        content: `#!/usr/bin/env python3\n"""{{description}}"""\n\nimport os\nimport sys\n\ndef main():\n    """Main function."""\n    print("{{name}}")\n\nif __name__ == "__main__":\n    main()\n`,
      },
      'readme': {
        type: 'markdown',
        defaultName: 'README.md',
        content: `# {{title}}\n\n{{description}}\n\n## Installation\n\n\`\`\`bash\nnpm install\n\`\`\`\n\n## Usage\n\n\`\`\`bash\nnpm start\n\`\`\`\n\n## Features\n\n- Feature 1\n- Feature 2\n\n## License\n\nMIT\n`,
      },
      'package-json': {
        type: 'json',
        defaultName: 'package.json',
        content: `{\n  "name": "{{name}}",\n  "version": "1.0.0",\n  "description": "{{description}}",\n  "main": "index.js",\n  "scripts": {\n    "start": "node index.js",\n    "test": "jest"\n  },\n  "keywords": [],\n  "author": "{{author}}",\n  "license": "MIT"\n}\n`,
      },
      'dockerfile': {
        type: 'code',
        defaultName: 'Dockerfile',
        content: `FROM node:18-alpine\n\nWORKDIR /app\n\nCOPY package*.json ./\nRUN npm ci --only=production\n\nCOPY . .\n\nEXPOSE {{port}}\n\nCMD ["node", "index.js"]\n`,
      },
      'github-action': {
        type: 'yaml',
        defaultName: '.github/workflows/ci.yml',
        content: `name: CI\n\non:\n  push:\n    branches: [main]\n  pull_request:\n    branches: [main]\n\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v3\n      - name: Setup Node.js\n        uses: actions/setup-node@v3\n        with:\n          node-version: '18'\n      - run: npm ci\n      - run: npm test\n`,
      },
      'html-page': {
        type: 'html',
        defaultName: 'index.html',
        content: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>{{title}}</title>\n  <style>\n    body { font-family: sans-serif; margin: 0; padding: 20px; }\n  </style>\n</head>\n<body>\n  <h1>{{title}}</h1>\n  <p>{{description}}</p>\n  <script>\n    // Your JavaScript here\n  </script>\n</body>\n</html>\n`,
      },
    };
  }

  _initConverters() {
    return {
      markdown_to_html: (md) => {
        return md
          .replace(/^# (.+)$/gm, '<h1>$1</h1>')
          .replace(/^## (.+)$/gm, '<h2>$1</h2>')
          .replace(/^### (.+)$/gm, '<h3>$1</h3>')
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/`(.+?)`/g, '<code>$1</code>')
          .replace(/\n\n/g, '</p><p>')
          .replace(/^- (.+)$/gm, '<li>$1</li>');
      },
      json_to_csv: (json) => {
        try {
          const data = JSON.parse(json);
          const arr = Array.isArray(data) ? data : [data];
          const headers = Object.keys(arr[0] || {});
          const rows = arr.map(row => headers.map(h => JSON.stringify(row[h] || '')).join(','));
          return [headers.join(','), ...rows].join('\n');
        } catch { return json; }
      },
      csv_to_json: (csv) => {
        const lines = csv.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        const data = lines.slice(1).map(line => {
          const values = line.split(',');
          return headers.reduce((obj, h, i) => { obj[h] = values[i]?.trim(); return obj; }, {});
        });
        return JSON.stringify(data, null, 2);
      },
      html_to_markdown: (html) => {
        return html
          .replace(/<h1>(.*?)<\/h1>/g, '# $1\n')
          .replace(/<h2>(.*?)<\/h2>/g, '## $1\n')
          .replace(/<h3>(.*?)<\/h3>/g, '### $1\n')
          .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
          .replace(/<em>(.*?)<\/em>/g, '*$1*')
          .replace(/<code>(.*?)<\/code>/g, '`$1`')
          .replace(/<li>(.*?)<\/li>/g, '- $1\n')
          .replace(/<[^>]+>/g, '');
      },
    };
  }
}

const CODE_EXTENSIONS = {
  JavaScript: 'js', TypeScript: 'ts', Python: 'py', Java: 'java',
  'C++': 'cpp', C: 'c', Go: 'go', Rust: 'rs', Ruby: 'rb',
  PHP: 'php', Swift: 'swift', Kotlin: 'kt', HTML: 'html', CSS: 'css',
  SQL: 'sql', Bash: 'sh', YAML: 'yml', JSON: 'json', Markdown: 'md',
};

const CODE_STARTERS = {
  JavaScript: '// JavaScript\nconsole.log("Hello, World!");\n',
  TypeScript: '// TypeScript\nconst greeting: string = "Hello, World!";\nconsole.log(greeting);\n',
  Python: '#!/usr/bin/env python3\n# Python\nprint("Hello, World!")\n',
  Java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}\n',
  Go: 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, World!")\n}\n',
  Rust: 'fn main() {\n    println!("Hello, World!");\n}\n',
  HTML: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Page</title>\n</head>\n<body>\n  <h1>Hello, World!</h1>\n</body>\n</html>\n',
  CSS: '/* CSS Styles */\nbody {\n  margin: 0;\n  padding: 0;\n  font-family: sans-serif;\n}\n',
  SQL: '-- SQL Query\nSELECT * FROM table_name WHERE condition = true;\n',
  Bash: '#!/bin/bash\n# Bash Script\necho "Hello, World!"\n',
};

export default FileCreationManager;
