/**
 * CodeGenerationAgent.js - Full-Stack Code Generation Agent
 * Features: 81-105 from the feature list
 */

import { EventEmitter } from 'events';

export class DatabaseSchemaGenerator {
  static generatePostgreSQLSchema(entities) {
    return entities.map(entity => {
      const columns = entity.attributes.map(attr => {
        const typeMap = {
          'string': 'VARCHAR(255)',
          'text': 'TEXT',
          'integer': 'INTEGER',
          'float': 'DECIMAL(10,2)',
          'boolean': 'BOOLEAN',
          'date': 'DATE',
          'datetime': 'TIMESTAMP',
          'uuid': 'UUID',
          'json': 'JSONB'
        };
        const type = typeMap[attr.type] || 'VARCHAR(255)';
        const nullable = attr.required ? '' : ' NULL';
        const primary = attr.primary ? ' PRIMARY KEY' : '';
        const unique = attr.unique ? ' UNIQUE' : '';
        return `  ${attr.name} ${type}${nullable}${primary}${unique}`;
      }).join(',\n');

      return `CREATE TABLE ${entity.name} (\n${columns}\n);`;
    }).join('\n\n');
  }

  static generateMongoDBModels(entities) {
    return entities.map(entity => {
      const schema = entity.attributes.map(attr => {
        const typeMap = {
          'string': 'String',
          'text': 'String',
          'integer': 'Number',
          'float': 'Number',
          'boolean': 'Boolean',
          'date': 'Date',
          'datetime': 'Date'
        };
        const required = attr.required ? 'required: true' : '';
        return `  ${attr.name}: { type: ${typeMap[attr.type] || 'String' }, ${required} }`;
      }).join(',\n');

      return `const ${entity.name}Schema = new mongoose.Schema({\n${schema}\n});\n\nconst ${entity.name} = mongoose.model('${entity.name}', ${entity.name}Schema);`;
    }).join('\n\n');
  }

  static generateMigration(entities, direction = 'up') {
    if (direction === 'up') {
      return this.generatePostgreSQLSchema(entities);
    }
    return entities.map(e => `DROP TABLE IF EXISTS ${e.name};`).join('\n');
  }
}

export class AuthenticationGenerator {
  static generateJWTService() {
    return `import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const TOKEN_EXPIRY = '24h';

export class AuthService {
  static async hashPassword(password) {
    return bcrypt.hash(password, 12);
  }

  static async comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  static generateToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
  }

  static verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return null;
    }
  }
}

export const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const decoded = AuthService.verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  req.user = decoded;
  next();
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};`;
  }

  static generateOAuthConfig(provider) {
    const configs = {
      github: `import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';

passport.use(new GitHubStrategy({
  clientID: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  callbackURL: '/auth/github/callback'
}, async (accessToken, refreshToken, profile, done) => {
  const user = await upsertUser({
    provider: 'github',
    providerId: profile.id,
    email: profile.emails?.[0]?.value,
    name: profile.displayName
  });
  done(null, user);
}));`,
      google: `import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  const user = await upsertUser({
    provider: 'google',
    providerId: profile.id,
    email: profile.emails?.[0]?.value,
    name: profile.displayName
  });
  done(null, user);
}));`
    };
    return configs[provider] || configs.github;
  }

  static generate2FA() {
    return `import speakeasy from 'speakeasy';

export const generate2FASecret = (email) => {
  return speakeasy.generateSecret({
    name: \`MyApp (\${email})\`,
    length: 20
  });
};

export const verify2FA = (token, secret) => {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 1
  });
};

export const generateBackupCodes = () => {
  return Array.from({ length: 10 }, () => 
    Math.random().toString(36).substring(2, 10).toUpperCase()
  );
};`;
  }
}

export class TestGenerator {
  static generateJestTests(functions) {
    return functions.map(fn => `describe('${fn.name}', () => {
  it('should handle valid input', () => {
    const result = ${fn.name}(${fn.validInput});
    expect(result).toBeDefined();
  });

  it('should handle edge cases', () => {
    expect(() => ${fn.name}(${fn.edgeCase})).not.toThrow();
  });

  it('should return correct type', () => {
    const result = ${fn.name}(${fn.validInput});
    expect(typeof result).toBe('${fn.returnType}');
  });
});`).join('\n\n');
  }

  static generatePlaywrightTests(scenarios) {
    return `import { test, expect } from '@playwright/test';

${scenarios.map(scenario => `
test('${scenario.name}', async ({ page }) => {
  await page.goto('${scenario.url}');
  ${scenario.steps.map(step => `await page.${step.action}('${step.selector}');`).join('\n  ')}
  ${scenario.assertions.map(a => `await expect(page.locator('${a.selector}')).${a.matcher}();`).join('\n  ')}
});`).join('')}
`;
  }

  static generateCypressTests(scenarios) {
    return `/// <reference types="cypress" />

${scenarios.map(scenario => `
describe('${scenario.name}', () => {
  it('${scenario.name}', () => {
    cy.visit('${scenario.url}');
    ${scenario.steps.map(step => `cy.${step.action}('${step.selector}');`).join('\n    ')}
    ${scenario.assertions.map(a => `cy.get('${a.selector}').${a.matcher}();`).join('\n    ')}
  });
});`).join('')}
`;
  }
}

export class CIGenerator {
  static generateGitHubActions() {
    return `name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test_db
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run linter
      run: npm run lint
    
    - name: Run tests
      run: npm test
      env:
        DATABASE_URL: postgres://test:test@localhost:5432/test_db
        NODE_ENV: test
    
    - name: Build
      run: npm run build
      if: github.ref == 'refs/heads/main'
    
    - name: Deploy to Staging
      run: npm run deploy:staging
      if: github.ref == 'refs/heads/main'
      env:
        DEPLOY_TOKEN: \${{ secrets.DEPLOY_TOKEN }}

  docker:
    runs-on: ubuntu-latest
    needs: test
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Build Docker image
      run: docker build -t app:\${{ github.sha }} .
    
    - name: Push to Registry
      run: |
        echo "\${{ secrets.DOCKER_TOKEN }}" | docker login -u \${{ secrets.DOCKER_USER }} --password-stdin
        docker push app:\${{ github.sha }}
`;
  }

  static generateGitLabCI() {
    return `stages:
  - lint
  - test
  - build
  - deploy

lint:
  stage: lint
  script:
    - npm run lint
  only:
    - merge_requests
    - main

test:
  stage: test
  services:
    - postgres:14
  script:
    - npm ci
    - npm test
  variables:
    DATABASE_URL: postgres://postgres:postgres@postgres:5432/test
  coverage: '/All files[^|]*\\|[^|]*\\s+([\\d\\.]+)/'

build:
  stage: build
  script:
    - npm run build
  artifacts:
    paths:
      - dist/
    expire_in: 1 week

deploy:
  stage: deploy
  script:
    - npm run deploy
  only:
    - main
  environment:
    name: production
`;
  }
}

export class DockerGenerator {
  static generateDockerfile(stack) {
    const templates = {
      node: `FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM node:18-alpine AS runtime

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]`,
      python: `FROM python:3.11-slim AS builder

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN pip install -e .

FROM python:3.11-slim

WORKDIR /app
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY . .

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["python", "-m", "uvicorn", "main:app"]`,
      fullstack: `FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine AS server

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

RUN apk add --no-cache nginx
COPY nginx.conf /etc/nginx/nginx.conf

ENV NODE_ENV=production
EXPOSE 80

CMD ["sh", "-c", "nginx && node server.js"]`
    };
    return templates[stack] || templates.node;
  }

  static generateDockerCompose(services) {
    return `version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgres://postgres:postgres@db:5432/app
    depends_on:
      - db
      - redis
    restart: unless-stopped
  
  db:
    image: postgres:14
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=app
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped
  
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped
  
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - app
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
`;
  }
}

export class SecurityGenerator {
  static generateSecurityHeaders() {
    return `import helmet from 'helmet';

export const securityMiddleware = [
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  }),
  helmet.hsts({ maxAge: 31536000, includeSubDomains: true }),
  helmet.noSniff(),
  helmet.xssFilter(),
  helmet.frameguard({ action: 'deny' }),
  helmet.referrerPolicy({ policy: 'strict-origin-when-cross-origin' })
];`;
  }

  static generateRateLimiter() {
    return `import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args)
  })
});

export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  skipSuccessfulRequests: true
});
`;
  }

  static generateValidation() {
    return `import Joi from 'joi';

export const schemas = {
  user: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)/).required(),
    name: Joi.string().min(2).max(100).required(),
    role: Joi.string().valid('user', 'admin', 'moderator').default('user')
  }),
  
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),
  
  passwordReset: Joi.object({
    token: Joi.string().required(),
    newPassword: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)/).required()
  })
};

export const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      const errors = error.details.map(d => d.message);
      return res.status(400).json({ errors });
    }
    next();
  };
};
`;
  }
}

export class CodeGenerationAgent extends EventEmitter {
  constructor(options = {}) {
    super();
    this.codeExecutor = null;
  }

  setCodeExecutor(executor) {
    this.codeExecutor = executor;
  }

  async generateFullStackApp(spec) {
    this.emit('generation:start', { type: 'fullstack', spec });
    
    const result = {
      frontend: await this.generateFrontend(spec),
      backend: await this.generateBackend(spec),
      database: await this.generateDatabase(spec),
      config: await this.generateConfig(spec),
      tests: await this.generateTests(spec),
      ci: await this.generateCI(spec),
      docker: await this.generateDocker(spec)
    };

    this.emit('generation:complete', result);
    return result;
  }

  async generateFrontend(spec) {
    const components = [];
    
    // App component
    components.push(`import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
${spec.pages ? `import { ${spec.pages.map(p => p.name).join(', ')} } from './pages';` : ''}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        ${spec.pages ? spec.pages.map(p => `<Route path="${p.path}" element={<${p.name} />} />`).join('\n        ') : '<Route path="/" element={<Home />} />'}
      </Routes>
    </BrowserRouter>
  );
}

export default App;`);

    return { components, language: 'JavaScript (React)', framework: 'React' };
  }

  async generateBackend(spec) {
    return {
      main: `const express = require('express');
const app = express();

app.use(express.json());
app.use('/api', require('./routes'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(\`Server running on port \${PORT}\`));`,
      language: 'JavaScript (Node.js)',
      framework: 'Express'
    };
  }

  async generateDatabase(spec) {
    const entities = spec.entities || [
      { name: 'User', attributes: [
        { name: 'id', type: 'uuid', primary: true },
        { name: 'email', type: 'string', unique: true, required: true },
        { name: 'password', type: 'string', required: true },
        { name: 'createdAt', type: 'datetime' }
      ]}
    ];

    return {
      postgres: DatabaseSchemaGenerator.generatePostgreSQLSchema(entities),
      migration: DatabaseSchemaGenerator.generateMigration(entities, 'up'),
      rollback: DatabaseSchemaGenerator.generateMigration(entities, 'down')
    };
  }

  async generateDatabase(spec) {
    const entities = spec.entities || [];
    return {
      postgres: DatabaseSchemaGenerator.generatePostgreSQLSchema(entities),
      migration: DatabaseSchemaGenerator.generateMigration(entities, 'up'),
      rollback: DatabaseSchemaGenerator.generateMigration(entities, 'down')
    };
  }

  async generateConfig(spec) {
    return {
      env: `# Application
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgres://user:password@localhost:5432/dbname

# Authentication
JWT_SECRET=your-super-secret-key
JWT_EXPIRY=24h

# OAuth
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# External APIs
EXTERNAL_API_KEY=`,
      package: {
        scripts: {
          "dev": "nodemon server.js",
          "start": "node server.js",
          "test": "jest",
          "lint": "eslint ."
        }
      }
    };
  }

  async generateTests(spec) {
    return {
      unit: TestGenerator.generateJestTests([
        { name: 'add', validInput: '1, 2', edgeCase: '0, 0', returnType: 'number' }
      ]),
      e2e: TestGenerator.generatePlaywrightTests([
        { name: 'homepage loads', url: '/', steps: [], assertions: [] }
      ])
    };
  }

  async generateCI(spec) {
    return {
      github: CIGenerator.generateGitHubActions(),
      gitlab: CIGenerator.generateGitLabCI()
    };
  }

  async generateDocker(spec) {
    return {
      dockerfile: DockerGenerator.generateDockerfile(spec.stack || 'node'),
      dockerCompose: DockerGenerator.generateDockerCompose(spec.services || [])
    };
  }

  async generateAuthSystem(config) {
    return {
      jwt: AuthenticationGenerator.generateJWTService(),
      oauth: AuthenticationGenerator.generateOAuthConfig(config.provider || 'github'),
      twoFA: AuthenticationGenerator.generate2FA()
    };
  }

  async generateSecurityFeatures() {
    return {
      headers: SecurityGenerator.generateSecurityHeaders(),
      rateLimiter: SecurityGenerator.generateRateLimiter(),
      validation: SecurityGenerator.generateValidation()
    };
  }

  async analyzeCodeQuality(code) {
    const issues = [];
    
    // Check for common issues
    if (code.includes('eval(')) {
      issues.push({ severity: 'high', message: 'Use of eval() detected - potential security risk' });
    }
    if (code.includes('console.log') && !code.includes('// debug')) {
      issues.push({ severity: 'low', message: 'Debug logging should be removed in production' });
    }
    if (!code.includes('try') && !code.includes('catch')) {
      issues.push({ severity: 'medium', message: 'Consider adding error handling' });
    }

    return {
      score: Math.max(0, 100 - issues.length * 15),
      issues,
      suggestions: issues.map(i => `Consider addressing: ${i.message}`)
    };
  }

  async suggestRefactoring(code) {
    return {
      suggestions: [
        { type: 'extract', description: 'Extract repeated logic into reusable function' },
        { type: 'naming', description: 'Rename ambiguous variable names' },
        { type: 'structure', description: 'Consider using classes for complex state management' }
      ],
      estimatedImprovement: '15-25%'
    };
  }
}

export default CodeGenerationAgent;