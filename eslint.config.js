import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";

/**
 * Conventions shared by Amazon frontend teams (ESLint recommended + Prettier,
 * const/let, strict equality, small functions, no implicit coercion), applied
 * to every JavaScript file. Formatting itself is Prettier's job; ESLint only
 * checks correctness and readability.
 */
const conventions = {
  "no-var": "error",
  "prefer-const": "error",
  "prefer-template": "error",
  "prefer-arrow-callback": "error",
  "object-shorthand": "error",
  "arrow-body-style": ["error", "as-needed"],
  eqeqeq: ["error", "always"],
  curly: ["error", "all"],
  "no-else-return": "error",
  "no-nested-ternary": "error",
  "no-implicit-coercion": "error",
  "no-param-reassign": "error",
  "no-shadow": "error",
  "no-console": ["error", { allow: ["warn", "error"] }],
  "max-depth": ["error", 3],
  "max-params": ["error", 4],
  "max-lines-per-function": ["error", { max: 60, skipBlankLines: true, skipComments: true }],
  complexity: ["error", 12],
};

/* Runtime globals provided by the Cloudflare Workers platform. */
const workersGlobals = {
  ...globals.serviceworker,
  WebSocketPair: "readonly",
  WebSocketRequestResponsePair: "readonly",
};

export default [
  {
    ignores: ["node_modules/", ".wrangler/", "legacy/"],
  },
  js.configs.recommended,
  prettier,
  {
    files: ["**/*.js", "**/*.mjs"],
    rules: conventions,
  },
  {
    files: ["client/**/*.js", "shared/**/*.js"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["server/**/*.js"],
    languageOptions: { globals: workersGlobals },
  },
  {
    files: ["test/**/*.mjs", "eslint.config.js"],
    languageOptions: { globals: globals.node },
    rules: { "max-lines-per-function": "off" },
  },
];
