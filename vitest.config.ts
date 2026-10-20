import { defineConfig } from 'vitest/config'

// Tests unitarios de la lógica de src/lib. La cobertura sale en lcov para
// SonarQube (sonar.javascript.lcov.reportPaths en sonar-project.properties).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage',
      // Mismo alcance que mide SonarQube: la lógica de src/lib.
      include: ['src/lib/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
    },
  },
})
