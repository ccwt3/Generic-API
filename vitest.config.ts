import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: "./tests/globalSetup.ts",
    // Los archivos corren en serie: comparten una sola DB que se trunca entre tests.
    fileParallelism: false,
    // Margen para arrancar el contenedor de PostgreSQL (y el pull de la imagen
    // la primera vez).
    hookTimeout: 120_000,
    testTimeout: 15_000,
  },
});
