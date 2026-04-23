# Specs

This directory contains the feature specifications for OC-Kitchen. Specs are the **source of truth** for how the app should behave.

## Workflow

```
specs/*.md  →  tests/*.test.ts  →  src/ implementation
```

1. **Write the spec** — describe the feature in detail using the template below
2. **Derive tests** — write failing tests that encode the spec's behavior rules and API contracts
3. **Implement** — build code until all tests pass
4. **Update spec first** — if behavior needs to change, update the spec, then the tests, then the code

## Spec Template

Each spec file should include:

### Overview
Brief description of the feature and its purpose.

### User Stories
- As a user, I can ...
- As a user, I can ...

### Data Model
References to relevant tables and their relationships. See `shared/data-model.md` for the canonical schema.

### API Contracts
For each endpoint:
- Method + path
- Request body (with types)
- Success response (status code + body)
- Error responses (status codes + bodies)

### Behavior Rules
Numbered list of precise, testable rules that govern how the feature works.

### Edge Cases
Scenarios that need explicit handling.

## Conventions

- Reference the spec from test files: `// Spec: specs/recipes/recipe-management.md — "Rule 3: Rating must be 1-5"`
- One spec per logical feature area (not per endpoint)
- Keep specs updated — stale specs are worse than no specs
