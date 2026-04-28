/**
 * Browser Automation System - AgentIQ Pro
 * Playwright/Puppeteer-based browser automation with AI capabilities
 * 
 * Features:
 * - Browser session management
 * - Login automation
 * - Web scraping with AI selectors
 * - Form automation
 * - Screenshot and recording
 * - Advanced DOM interaction
 * - Error handling and retry logic
 */

import { EventEmitter } from 'events';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * @typedef {'chromium'|'firefox'|'webkit'} BrowserType
 * @typedef {'load'|'domcontentloaded'|'networkidle'} WaitUntil
 * @typedef {'click'|'type'|'hover'|'scroll'|'screenshot'|'extract'} ActionType
 */

/**
 * @typedef {Object} BrowserConfig
 * @property {BrowserType} [browserType='chromium']
 * @property {boolean} [headless=true]
 * @property {number} [viewportWidth=1280]
 * @property {number} [viewportHeight=720]
 * @property {string} [userAgent]
 * @property {Object} [proxy]
 * @property {Object} [contextOptions]
 */

/**
 * @typedef {Object} NavigationOptions
 * @property {WaitUntil} [waitUntil='load']
 * @property {number} [timeout=30000]
 * @property {number} [waitForSelector]
 * @property {string} [waitForFunction]
 */

/**
 * @typedef {Object} LoginConfig
 * @property {string} url
 * @property {Object} selectors - CSS selectors for username, password, submit
 * @property {string} username
 * @property {string} password
 * @property {string} [submitSelector]
 * @property {boolean} [rememberMe]
 * @property {number} [delayMs=100]
 */

/**
 * @typedef {Object} ScrapedData
 * @property {string} url
 * @property {string} title
 * @property {string} html
 * @property {Object} data - Extracted structured data
 * @property {string[]} [links]
 * @property {Object[]} [images]
 * @property {number} timestamp
 */

// ============================================================================
// CUSTOM ERRORS
// ============================================================================

class BrowserAutomationError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'BrowserAutomationError';
    this.code = code;
    this.details = details;
  }
}

class ElementNotFoundError extends BrowserAutomationError {
  constructor(selector, timeout) {
    super(`Element not found: ${selector} (timeout: ${timeout}ms)`, 'ELEMENT_NOT_FOUND', { selector, timeout });
  }
}

class NavigationError extends BrowserAutomationError {
  constructor(url, error) {
    super(`Navigation failed: ${url}`, 'NAVIGATION_ERROR', { url, error: error.message });
  }
}

class AuthenticationError extends BrowserAutomationError {
  constructor(message) {
    super(message, 'AUTHENTICATION_ERROR');
  }
}

// ============================================================================
// MAIN BROWSER AUTOMATION CLASS
// ============================================================================

class BrowserAutomation extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      browserType: config.browserType || 'chromium',
      headless: config.headless !== false,
      viewport: {
        width: config.viewportWidth || 1280,
        height: config.viewportHeight || 720
      },
      userAgent: config.userAgent,
      proxy: config.proxy,
      contextOptions: config.contextOptions || {}
    };
    
    this.browser = null;
    this.context = null;
    this.page = null;
    this.isInitialized = false;
    this.sessionId = this._generateSessionId();
    this.cookies = [];
    this.localStorage = {};
    this.performanceMetrics = {
      navigations: 0,
      actions: 0,
      errors: 0,
      screenshots: 0,
      avgResponseTime: 0
    };
    
    // Action history for replay
    this.actionHistory = [];
    this.maxHistorySize = 1000;
    
    // Retry configuration
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      exponentialBackoff: true
    };
    
    // AI-assisted features
    this.aiSelectorGenerator = null;
    this.intelligentWait = true;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize() {
    if (this.isInitialized) {
      return this;
    }

    try {
      // Import Playwright (dynamically loaded for optional dependency)
      let playwright;
      try {
        playwright = await import('playwright');
      } catch (e) {
        // Fallback to Puppeteer if Playwright not available
        try {
          const puppeteer = await import('puppeteer');
          return this._initializeWithPuppeteer(puppeteer);
        } catch (puppeteerError) {
          throw new BrowserAutomationError(
            'Neither Playwright nor Puppeteer is installed. Please install one of them.',
            'DEPENDENCY_NOT_FOUND'
          );
        }
      }

      // Launch browser
      const browserOptions = {
        headless: this.config.headless,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--no-sandbox'
        ]
      };

      if (this.config.proxy) {
        browserOptions.proxy = this.config.proxy;
      }

      this.browser = await playwright[this.config.browserType].launch(browserOptions);

      // Create context with specified options
      const contextOptions = {
        viewport: this.config.viewport,
        ...this.config.contextOptions
      };

      if (this.config.userAgent) {
        contextOptions.userAgent = this.config.userAgent;
      }

      this.context = await this.browser.newContext(contextOptions);
      this.page = await this.context.newPage();

      // Set up event listeners
      this._setupEventListeners();

      // Generate random mouse movements to avoid detection
      await this._stealthMode();

      this.isInitialized = true;
      this.emit('initialized', { sessionId: this.sessionId });

      return this;

    } catch (error) {
      this.emit('error', { error: error.message });
      throw new BrowserAutomationError(
        `Failed to initialize browser: ${error.message}`,
        'INITIALIZATION_FAILED'
      );
    }
  }

  async _initializeWithPuppeteer(puppeteer) {
    const browser = await puppeteer.launch({
      headless: this.config.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox'
      ]
    });

    this.browser = browser;
    this.context = await browser.createIncognitoBrowserContext();
    this.page = await this.context.createPage();

    // Puppeteer doesn't have direct console logging, we'll add our own
    this.page.on('console', msg => {
      this.emit('console', { type: msg.type(), text: msg.text() });
    });

    this.isInitialized = true;
    this.emit('initialized', { sessionId: this.sessionId });

    return this;
  }

  _setupEventListeners() {
    this.page.on('console', msg => {
      this.emit('console', {
        type: msg.type(),
        text: msg.text(),
        location: msg.location()
      });
    });

    this.page.on('pageerror', error => {
      this.emit('pageerror', { error: error.message });
      this.performanceMetrics.errors++;
    });

    this.page.on('response', response => {
      this.emit('response', {
        url: response.url(),
        status: response.status(),
        headers: response.headers()
      });
    });

    this.page.on('requestfailed', request => {
      this.emit('requestfailed', {
        url: request.url(),
        failure: request.failure()?.errorText
      });
    });
  }

  async _stealthMode() {
    // Remove webdriver property
    await this.page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false
      });
    });

    // Additional stealth measures
    await this.page.evaluateOnNewDocument(() => {
      // Mock permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );

      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin' },
          { name: 'Chrome PDF Viewer' },
          { name: 'Native Client' }
        ]
      });

      // Mock languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en', 'es']
      });
    });
  }

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  async navigate(url, options = {}) {
    const startTime = Date.now();
    const navOptions = {
      waitUntil: options.waitUntil || 'load',
      timeout: options.timeout || 30000
    };

    try {
      this.emit('navigation:start', { url });

      await this.page.goto(url, {
        waitUntil: navOptions.waitUntil,
        timeout: navOptions.timeout
      });

      this.performanceMetrics.navigations++;

      // Wait for selector if specified
      if (options.waitForSelector) {
        await this.waitForSelector(options.waitForSelector, { timeout: options.waitForSelectorTimeout });
      }

      // Wait for function if specified
      if (options.waitForFunction) {
        await this.page.waitForFunction(options.waitForFunction, { timeout: options.timeout });
      }

      const responseTime = Date.now() - startTime;
      this._updateAvgResponseTime(responseTime);

      this.emit('navigation:end', { url, responseTime });
      this._recordAction('navigate', { url, responseTime });

      return {
        success: true,
        url: this.page.url(),
        title: await this.page.title(),
        responseTime
      };

    } catch (error) {
      this.performanceMetrics.errors++;
      this.emit('navigation:error', { url, error: error.message });
      throw new NavigationError(url, error);
    }
  }

  async navigateBack(options = {}) {
    await this.page.goBack(options);
    this.performanceMetrics.navigations++;
  }

  async navigateForward(options = {}) {
    await this.page.goForward(options);
    this.performanceMetrics.navigations++;
  }

  async reload(options = {}) {
    await this.page.reload(options);
    this.performanceMetrics.navigations++;
  }

  // ============================================================================
  // WAITING FOR ELEMENTS
  // ============================================================================

  async waitForSelector(selector, options = {}) {
    const timeout = options.timeout || 30000;
    const state = options.state || 'visible';

    try {
      await this.page.waitForSelector(selector, { timeout, state });
      return true;
    } catch (error) {
      throw new ElementNotFoundError(selector, timeout);
    }
  }

  async waitForFunction(fn, options = {}) {
    const timeout = options.timeout || 30000;
    const polling = options.polling || 100;

    await this.page.waitForFunction(fn, { timeout, polling });
  }

  async waitForNavigation(options = {}) {
    const timeout = options.timeout || 30000;
    const waitUntil = options.waitUntil || 'load';

    await this.page.waitForNavigation({ timeout, waitUntil });
  }

  async waitForResponse(urlPattern, options = {}) {
    const timeout = options.timeout || 30000;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout waiting for response matching ${urlPattern}`));
      }, timeout);

      const handler = response => {
        if (response.url().match(urlPattern)) {
          clearTimeout(timeoutId);
          this.page.off('response', handler);
          resolve(response);
        }
      };

      this.page.on('response', handler);
    });
  }

  async waitForElementVisible(selector, options = {}) {
    options.state = 'visible';
    return this.waitForSelector(selector, options);
  }

  async waitForElementHidden(selector, options = {}) {
    options.state = 'hidden';
    return this.waitForSelector(selector, options);
  }

  // ============================================================================
  // CLICK & INTERACTION
  // ============================================================================

  async click(selector, options = {}) {
    try {
      const clickOptions = {
        button: options.button || 'left',
        modifiers: options.modifiers,
        delay: options.delay,
        force: options.force,
        timeout: options.timeout || 10000
      };

      await this.page.click(selector, clickOptions);
      this.performanceMetrics.actions++;
      this._recordAction('click', { selector, ...options });

      this.emit('action:click', { selector });
      return true;

    } catch (error) {
      throw new BrowserAutomationError(
        `Failed to click element: ${selector}`,
        'CLICK_FAILED',
        { selector, error: error.message }
      );
    }
  }

  async doubleClick(selector, options = {}) {
    await this.page.dblclick(selector, options);
    this.performanceMetrics.actions++;
    this._recordAction('doubleClick', { selector });
    this.emit('action:doubleClick', { selector });
  }

  async rightClick(selector, options = {}) {
    options.button = 'right';
    return this.click(selector, options);
  }

  async hover(selector, options = {}) {
    await this.page.hover(selector, options);
    this._recordAction('hover', { selector });
    this.emit('action:hover', { selector });
  }

  async scrollTo(selector, options = {}) {
    const element = await this.page.$(selector);
    if (element) {
      await element.scrollIntoViewIfNeeded(options);
      this._recordAction('scrollTo', { selector });
    }
  }

  async scrollBy(x = 0, y = 0) {
    await this.page.mouse.move(x, y);
    await this.page.evaluate(([scrollX, scrollY]) => {
      window.scrollBy(scrollX, scrollY);
    }, [x, y]);
    this._recordAction('scrollBy', { x, y });
  }

  async scrollToBottom() {
    await this.page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    this._recordAction('scrollToBottom');
  }

  async scrollToTop() {
    await this.page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    this._recordAction('scrollToTop');
  }

  // ============================================================================
  // FORM INPUT
  // ============================================================================

  async type(selector, text, options = {}) {
    const delay = options.delay || 0;
    const clear = options.clear !== false;

    try {
      await this.waitForSelector(selector);

      if (clear) {
        await this.page.fill(selector, '');
      }

      await this.page.type(selector, text, { delay });
      this.performanceMetrics.actions++;
      this._recordAction('type', { selector, textLength: text.length });
      this.emit('action:type', { selector, textLength: text.length });

      return true;

    } catch (error) {
      throw new BrowserAutomationError(
        `Failed to type into element: ${selector}`,
        'TYPE_FAILED',
        { selector, error: error.message }
      );
    }
  }

  async fill(selector, value, options = {}) {
    try {
      await this.waitForSelector(selector);
      await this.page.fill(selector, value);
      this.performanceMetrics.actions++;
      this._recordAction('fill', { selector, valueLength: value.length });
      this.emit('action:fill', { selector });
      return true;

    } catch (error) {
      throw new BrowserAutomationError(
        `Failed to fill element: ${selector}`,
        'FILL_FAILED',
        { selector, error: error.message }
      );
    }
  }

  async check(selector) {
    await this.page.check(selector);
    this._recordAction('check', { selector });
    this.emit('action:check', { selector });
  }

  async uncheck(selector) {
    await this.page.uncheck(selector);
    this._recordAction('uncheck', { selector });
    this.emit('action:uncheck', { selector });
  }

  async selectOption(selector, value, options = {}) {
    const selectOptions = {
      timeout: options.timeout
    };

    if (options.index !== undefined) {
      selectOptions.index = options.index;
    } else if (options.label !== undefined) {
      selectOptions.label = options.label;
    } else {
      selectOptions.value = value;
    }

    await this.page.selectOption(selector, selectOptions);
    this._recordAction('selectOption', { selector, value });
    this.emit('action:selectOption', { selector, value });
  }

  async clearInput(selector) {
    await this.page.fill(selector, '');
    this._recordAction('clearInput', { selector });
  }

  // ============================================================================
  // LOGIN AUTOMATION
  // ============================================================================

  async login(config) {
    const {
      url,
      selectors,
      username,
      password,
      submitSelector,
      rememberMe,
      delayMs = 100
    } = config;

    try {
      this.emit('login:start', { url });

      // Navigate to login page
      await this.navigate(url);

      // Wait for login form
      await this.waitForSelector(selectors.username, { timeout: 10000 });

      // Add delay before typing
      await this._delay(delayMs);

      // Enter username
      await this.fill(selectors.username, username);

      // Small delay between fields
      await this._delay(delayMs / 2);

      // Enter password
      await this.fill(selectors.password, password);

      // Handle remember me if specified
      if (rememberMe && selectors.rememberMe) {
        await this.check(selectors.rememberMe);
      }

      // Submit form
      await this._delay(delayMs / 2);

      if (submitSelector) {
        await this.click(submitSelector);
      } else if (selectors.submit) {
        await this.click(selectors.submit);
      } else {
        // Try pressing Enter in the password field
        await this.page.keyboard.press('Enter');
      }

      // Wait for navigation after login
      await this.waitForNavigation({ timeout: 30000 });

      this.emit('login:success', { url });
      this._recordAction('login', { url, success: true });

      return {
        success: true,
        url: this.page.url(),
        title: await this.page.title()
      };

    } catch (error) {
      this.emit('login:error', { url, error: error.message });
      throw new AuthenticationError(`Login failed: ${error.message}`);
    }
  }

  async handle2FA(selector, code, options = {}) {
    const delayMs = options.delayMs || 100;
    
    await this.waitForSelector(selector);
    await this._delay(delayMs);
    await this.type(selector, code, { delay: delayMs });
    
    if (options.submitSelector) {
      await this.click(options.submitSelector);
    } else {
      await this.page.keyboard.press('Enter');
    }
    
    this._recordAction('handle2FA', { codeProvided: true });
  }

  // ============================================================================
  // WEB SCRAPING
  // ============================================================================

  async scrape(url, options = {}) {
    const scrapeOptions = {
      selectors: options.selectors || {
        title: 'title',
        data: options.dataSelector ? [options.dataSelector] : undefined
      },
      extractImages: options.extractImages !== false,
      extractLinks: options.extractLinks !== false,
      scrollToBottom: options.scrollToBottom || false,
      waitForSelector: options.waitForSelector
    };

    try {
      await this.navigate(url, { timeout: options.timeout || 30000 });

      if (scrapeOptions.waitForSelector) {
        await this.waitForSelector(scrapeOptions.waitForSelector);
      }

      if (scrapeOptions.scrollToBottom) {
        await this.scrollToBottom();
        await this._delay(500);
      }

      const scrapedData = await this._extractPageData(scrapeOptions);

      this._recordAction('scrape', { url, dataSize: JSON.stringify(scrapedData.data).length });
      this.emit('scrape:complete', { url, dataSize: scrapedData.data.length });

      return scrapedData;

    } catch (error) {
      throw new BrowserAutomationError(
        `Scraping failed for ${url}: ${error.message}`,
        'SCRAPE_FAILED'
      );
    }
  }

  async _extractPageData(options) {
    const [title, html] = await Promise.all([
      this.page.title(),
      options.html !== false ? this.page.content() : null
    ]);

    const data = {};

    // Extract data from specified selectors
    if (options.selectors && options.selectors.data) {
      for (const selectorConfig of options.selectors.data) {
        if (typeof selectorConfig === 'string') {
          const elements = await this.page.$$(selectorConfig);
          data[selectorConfig] = await Promise.all(
            elements.map(el => this._extractElementData(el))
          );
        } else {
          const selector = selectorConfig.selector;
          const attribute = selectorConfig.attribute;
          const result = await this.page.$$(selector);
          data[selectorConfig.name || selector] = await Promise.all(
            result.map((el, i) => 
              attribute 
                ? el.getAttribute(attribute)
                : this._extractElementData(el)
            )
          );
        }
      }
    }

    const result = {
      url: this.page.url(),
      title,
      html,
      data,
      timestamp: Date.now()
    };

    // Extract links
    if (options.extractLinks) {
      result.links = await this._extractLinks();
    }

    // Extract images
    if (options.extractImages) {
      result.images = await this._extractImages();
    }

    return result;
  }

  async _extractElementData(element) {
    const [text, innerHTML] = await Promise.all([
      element.textContent(),
      element.innerHTML()
    ]);

    return {
      text: text?.trim() || '',
      html: innerHTML?.trim() || ''
    };
  }

  async _extractLinks() {
    return this.page.evaluate(() => {
      const links = [];
      document.querySelectorAll('a[href]').forEach(link => {
        links.push({
          text: link.textContent.trim(),
          href: link.href,
          target: link.target
        });
      });
      return links;
    });
  }

  async _extractImages() {
    return this.page.evaluate(() => {
      const images = [];
      document.querySelectorAll('img[src]').forEach(img => {
        images.push({
          src: img.src,
          alt: img.alt,
          width: img.width,
          height: img.height
        });
      });
      return images;
    });
  }

  async extractText(selector) {
    await this.waitForSelector(selector);
    const elements = await this.page.$$(selector);
    return Promise.all(elements.map(el => el.textContent()));
  }

  async extractAttribute(selector, attribute) {
    await this.waitForSelector(selector);
    const elements = await this.page.$$(selector);
    return Promise.all(elements.map(el => el.getAttribute(attribute)));
  }

  async extractTable(selector) {
    await this.waitForSelector(selector);
    return this.page.evaluate((tableSelector) => {
      const table = document.querySelector(tableSelector);
      if (!table) return null;

      const rows = [];
      const headers = [];
      
      // Get headers
      table.querySelectorAll('thead th, thead td').forEach(th => {
        headers.push(th.textContent.trim());
      });
      
      // Get body rows
      table.querySelectorAll('tbody tr').forEach(tr => {
        const cells = [];
        tr.querySelectorAll('td').forEach(td => {
          cells.push(td.textContent.trim());
        });
        if (cells.length > 0) {
          rows.push(cells);
        }
      });

      return { headers, rows };
    }, selector);
  }

  // ============================================================================
  // SCREENSHOTS & RECORDING
  // ============================================================================

  async screenshot(options = {}) {
    const screenshotOptions = {
      path: options.path,
      fullPage: options.fullPage || false,
      type: options.type || 'png',
      encoding: options.encoding || 'binary',
      omitBackground: options.omitBackground || false,
      viewport: options.viewport
    };

    try {
      const buffer = await this.page.screenshot(screenshotOptions);
      this.performanceMetrics.screenshots++;
      this._recordAction('screenshot', { fullPage: screenshotOptions.fullPage });

      this.emit('screenshot:captured', {
        size: buffer.length,
        type: screenshotOptions.type
      });

      if (options.returnBase64) {
        return buffer.toString('base64');
      }

      return buffer;

    } catch (error) {
      throw new BrowserAutomationError(
        `Screenshot failed: ${error.message}`,
        'SCREENSHOT_FAILED'
      );
    }
  }

  async screenshotElement(selector, options = {}) {
    await this.waitForSelector(selector);
    const element = await this.page.$(selector);
    
    if (!element) {
      throw new ElementNotFoundError(selector);
    }

    return element.screenshot(options);
  }

  // ============================================================================
  // IFRAME & SHADOW DOM HANDLING
  // ============================================================================

  async switchToFrame(frame) {
    if (typeof frame === 'number') {
      await this.page.frame({ index: frame });
    } else if (typeof frame === 'string') {
      await this.page.frame({ name: frame });
    } else {
      await this.page.frame(frame);
    }
  }

  async switchToParentFrame() {
    await this.page.frame(null);
  }

  async switchToIframe(selector, options = {}) {
    const element = await this.page.$(selector);
    if (!element) {
      throw new ElementNotFoundError(selector);
    }
    return this.page.frame({ selector });
  }

  async handleShadowDOM(action, shadowSelector, options = {}) {
    return this.page.evaluate(async ({ action, shadowSelector, options }) => {
      const shadowHost = document.querySelector(shadowSelector);
      if (!shadowHost || !shadowHost.shadowRoot) {
        throw new Error(`Shadow DOM not found: ${shadowSelector}`);
      }

      const shadowRoot = shadowHost.shadowRoot;
      let target;

      switch (action) {
        case 'click':
          target = shadowRoot.querySelector(options.clickTarget);
          target?.click();
          break;
        case 'type':
          target = shadowRoot.querySelector(options.typeTarget);
          if (target) {
            target.value = options.text;
            target.dispatchEvent(new Event('input', { bubbles: true }));
          }
          break;
        case 'select':
          target = shadowRoot.querySelector(options.selectTarget);
          if (target) {
            target.value = options.value;
            target.dispatchEvent(new Event('change', { bubbles: true }));
          }
          break;
        case 'query':
          return shadowRoot.querySelector(options.querySelector);
      }
    }, { action, shadowSelector, options });
  }

  // ============================================================================
  // COOKIES & LOCAL STORAGE
  // ============================================================================

  async getCookies(url = null) {
    if (url) {
      return this.context.cookies(url);
    }
    return this.context.cookies();
  }

  async setCookies(cookies) {
    await this.context.addCookies(cookies);
    this.cookies = [...this.cookies, ...cookies];
    this._recordAction('setCookies', { count: cookies.length });
  }

  async clearCookies() {
    await this.context.clearCookies();
    this.cookies = [];
    this._recordAction('clearCookies');
  }

  async getLocalStorage(key = null) {
    if (key) {
      return this.page.evaluate((k) => localStorage.getItem(k), key);
    }
    return this.page.evaluate(() => {
      const storage = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        storage[k] = localStorage.getItem(k);
      }
      return storage;
    });
  }

  async setLocalStorage(key, value) {
    await this.page.evaluate(({ key, value }) => {
      localStorage.setItem(key, value);
    }, { key, value });
    this.localStorage[key] = value;
    this._recordAction('setLocalStorage', { key });
  }

  async clearLocalStorage() {
    await this.page.evaluate(() => localStorage.clear());
    this.localStorage = {};
    this._recordAction('clearLocalStorage');
  }

  async getSessionStorage(key = null) {
    if (key) {
      return this.page.evaluate((k) => sessionStorage.getItem(k), key);
    }
    return this.page.evaluate(() => {
      const storage = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        storage[k] = sessionStorage.getItem(k);
      }
      return storage;
    });
  }

  // ============================================================================
  // FILE DOWNLOADS
  // ============================================================================

  async downloadFile(selector, options = {}) {
    const downloadPath = options.path || options.suggestedName || './downloads/';
    
    const [download] = await Promise.all([
      this.page.waitForEvent('download', { timeout: options.timeout || 30000 }),
      this.click(selector)
    ]);

    await download.saveAs(downloadPath);

    this._recordAction('downloadFile', { path: downloadPath });
    this.emit('download:complete', { 
      path: downloadPath, 
      suggestedFilename: download.suggestedFilename() 
    });

    return {
      path: downloadPath,
      suggestedFilename: download.suggestedFilename(),
      url: download.url()
    };
  }

  async uploadFile(selector, filePath) {
    const element = await this.page.$(selector);
    if (!element) {
      throw new ElementNotFoundError(selector);
    }
    await element.setInputFiles(filePath);
    this._recordAction('uploadFile', { selector, filePath });
  }

  // ============================================================================
  // EXECUTE JAVASCRIPT
  // ============================================================================

  async executeScript(fn, ...args) {
    return this.page.evaluate(fn, ...args);
  }

  async injectScript(script) {
    await this.page.addScriptTag({ content: script });
  }

  async injectScriptFile(filePath) {
    await this.page.addScriptTag({ path: filePath });
  }

  // ============================================================================
  // KEYBOARD & MOUSE
  // ============================================================================

  async pressKey(key, options = {}) {
    await this.page.keyboard.press(key, options);
    this._recordAction('pressKey', { key });
  }

  async typeKeys(text, options = {}) {
    await this.page.keyboard.type(text, options);
    this._recordAction('typeKeys', { textLength: text.length });
  }

  async holdKey(key) {
    await this.page.keyboard.down(key);
  }

  async releaseKey(key) {
    await this.page.keyboard.up(key);
  }

  async mouseClick(x, y, options = {}) {
    await this.page.mouse.click(x, y, options);
    this._recordAction('mouseClick', { x, y });
  }

  async mouseMove(x, y) {
    await this.page.mouse.move(x, y);
  }

  async mouseDown(x, y, button = 'left') {
    await this.page.mouse.down({ x, y, button });
  }

  async mouseUp(x, y, button = 'left') {
    await this.page.mouse.up({ x, y, button });
  }

  // ============================================================================
  // ERROR HANDLING & RETRY
  // ============================================================================

  async retry(fn, options = {}) {
    const maxRetries = options.maxRetries || this.retryConfig.maxRetries;
    const baseDelay = options.baseDelay || this.retryConfig.baseDelay;
    const maxDelay = options.maxDelay || this.retryConfig.maxDelay;

    let lastError;
    let delay = baseDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt < maxRetries) {
          await this._delay(delay);
          
          // Exponential backoff
          if (this.retryConfig.exponentialBackoff) {
            delay = Math.min(delay * 2, maxDelay);
          }

          this.emit('retry', { 
            attempt: attempt + 1, 
            maxRetries, 
            error: error.message,
            nextDelay: delay
          });
        }
      }
    }

    throw lastError;
  }

  async retryClick(selector, options = {}) {
    return this.retry(async () => {
      await this.waitForSelector(selector);
      await this.click(selector, options);
    }, options);
  }

  async retryNavigation(url, options = {}) {
    return this.retry(async () => {
      await this.navigate(url, options);
    }, options);
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  async _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  _updateAvgResponseTime(responseTime) {
    const total = this.performanceMetrics.avgResponseTime * (this.performanceMetrics.navigations - 1);
    this.performanceMetrics.avgResponseTime = (total + responseTime) / this.performanceMetrics.navigations;
  }

  _recordAction(type, data) {
    this.actionHistory.push({
      type,
      data,
      timestamp: Date.now(),
      url: this.page?.url()
    });

    // Trim history if needed
    if (this.actionHistory.length > this.maxHistorySize) {
      this.actionHistory = this.actionHistory.slice(-this.maxHistorySize);
    }
  }

  getPerformanceMetrics() {
    return { ...this.performanceMetrics };
  }

  getActionHistory() {
    return [...this.actionHistory];
  }

  clearHistory() {
    this.actionHistory = [];
  }

  getCurrentUrl() {
    return this.page?.url();
  }

  getCurrentTitle() {
    return this.page?.title();
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  async close() {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }

      if (this.context) {
        await this.context.close();
        this.context = null;
      }

      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      this.isInitialized = false;
      this.emit('closed', { sessionId: this.sessionId });

    } catch (error) {
      console.error('Error closing browser:', error);
    }
  }

  async destroy() {
    this.removeAllListeners();
    this.actionHistory = [];
    await this.close();
  }
}

// ============================================================================
// BROWSER POOL FOR MULTIPLE SESSIONS
// ============================================================================

class BrowserPool {
  constructor(config = {}) {
    this.pool = [];
    this.config = config;
    this.maxSize = config.maxSize || 5;
    this.available = [];
    this.inUse = new Set();
  }

  async acquire(config = {}) {
    if (this.available.length > 0) {
      const browser = this.available.pop();
      this.inUse.add(browser);
      return browser;
    }

    if (this.pool.length < this.maxSize) {
      const browser = new BrowserAutomation(config);
      await browser.initialize();
      this.pool.push(browser);
      this.inUse.add(browser);
      return browser;
    }

    // Wait for available browser
    return new Promise((resolve) => {
      const checkAvailable = () => {
        if (this.available.length > 0) {
          const browser = this.available.pop();
          this.inUse.add(browser);
          resolve(browser);
        } else {
          setTimeout(checkAvailable, 100);
        }
      };
      checkAvailable();
    });
  }

  release(browser) {
    if (this.inUse.has(browser)) {
      this.inUse.delete(browser);
      this.available.push(browser);
    }
  }

  async destroy() {
    for (const browser of this.pool) {
      await browser.destroy();
    }
    this.pool = [];
    this.available = [];
    this.inUse.clear();
  }
}

// ============================================================================
// AI-ENHANCED SELECTOR GENERATOR
// ============================================================================

class AISelectorGenerator {
  constructor() {
    this.cache = new Map();
    this.selectors = new Map();
  }

  async generateSelector(page, description) {
    // Try to find element by text content first
    const textSelector = `text=${description}`;
    try {
      const element = await page.$(textSelector);
      if (element) {
        return textSelector;
      }
    } catch (e) {
      // Text selector failed
    }

    // Generate AI-based selector
    const selector = this._generateFromDescription(description);
    this.cache.set(description, selector);
    
    return selector;
  }

  _generateFromDescription(description) {
    // Simple AI-like selector generation
    const words = description.toLowerCase().split(/\s+/);
    
    // Build CSS selector from words
    let selector = '';
    words.forEach((word, i) => {
      if (i === 0) {
        selector = `[${word}],:${word}`;
      } else {
        selector += `,[${word}]`;
      }
    });

    return selector;
  }

  async findElementByText(page, text) {
    return page.evaluate((searchText) => {
      const elements = document.querySelectorAll('*');
      for (const el of elements) {
        if (el.textContent.trim().includes(searchText)) {
          return {
            tag: el.tagName,
            class: el.className,
            id: el.id,
            text: el.textContent.trim().substring(0, 50)
          };
        }
      }
      return null;
    }, text);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default BrowserAutomation;
export { BrowserAutomation, BrowserPool, AISelectorGenerator };
export { BrowserAutomationError, ElementNotFoundError, NavigationError, AuthenticationError };