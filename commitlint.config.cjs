module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      1,
      'always',
      ['api', 'mobile', 'portal', 'shared', 'analytics', 'ui-tokens', 'docs', 'infra', 'scripts', 'ci'],
    ],
  },
};
