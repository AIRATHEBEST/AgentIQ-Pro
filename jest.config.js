const path = require('path');
module.exports = {
  rootDir: path.resolve(__dirname),
  roots: ['<rootDir>/src'],
  transform: {
    '^.+\\.[j]sx?$': ['babel-jest', { configFile: path.resolve(__dirname, 'babel.config.js') }],
  },
  transformIgnorePatterns: [
    '[/\\\\]node_modules[/\\\\]',
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: [
    '**/*.test.js',
    '**/*.spec.js'
  ],
  testEnvironment: 'node',
  haste: {
    enableSymlinks: false,
  },
  projects: [],
};
