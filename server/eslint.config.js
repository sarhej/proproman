import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: ["dist/**", "node_modules/**"]
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module"
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off"
    }
  },
  {
    files: ["src/routes/**/*.ts"],
    ignores: ["src/routes/**/*.test.ts"],
    rules: {
      /**
       * Multer callbacks drop AsyncLocalStorage. Never invoke upload.single(...)(req,res,cb)
       * — wrap with multerSingleWithTenant(upload.single(...)).
       */
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.type='CallExpression'][callee.callee.object.name='upload'][callee.callee.property.name='single']",
          message:
            "Do not invoke upload.single(...)(req,res,cb). Use multerSingleWithTenant(upload.single(...)) so tenant ALS survives multer."
        }
      ]
    }
  }
];
