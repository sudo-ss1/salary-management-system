module.exports = {
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/dist/'],
  moduleFileExtensions: ['ts', 'html', 'js', 'json'],
  // @swimlane/ngx-charts ships ESM-only (no commonjs build) and pulls in a
  // tree of ESM-only d3-* packages; both must be transformed or Jest's
  // require() cannot parse their `export` syntax. Unrelated to the zoneless
  // question below - this is plain Jest/ESM interop, needed before any
  // ngx-charts test can even execute.
  transformIgnorePatterns: ['node_modules/(?!(?:@swimlane/ngx-charts|d3-[^/]+|internmap)/|.*\\.mjs$)'],
};
