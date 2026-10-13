import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts"],
  },
  {
    // The Create React App config this replaced (`react-app`) never enforced
    // these. The upstream NVIDIA chat code trips them — `any` on message
    // payloads, setState inside fetch effects, a ref array read in render —
    // and it works. They stay visible as warnings so new code does not add
    // to the pile, without turning a build-tool migration into a rewrite.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
    },
  },
];

export default config;
