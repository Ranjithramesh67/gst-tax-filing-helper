/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@gstflow/otp$': '<rootDir>/../../packages/otp/src/index.ts',
    '^@gstflow/types$': '<rootDir>/../../packages/types/src/index.ts',
    '^@gstflow/validation$': '<rootDir>/../../packages/validation/src/index.ts',
  },
};
