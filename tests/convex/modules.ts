/// <reference types="vite/client" />
export const modules = import.meta.glob(["../../convex/**/*.{ts,js}", "!../../convex/**/*.test.ts"]);
