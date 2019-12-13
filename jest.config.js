const path = require("path");
module.exports = {
  rootDir: path.join(__dirname, "./"),
  preset: "ts-jest",
  testEnvironment: "node",

  collectCoverage: true,
  collectCoverageFrom: ["<rootDir>/src/**/*.ts"],
  coverageDirectory: "coverage",
  coveragePathIgnorePatterns: ["/node_modules/"],
  coverageReporters: ["json", "lcov", "text", "clover"],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: -10
    }
  },
  testPathIgnorePatterns: ["\\.snap$", "<rootDir>/node_modules/", "dist"],
  setupFiles: ["<rootDir>/setupJest.js"]

  // globals: {
  //   "ts-jest": {
  //     diagnostics: false
  //   }
  // }
};
