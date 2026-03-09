export default {
  '*.{js,ts,tsx}': 'eslint --fix',
  'package.json': () => 'npm run security:check'
};
