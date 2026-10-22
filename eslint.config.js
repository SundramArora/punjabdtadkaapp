var js = require('@eslint/js');
var globals = require('globals');

module.exports = [
  {
    ignores: ['node_modules/**']
  },
  {
    files: ['eslint.config.js', 'app/services/pricing.js', 'test/pricing.test.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'commonjs',
      globals: globals.node
    },
    rules: Object.assign({}, js.configs.recommended.rules, {
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always'],
      'no-trailing-spaces': 'error',
      'prefer-const': 'error'
    })
  }
];
