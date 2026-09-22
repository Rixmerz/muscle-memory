import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // plugin/bin holds build output, linted at its source in packages/mm-logger.
  { ignores: ["**/dist/**", "**/node_modules/**", "**/*.tsbuildinfo", "plugin/bin/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ["*.js", "*.ts"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  { files: ["**/*.test.ts"], rules: { "@typescript-eslint/no-explicit-any": "off" } },
);
