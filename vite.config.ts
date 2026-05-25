import { defineConfig } from "vite-plus";

export default defineConfig({
    staged: { "*": "vp check --fix" },
    lint: {
        plugins: ["typescript", "unicorn", "import", "promise"],
        options: {
            typeAware: true,
            typeCheck: true,
        },
        rules: {
            "no-console": "off",
            "typescript/no-unused-vars": "warn",
            "typescript/no-floating-promises": "warn",
            "typescript/no-base-to-string": "warn",
            "typescript/no-redundant-type-constituents": "warn",
            "unicorn/no-null": "off",
            "unicorn/filename-case": "off",
            "unicorn/consistent-function-scoping": "off",
            "unicorn/prefer-add-event-listener": "off",
            "unicorn/no-array-reverse": "off",
            "unicorn/no-array-sort": "off",
            "import/no-cycle": "warn",
            "import/no-unassigned-import": "off",
            "import/namespace": "warn",
            "promise/always-return": "warn",
        },
        overrides: [
            {
                files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts"],
                rules: {
                    "typescript/no-unused-vars": "off",
                },
            },
            {
                files: ["**/migrations/**"],
                rules: {
                    "no-console": "off",
                    "typescript/no-unused-vars": "off",
                },
            },
        ],
    },
    fmt: {
        semi: true,
        singleQuote: false,
        tabWidth: 4,
        printWidth: 100,
        trailingComma: "all",
    },
});
