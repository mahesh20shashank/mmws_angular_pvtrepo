// @ts-check
const eslint = require("@eslint/js");
const { defineConfig } = require("eslint/config");
const tseslint = require("typescript-eslint");
const angular = require("angular-eslint");
let sonarjs;
try {
  sonarjs = require("eslint-plugin-sonarjs");
} catch {
  sonarjs = null;
}

module.exports = defineConfig([
  {
    ignores: [
      "**/.angular/**",
      "**/dist/**",
      "**/node_modules/**",
    ],
  },
  {
    files: ["**/*.ts"],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
      ...(sonarjs ? [sonarjs.configs.recommended] : []),
    ],
    processor: angular.processInlineTemplates,
    rules: {

      "@typescript-eslint/no-empty-object-type": [
        "error",
        { allowInterfaces: "always" },
      ],
      // Lets a leading underscore mark a parameter/variable as intentionally unused
      // (e.g. a mock service method matching a future real API's signature) without
      // resorting to a `void x;` statement, which SonarQube flags (typescript:S3735).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@angular-eslint/directive-selector": [
        "error",
        {
          type: "attribute",
          prefix: "app",
          style: "camelCase",
        },
      ],
      "@angular-eslint/component-selector": [
        "error",
        {
          type: "element",
          prefix: "app",
          style: "kebab-case",
        },
      ],
    },

  },
  {
    files: ["**/*.html"],
    extends: [
      angular.configs.templateRecommended,
      angular.configs.templateAccessibility,
    ],
    rules: {},
  }
]);
