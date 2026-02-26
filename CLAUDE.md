# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Serverless Framework plugin that evaluates PKL (Apple's configuration language) files, injects the results as Mustache template variables into the serverless configuration, and optionally uploads the evaluated output to AWS S3.

## Commands

| Command                          | Purpose                                          |
| -------------------------------- | ------------------------------------------------ |
| `npm run build`                  | Compile TypeScript to `dist/`                    |
| `npm run typecheck`              | Type-check without emitting                      |
| `npm test`                       | Run Vitest test suite                            |
| `npm run lint`                   | ESLint with auto-fix                             |
| `npm run format`                 | Prettier formatting                              |
| `npm install --legacy-peer-deps` | Install dependencies (legacy-peer-deps required) |

## Architecture

### TypeScript plugin (`src/index.ts`)

The entire plugin is one class (`SlsPlugin`) that implements the Serverless Framework plugin interface. Type definitions live in `src/types.ts`. The compiled output goes to `dist/`.

Processing flow:

1. **Initialization**: Constructor calls `applyPklConfig()` which shells out to `pkl eval -f json <file>` to evaluate the PKL file
2. **Template injection**: PKL output keys are prefixed with `pkl:` and injected into the serverless config via Mustache rendering (e.g., `{{ pkl:stage }}` in serverless.yml resolves to the PKL value)
3. **Context serialization**: The entire serverless service config is serialized to JSON, rendered through Mustache with PKL values, then parsed back and applied via `serverless.extendConfiguration()`
4. **S3 upload** (optional): On deploy, the evaluated PKL output is uploaded to an S3 bucket as `{service-name}.{format}`
5. **S3 cleanup**: On `sls remove`, the S3 object is deleted

### Lifecycle hooks

- `pkl:upload:upload` — manual upload command (`sls pkl upload`)
- `before:package:createDeploymentArtifacts` — auto-upload on deploy
- `after:remove:remove` — cleanup on stack removal

### Tests (`tests/index.test.ts`)

Vitest with built-in assertions and `vi.fn()` mocks. Tests mock `child_process.execSync` and AWS provider requests. The constructor receives `{ test: true }` in options to skip `applyPklConfig()` during test setup.

## Code Style

- **TypeScript** with ES Modules (`"type": "module"` in package.json)
- **ESLint**: Airbnb extended config + TypeScript + Prettier integration (flat config in `eslint.config.mjs`)
- **Prettier**: single quotes, semicolons, 120 char width, trailing commas in ES5 positions

## Commit Conventions

Commitizen with custom schema (`.cz.toml`). Required format:

```
type(scope)?: message
```

Types: `break`, `build`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `style`, `test`, `chore`, `revert`, `bump`, `deps`

Version bumps: `break` → MAJOR, `build`/`feat`/`revert` → MINOR, `fix`/`refactor`/`style`/`test`/`deps`/`chore` → PATCH
