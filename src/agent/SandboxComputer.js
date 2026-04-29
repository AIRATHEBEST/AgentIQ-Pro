/**
 * SandboxComputer.js
 * AgentIQ Pro - Persistent Sandbox Computer Environment
 * Provides a full Ubuntu-like VM environment in the browser with:
 * - Virtual filesystem (persistent via localStorage/IndexedDB)
 * - Terminal/shell emulation
 * - Code execution (JavaScript sandbox)
 * - File creation, editing, deletion
 * - Package management simulation
 * - Process management
 */

export class SandboxComputer {
  constructor() {
    this.fs = new VirtualFileSystem();
    this.terminal = new TerminalEmulator(this.fs);
    this.processManager = new ProcessManager();
    this.packageManager = new PackageManager();
    this.history = [];
    this.env = {
      HOME: '/home/user',
      USER: 'agentiq',
      PATH: '/usr/local/bin:/usr/bin:/bin',
      SHELL: '/bin/bash',
      TERM: 'xterm-256color',
      PWD: '/home/user',
    };
    this._initDefaultFS();
  }

  _initDefaultFS() {
    const dirs = [
      '/home/user',
      '/home/user/projects',
      '/home/user/documents',
      '/home/user/downloads',
      '/tmp',
      '/usr/bin',
      '/usr/local/bin',
      '/etc',
      '/var/log',
    ];
    dirs.forEach(d => this.fs.mkdir(d));
    this.fs.writeFile('/home/user/.bashrc', '# AgentIQ Pro Sandbox Shell\nexport PS1="agentiq@sandbox:~$ "\n');
    this.fs.writeFile('/etc/hostname', 'agentiq-sandbox\n');
    this.fs.writeFile('/etc/os-release', 'NAME="AgentIQ Pro Sandbox"\nVERSION="1.0"\nID=agentiq\n');
    this.fs.writeFile('/home/user/README.md', '# AgentIQ Pro Sandbox\nWelcome to your persistent sandbox environment!\n\nYou can:\n- Create and edit files\n- Run JavaScript code\n- Install simulated packages\n- Manage processes\n- Explore the virtual filesystem\n');
  }

  async execute(command, options = {}) {
    const { cwd = this.env.PWD, timeout = 30000 } = options;
    this.history.push({ command, timestamp: Date.now(), cwd });
    try {
      const result = await this.terminal.execute(command, { cwd, env: this.env, timeout });
      if (result.newCwd) this.env.PWD = result.newCwd;
      return result;
    } catch (err) {
      return { stdout: '', stderr: err.message, exitCode: 1, success: false };
    }
  }

  createFile(path, content = '') {
    return this.fs.writeFile(path, content);
  }

  readFile(path) {
    return this.fs.readFile(path);
  }

  deleteFile(path) {
    return this.fs.deleteFile(path);
  }

  listFiles(path = '/home/user') {
    return this.fs.listDir(path);
  }

  getFileTree(path = '/home/user') {
    return this.fs.getTree(path);
  }

  installPackage(name) {
    return this.packageManager.install(name);
  }

  getInstalledPackages() {
    return this.packageManager.list();
  }

  getProcesses() {
    return this.processManager.list();
  }

  getSystemInfo() {
    return {
      os: 'AgentIQ Pro Sandbox (Ubuntu-compatible)',
      kernel: '5.15.0-agentiq',
      arch: 'x86_64',
      uptime: Math.floor((Date.now() - this._startTime) / 1000),
      memory: { total: '4GB', used: '512MB', free: '3.5GB' },
      disk: { total: '20GB', used: `${(this.fs.getTotalSize() / 1024 / 1024).toFixed(1)}MB`, free: '19.9GB' },
      packages: this.packageManager.list().length,
      processes: this.processManager.list().length,
    };
  }

  exportSnapshot() {
    return {
      fs: this.fs.export(),
      env: this.env,
      history: this.history,
      packages: this.packageManager.list(),
      timestamp: Date.now(),
    };
  }

  importSnapshot(snapshot) {
    if (snapshot.fs) this.fs.import(snapshot.fs);
    if (snapshot.env) this.env = { ...this.env, ...snapshot.env };
    if (snapshot.history) this.history = snapshot.history;
    if (snapshot.packages) this.packageManager.importList(snapshot.packages);
  }
}

// ─── Virtual File System ───────────────────────────────────────────────────────
export class VirtualFileSystem {
  constructor() {
    this.nodes = {};
    this._loadFromStorage();
  }

  _key() { return 'agentiq_vfs'; }

  _loadFromStorage() {
    try {
      const saved = localStorage.getItem(this._key());
      if (saved) this.nodes = JSON.parse(saved);
    } catch {}
  }

  _saveToStorage() {
    try {
      localStorage.setItem(this._key(), JSON.stringify(this.nodes));
    } catch {}
  }

  _normalizePath(p) {
    return p.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  }

  mkdir(path, recursive = true) {
    path = this._normalizePath(path);
    if (recursive) {
      const parts = path.split('/').filter(Boolean);
      let current = '';
      for (const part of parts) {
        current += '/' + part;
        if (!this.nodes[current]) {
          this.nodes[current] = { type: 'dir', name: part, created: Date.now(), modified: Date.now() };
        }
      }
    } else {
      this.nodes[path] = { type: 'dir', name: path.split('/').pop(), created: Date.now(), modified: Date.now() };
    }
    this._saveToStorage();
    return { success: true };
  }

  writeFile(path, content) {
    path = this._normalizePath(path);
    const dir = path.substring(0, path.lastIndexOf('/')) || '/';
    this.mkdir(dir);
    const existing = this.nodes[path];
    this.nodes[path] = {
      type: 'file',
      name: path.split('/').pop(),
      content: content,
      size: new Blob([content]).size,
      created: existing ? existing.created : Date.now(),
      modified: Date.now(),
      permissions: '644',
    };
    this._saveToStorage();
    return { success: true, path, size: this.nodes[path].size };
  }

  appendFile(path, content) {
    path = this._normalizePath(path);
    const existing = this.nodes[path];
    if (existing && existing.type === 'file') {
      return this.writeFile(path, existing.content + content);
    }
    return this.writeFile(path, content);
  }

  readFile(path) {
    path = this._normalizePath(path);
    const node = this.nodes[path];
    if (!node) return { success: false, error: `No such file: ${path}` };
    if (node.type === 'dir') return { success: false, error: `Is a directory: ${path}` };
    return { success: true, content: node.content, size: node.size, modified: node.modified };
  }

  deleteFile(path) {
    path = this._normalizePath(path);
    if (!this.nodes[path]) return { success: false, error: `No such file: ${path}` };
    delete this.nodes[path];
    this._saveToStorage();
    return { success: true };
  }

  deleteDir(path, recursive = false) {
    path = this._normalizePath(path);
    if (!this.nodes[path]) return { success: false, error: `No such directory: ${path}` };
    if (recursive) {
      Object.keys(this.nodes).forEach(k => {
        if (k === path || k.startsWith(path + '/')) delete this.nodes[k];
      });
    } else {
      const children = Object.keys(this.nodes).filter(k => k !== path && k.startsWith(path + '/'));
      if (children.length > 0) return { success: false, error: 'Directory not empty' };
      delete this.nodes[path];
    }
    this._saveToStorage();
    return { success: true };
  }

  listDir(path) {
    path = this._normalizePath(path);
    const entries = [];
    Object.entries(this.nodes).forEach(([k, v]) => {
      const parent = k.substring(0, k.lastIndexOf('/')) || '/';
      if (parent === path) entries.push({ ...v, path: k });
    });
    return entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  getTree(path, depth = 0, maxDepth = 5) {
    path = this._normalizePath(path);
    if (depth > maxDepth) return null;
    const node = this.nodes[path];
    if (!node) return null;
    const result = { ...node, path, children: [] };
    if (node.type === 'dir') {
      result.children = this.listDir(path)
        .map(child => this.getTree(child.path, depth + 1, maxDepth))
        .filter(Boolean);
    }
    return result;
  }

  exists(path) {
    return !!this.nodes[this._normalizePath(path)];
  }

  stat(path) {
    const node = this.nodes[this._normalizePath(path)];
    if (!node) return null;
    return { ...node };
  }

  getTotalSize() {
    return Object.values(this.nodes)
      .filter(n => n.type === 'file')
      .reduce((sum, n) => sum + (n.size || 0), 0);
  }

  export() {
    return JSON.parse(JSON.stringify(this.nodes));
  }

  import(data) {
    this.nodes = data;
    this._saveToStorage();
  }

  clear() {
    this.nodes = {};
    this._saveToStorage();
  }
}

// ─── Terminal Emulator ─────────────────────────────────────────────────────────
export class TerminalEmulator {
  constructor(fs) {
    this.fs = fs;
    this.aliases = {
      ll: 'ls -la',
      la: 'ls -a',
      cls: 'clear',
    };
  }

  async execute(rawCommand, { cwd = '/home/user', env = {}, timeout = 30000 } = {}) {
    // Expand aliases
    const parts = rawCommand.trim().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    // Handle pipes (simple)
    if (rawCommand.includes('|')) {
      return this._executePipe(rawCommand, { cwd, env });
    }

    // Handle redirects
    if (rawCommand.includes('>')) {
      return this._executeRedirect(rawCommand, { cwd, env });
    }

    return this._executeCommand(cmd, args, { cwd, env });
  }

  async _executeCommand(cmd, args, { cwd, env }) {
    const normPath = (p) => {
      if (!p || p === '~') return env.HOME || '/home/user';
      if (p.startsWith('~/')) return (env.HOME || '/home/user') + p.slice(1);
      if (p.startsWith('/')) return p;
      return (cwd + '/' + p).replace(/\/+/g, '/');
    };

    switch (cmd) {
      case 'ls': {
        const target = args.find(a => !a.startsWith('-')) || cwd;
        const path = normPath(target);
        const entries = this.fs.listDir(path);
        const showAll = args.includes('-a') || args.includes('-la') || args.includes('-al');
        const longFormat = args.includes('-l') || args.includes('-la') || args.includes('-al');
        const filtered = showAll ? entries : entries.filter(e => !e.name.startsWith('.'));
        if (longFormat) {
          const lines = filtered.map(e => {
            const perm = e.type === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--';
            const size = e.size ? String(e.size).padStart(8) : '       0';
            const date = new Date(e.modified || Date.now()).toLocaleDateString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
            const color = e.type === 'dir' ? `\x1b[34m${e.name}\x1b[0m` : e.name;
            return `${perm} 1 user user ${size} ${date} ${color}`;
          });
          return { stdout: lines.join('\n'), stderr: '', exitCode: 0, success: true };
        }
        const names = filtered.map(e => e.type === 'dir' ? `\x1b[34m${e.name}\x1b[0m` : e.name);
        return { stdout: names.join('  '), stderr: '', exitCode: 0, success: true };
      }

      case 'pwd':
        return { stdout: cwd, stderr: '', exitCode: 0, success: true };

      case 'cd': {
        const target = args[0] || env.HOME || '/home/user';
        const path = normPath(target);
        if (!this.fs.exists(path)) return { stdout: '', stderr: `cd: ${target}: No such file or directory`, exitCode: 1, success: false };
        const stat = this.fs.stat(path);
        if (stat.type !== 'dir') return { stdout: '', stderr: `cd: ${target}: Not a directory`, exitCode: 1, success: false };
        return { stdout: '', stderr: '', exitCode: 0, success: true, newCwd: path };
      }

      case 'mkdir': {
        const recursive = args.includes('-p');
        const dirs = args.filter(a => !a.startsWith('-'));
        dirs.forEach(d => this.fs.mkdir(normPath(d), recursive));
        return { stdout: '', stderr: '', exitCode: 0, success: true };
      }

      case 'touch': {
        args.filter(a => !a.startsWith('-')).forEach(f => {
          const p = normPath(f);
          if (!this.fs.exists(p)) this.fs.writeFile(p, '');
        });
        return { stdout: '', stderr: '', exitCode: 0, success: true };
      }

      case 'cat': {
        if (args.length === 0) return { stdout: '', stderr: 'cat: missing operand', exitCode: 1, success: false };
        const outputs = [];
        for (const f of args.filter(a => !a.startsWith('-'))) {
          const r = this.fs.readFile(normPath(f));
          if (!r.success) return { stdout: '', stderr: `cat: ${f}: ${r.error}`, exitCode: 1, success: false };
          outputs.push(r.content);
        }
        return { stdout: outputs.join('\n'), stderr: '', exitCode: 0, success: true };
      }

      case 'echo': {
        const text = args.join(' ').replace(/^["']|["']$/g, '');
        return { stdout: text, stderr: '', exitCode: 0, success: true };
      }

      case 'rm': {
        const recursive = args.includes('-r') || args.includes('-rf') || args.includes('-fr');
        const files = args.filter(a => !a.startsWith('-'));
        for (const f of files) {
          const p = normPath(f);
          const stat = this.fs.stat(p);
          if (!stat) return { stdout: '', stderr: `rm: ${f}: No such file or directory`, exitCode: 1, success: false };
          if (stat.type === 'dir') this.fs.deleteDir(p, recursive);
          else this.fs.deleteFile(p);
        }
        return { stdout: '', stderr: '', exitCode: 0, success: true };
      }

      case 'cp': {
        if (args.length < 2) return { stdout: '', stderr: 'cp: missing operand', exitCode: 1, success: false };
        const src = normPath(args[args.length - 2]);
        const dst = normPath(args[args.length - 1]);
        const r = this.fs.readFile(src);
        if (!r.success) return { stdout: '', stderr: `cp: ${r.error}`, exitCode: 1, success: false };
        this.fs.writeFile(dst, r.content);
        return { stdout: '', stderr: '', exitCode: 0, success: true };
      }

      case 'mv': {
        if (args.length < 2) return { stdout: '', stderr: 'mv: missing operand', exitCode: 1, success: false };
        const src = normPath(args[0]);
        const dst = normPath(args[1]);
        const r = this.fs.readFile(src);
        if (!r.success) return { stdout: '', stderr: `mv: ${r.error}`, exitCode: 1, success: false };
        this.fs.writeFile(dst, r.content);
        this.fs.deleteFile(src);
        return { stdout: '', stderr: '', exitCode: 0, success: true };
      }

      case 'grep': {
        const pattern = args.find(a => !a.startsWith('-'));
        const file = args[args.length - 1];
        if (!pattern || !file) return { stdout: '', stderr: 'grep: missing arguments', exitCode: 1, success: false };
        const r = this.fs.readFile(normPath(file));
        if (!r.success) return { stdout: '', stderr: `grep: ${file}: ${r.error}`, exitCode: 1, success: false };
        const lines = r.content.split('\n').filter(l => l.includes(pattern));
        return { stdout: lines.join('\n'), stderr: '', exitCode: lines.length ? 0 : 1, success: true };
      }

      case 'wc': {
        const file = args.find(a => !a.startsWith('-'));
        if (!file) return { stdout: '', stderr: 'wc: missing operand', exitCode: 1, success: false };
        const r = this.fs.readFile(normPath(file));
        if (!r.success) return { stdout: '', stderr: `wc: ${r.error}`, exitCode: 1, success: false };
        const lines = r.content.split('\n').length;
        const words = r.content.split(/\s+/).filter(Boolean).length;
        const chars = r.content.length;
        return { stdout: `${lines} ${words} ${chars} ${file}`, stderr: '', exitCode: 0, success: true };
      }

      case 'find': {
        const dir = normPath(args[0] || cwd);
        const nameFlag = args.indexOf('-name');
        const pattern = nameFlag >= 0 ? args[nameFlag + 1] : null;
        const results = Object.keys(this.fs.nodes).filter(k => {
          if (!k.startsWith(dir)) return false;
          if (pattern) {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
            return regex.test(k.split('/').pop());
          }
          return true;
        });
        return { stdout: results.join('\n'), stderr: '', exitCode: 0, success: true };
      }

      case 'head': {
        const n = parseInt(args.find(a => a.startsWith('-'))?.slice(1) || '10');
        const file = args.find(a => !a.startsWith('-'));
        if (!file) return { stdout: '', stderr: 'head: missing operand', exitCode: 1, success: false };
        const r = this.fs.readFile(normPath(file));
        if (!r.success) return { stdout: '', stderr: `head: ${r.error}`, exitCode: 1, success: false };
        return { stdout: r.content.split('\n').slice(0, n).join('\n'), stderr: '', exitCode: 0, success: true };
      }

      case 'tail': {
        const n = parseInt(args.find(a => a.startsWith('-'))?.slice(1) || '10');
        const file = args.find(a => !a.startsWith('-'));
        if (!file) return { stdout: '', stderr: 'tail: missing operand', exitCode: 1, success: false };
        const r = this.fs.readFile(normPath(file));
        if (!r.success) return { stdout: '', stderr: `tail: ${r.error}`, exitCode: 1, success: false };
        const lines = r.content.split('\n');
        return { stdout: lines.slice(-n).join('\n'), stderr: '', exitCode: 0, success: true };
      }

      case 'node':
      case 'node.js': {
        const file = args[0];
        if (!file) return { stdout: '', stderr: 'node: missing script', exitCode: 1, success: false };
        const r = this.fs.readFile(normPath(file));
        if (!r.success) return { stdout: '', stderr: `node: ${r.error}`, exitCode: 1, success: false };
        return this._runJavaScript(r.content);
      }

      case 'python3':
      case 'python': {
        const file = args[0];
        if (!file) return { stdout: '', stderr: 'python: missing script', exitCode: 1, success: false };
        const r = this.fs.readFile(normPath(file));
        if (!r.success) return { stdout: '', stderr: `python: ${r.error}`, exitCode: 1, success: false };
        return { stdout: `[Python simulation] Running ${file}...\n(Python execution requires backend integration)`, stderr: '', exitCode: 0, success: true };
      }

      case 'npm':
      case 'yarn':
      case 'pnpm': {
        const subcmd = args[0];
        if (subcmd === 'install' || subcmd === 'i') {
          const pkg = args[1];
          if (pkg) return { stdout: `added ${pkg} package\n✓ Simulated install complete`, stderr: '', exitCode: 0, success: true };
          return { stdout: 'Installing dependencies...\n✓ Simulated install complete', stderr: '', exitCode: 0, success: true };
        }
        if (subcmd === 'run') {
          return { stdout: `> ${args[1]}\nSimulated script execution`, stderr: '', exitCode: 0, success: true };
        }
        return { stdout: `${cmd} ${args.join(' ')}`, stderr: '', exitCode: 0, success: true };
      }

      case 'git': {
        const subcmd = args[0];
        const responses = {
          init: 'Initialized empty Git repository in .git/',
          status: 'On branch main\nnothing to commit, working tree clean',
          log: 'commit abc1234 (HEAD -> main)\nAuthor: AgentIQ User\nDate: ' + new Date().toDateString() + '\n\n    Initial commit',
          add: '',
          commit: '[main abc1234] ' + (args.slice(2).join(' ') || 'commit'),
          push: 'Everything up-to-date',
          pull: 'Already up to date.',
          clone: `Cloning into '${args[1] || 'repo'}'...`,
          branch: 'main\n* main',
          checkout: `Switched to branch '${args[1] || 'main'}'`,
          diff: '',
          stash: 'Saved working directory and index state',
        };
        return { stdout: responses[subcmd] || `git ${args.join(' ')}`, stderr: '', exitCode: 0, success: true };
      }

      case 'curl': {
        return { stdout: `[Simulated curl] ${args.join(' ')}\n(Network requests require backend integration)`, stderr: '', exitCode: 0, success: true };
      }

      case 'wget': {
        return { stdout: `[Simulated wget] ${args.join(' ')}\n(Network requests require backend integration)`, stderr: '', exitCode: 0, success: true };
      }

      case 'apt':
      case 'apt-get': {
        const subcmd = args[0];
        if (subcmd === 'install') {
          const pkgs = args.slice(1).filter(a => !a.startsWith('-'));
          return { stdout: `Reading package lists...\nBuilding dependency tree...\nInstalling: ${pkgs.join(', ')}\n✓ Done`, stderr: '', exitCode: 0, success: true };
        }
        if (subcmd === 'update') return { stdout: 'Hit:1 http://archive.ubuntu.com/ubuntu focal InRelease\nReading package lists... Done', stderr: '', exitCode: 0, success: true };
        return { stdout: `${cmd} ${args.join(' ')}`, stderr: '', exitCode: 0, success: true };
      }

      case 'pip':
      case 'pip3': {
        const subcmd = args[0];
        if (subcmd === 'install') {
          const pkgs = args.slice(1).filter(a => !a.startsWith('-'));
          return { stdout: `Collecting ${pkgs.join(', ')}\nInstalling collected packages: ${pkgs.join(', ')}\nSuccessfully installed ${pkgs.join(', ')}`, stderr: '', exitCode: 0, success: true };
        }
        return { stdout: `${cmd} ${args.join(' ')}`, stderr: '', exitCode: 0, success: true };
      }

      case 'clear':
        return { stdout: '\x1b[2J\x1b[H', stderr: '', exitCode: 0, success: true, clear: true };

      case 'history':
        return { stdout: this.history ? this.history.map((h, i) => `  ${i + 1}  ${h}`).join('\n') : '', stderr: '', exitCode: 0, success: true };

      case 'env':
        return { stdout: Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n'), stderr: '', exitCode: 0, success: true };

      case 'export': {
        const [key, val] = args[0]?.split('=') || [];
        if (key) env[key] = val || '';
        return { stdout: '', stderr: '', exitCode: 0, success: true };
      }

      case 'which': {
        const cmds = { node: '/usr/bin/node', python3: '/usr/bin/python3', git: '/usr/bin/git', npm: '/usr/bin/npm' };
        const found = cmds[args[0]];
        if (found) return { stdout: found, stderr: '', exitCode: 0, success: true };
        return { stdout: '', stderr: `which: no ${args[0]} in (${env.PATH})`, exitCode: 1, success: false };
      }

      case 'uname':
        return { stdout: args.includes('-a') ? 'Linux agentiq-sandbox 5.15.0-agentiq #1 SMP x86_64 GNU/Linux' : 'Linux', stderr: '', exitCode: 0, success: true };

      case 'whoami':
        return { stdout: env.USER || 'agentiq', stderr: '', exitCode: 0, success: true };

      case 'date':
        return { stdout: new Date().toString(), stderr: '', exitCode: 0, success: true };

      case 'uptime':
        return { stdout: `up 1 day, 2:30, 1 user, load average: 0.10, 0.08, 0.05`, stderr: '', exitCode: 0, success: true };

      case 'df':
        return { stdout: 'Filesystem     1K-blocks    Used Available Use% Mounted on\n/dev/sda1       20971520  524288  20447232   3% /', stderr: '', exitCode: 0, success: true };

      case 'free':
        return { stdout: '              total        used        free\nMem:        4194304      524288     3670016\nSwap:       2097152           0     2097152', stderr: '', exitCode: 0, success: true };

      case 'ps':
        return { stdout: '  PID TTY          TIME CMD\n    1 pts/0    00:00:00 bash\n  100 pts/0    00:00:00 ps', stderr: '', exitCode: 0, success: true };

      case 'kill':
        return { stdout: '', stderr: '', exitCode: 0, success: true };

      case 'sleep':
        return new Promise(resolve => setTimeout(() => resolve({ stdout: '', stderr: '', exitCode: 0, success: true }), Math.min(parseInt(args[0] || 1) * 1000, 5000)));

      case 'man':
        return { stdout: `Manual page for ${args[0]}:\nThis is a simulated manual page.\nUse --help flag for command-specific help.`, stderr: '', exitCode: 0, success: true };

      case 'help':
      case '--help':
        return { stdout: HELP_TEXT, stderr: '', exitCode: 0, success: true };

      case 'write':
      case 'tee': {
        // write <file> <content> - custom command for file creation
        if (cmd === 'write' && args.length >= 2) {
          const file = normPath(args[0]);
          const content = args.slice(1).join(' ');
          this.fs.writeFile(file, content);
          return { stdout: `Written to ${file}`, stderr: '', exitCode: 0, success: true };
        }
        return { stdout: '', stderr: `${cmd}: usage: ${cmd} <file>`, exitCode: 1, success: false };
      }

      case 'code':
      case 'nano':
      case 'vim':
      case 'vi':
      case 'emacs': {
        const file = args[0];
        if (!file) return { stdout: '', stderr: `${cmd}: missing file operand`, exitCode: 1, success: false };
        return { stdout: `[${cmd}] Opening ${file} in editor...\n(Use the File Editor panel to edit files)`, stderr: '', exitCode: 0, success: true, openEditor: normPath(file) };
      }

      case '':
        return { stdout: '', stderr: '', exitCode: 0, success: true };

      default: {
        // Try to run as a script file
        const scriptPath = normPath(cmd);
        if (this.fs.exists(scriptPath)) {
          const r = this.fs.readFile(scriptPath);
          if (r.success) return this._runJavaScript(r.content);
        }
        return { stdout: '', stderr: `${cmd}: command not found`, exitCode: 127, success: false };
      }
    }
  }

  async _executePipe(command, { cwd, env }) {
    const parts = command.split('|').map(s => s.trim());
    let lastOutput = '';
    for (const part of parts) {
      const [cmd, ...args] = part.split(/\s+/);
      if (cmd === 'grep' && lastOutput) {
        const pattern = args[0];
        const lines = lastOutput.split('\n').filter(l => l.includes(pattern));
        lastOutput = lines.join('\n');
      } else if (cmd === 'wc') {
        const flag = args[0];
        if (flag === '-l') lastOutput = String(lastOutput.split('\n').filter(Boolean).length);
        else if (flag === '-w') lastOutput = String(lastOutput.split(/\s+/).filter(Boolean).length);
        else lastOutput = String(lastOutput.length);
      } else if (cmd === 'head') {
        const n = parseInt(args.find(a => a.startsWith('-'))?.slice(1) || '10');
        lastOutput = lastOutput.split('\n').slice(0, n).join('\n');
      } else if (cmd === 'tail') {
        const n = parseInt(args.find(a => a.startsWith('-'))?.slice(1) || '10');
        lastOutput = lastOutput.split('\n').slice(-n).join('\n');
      } else if (cmd === 'sort') {
        lastOutput = lastOutput.split('\n').sort().join('\n');
      } else if (cmd === 'uniq') {
        const lines = lastOutput.split('\n');
        lastOutput = lines.filter((l, i) => i === 0 || l !== lines[i - 1]).join('\n');
      } else {
        const result = await this._executeCommand(cmd, args, { cwd, env });
        lastOutput = result.stdout;
      }
    }
    return { stdout: lastOutput, stderr: '', exitCode: 0, success: true };
  }

  async _executeRedirect(command, { cwd, env }) {
    const append = command.includes('>>');
    const [cmdPart, filePart] = command.split(append ? '>>' : '>').map(s => s.trim());
    const [cmd, ...args] = cmdPart.split(/\s+/);
    const result = await this._executeCommand(cmd, args, { cwd, env });
    const filePath = (cwd + '/' + filePart.trim()).replace(/\/+/g, '/');
    if (append) this.fs.appendFile(filePath, result.stdout + '\n');
    else this.fs.writeFile(filePath, result.stdout + '\n');
    return { stdout: '', stderr: result.stderr, exitCode: result.exitCode, success: result.success };
  }

  _runJavaScript(code) {
    const logs = [];
    const originalConsole = { log: console.log, error: console.error, warn: console.warn };
    try {
      const sandboxConsole = {
        log: (...args) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')),
        error: (...args) => logs.push('ERROR: ' + args.join(' ')),
        warn: (...args) => logs.push('WARN: ' + args.join(' ')),
        info: (...args) => logs.push(args.join(' ')),
      };
      // eslint-disable-next-line no-new-func
      const fn = new Function('console', 'require', code);
      const result = fn(sandboxConsole, (mod) => {
        const mocks = { fs: { readFileSync: () => '', writeFileSync: () => {} }, path: { join: (...a) => a.join('/'), resolve: (...a) => '/' + a.join('/') } };
        return mocks[mod] || {};
      });
      if (result !== undefined) logs.push(String(result));
      return { stdout: logs.join('\n'), stderr: '', exitCode: 0, success: true };
    } catch (err) {
      return { stdout: logs.join('\n'), stderr: err.message, exitCode: 1, success: false };
    }
  }
}

const HELP_TEXT = `AgentIQ Pro Sandbox - Available Commands:
  File System:  ls, cd, pwd, mkdir, touch, cat, rm, cp, mv, find, head, tail, grep, wc
  Editors:      nano, vim, vi, code, emacs (opens File Editor panel)
  Execution:    node, python3, bash
  Package Mgr:  npm, yarn, pip, pip3, apt, apt-get
  Version Ctrl: git (init, add, commit, push, pull, clone, status, log, branch, checkout)
  System:       uname, whoami, date, uptime, df, free, ps, kill, env, export, which
  Utilities:    echo, clear, history, sleep, man, write, tee
  Custom:       write <file> <content> - create file with content`;

// ─── Package Manager ───────────────────────────────────────────────────────────
export class PackageManager {
  constructor() {
    this.installed = new Map();
    this._load();
  }

  _load() {
    try {
      const saved = localStorage.getItem('agentiq_packages');
      if (saved) {
        const data = JSON.parse(saved);
        this.installed = new Map(data);
      }
    } catch {}
  }

  _save() {
    try {
      localStorage.setItem('agentiq_packages', JSON.stringify([...this.installed]));
    } catch {}
  }

  install(name, version = 'latest') {
    this.installed.set(name, { name, version, installedAt: Date.now() });
    this._save();
    return { success: true, name, version };
  }

  uninstall(name) {
    const existed = this.installed.has(name);
    this.installed.delete(name);
    this._save();
    return { success: existed };
  }

  list() {
    return [...this.installed.values()];
  }

  isInstalled(name) {
    return this.installed.has(name);
  }

  importList(packages) {
    packages.forEach(p => this.installed.set(p.name, p));
    this._save();
  }
}

// ─── Process Manager ──────────────────────────────────────────────────────────
export class ProcessManager {
  constructor() {
    this.processes = new Map();
    this._nextPid = 1;
  }

  spawn(name, command) {
    const pid = this._nextPid++;
    const proc = { pid, name, command, status: 'running', startTime: Date.now(), cpu: Math.random() * 5, memory: Math.floor(Math.random() * 50) + 10 };
    this.processes.set(pid, proc);
    return proc;
  }

  kill(pid) {
    const proc = this.processes.get(pid);
    if (proc) { proc.status = 'stopped'; this.processes.delete(pid); return true; }
    return false;
  }

  list() {
    return [
      { pid: 1, name: 'bash', command: '/bin/bash', status: 'running', cpu: 0.0, memory: 4 },
      { pid: 2, name: 'agentiq', command: 'node agentiq.js', status: 'running', cpu: 1.2, memory: 128 },
      ...this.processes.values(),
    ];
  }
}

export default SandboxComputer;
