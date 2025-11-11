# Graphex Development Principles

Core principles guiding development decisions. For architecture, see [TECHNICAL.md](TECHNICAL.md). For workflow, see [../../CLAUDE.md](../../CLAUDE.md).

---

## 1. Atomic File Structure

**Principle**: Each file should have a single, well-defined purpose.

A file that defines a server should only define the server. A file that contains utility functions should only contain those functions. Avoid creating monolithic files that handle multiple, unrelated responsibilities.

**Why**: Separation of concerns makes code easier to locate, understand, modify, and test.

---

## 2. Atomic Code (Functions/Classes)

**Principle**: Every function or class should do one thing and do it well.

Functions should be small and focused. If a function is performing multiple distinct operations, it should be broken down into smaller, more specific functions.

**Why**: Small, focused functions promote reusability and simplify testing and debugging. Code becomes self-documenting through clear, descriptive function names.

---

## 3. Always Test

**Principle**: Always implement comprehensive, reasonable, and well-defined test cases before moving too far on any component/feature development.

Use tests flexibly during development to verify coding ideas and logic. Tests should not be overwhelming; tests should not interfere with development; tests should be helping the development.

**Why**: Early testing catches issues sooner, validates logic incrementally, and prevents technical debt. Tests serve as living documentation of intended behavior.

---

## 4. Co-located Documentation

**Principle**: Any significant feature, module, or service within a package must be accompanied by a `***_META.md` file in the same directory, where `***` is the component/feature name.

This file should explain the feature's purpose, its core logic, and how it interacts with other parts of the system.

**Example**: A complex `GraphGenerator` service must be located alongside a `GraphGenerator_META.md` file that explains its algorithm and usage.

**Why**: Complex components need context. Co-located documentation ensures future developers understand the "why" behind implementation decisions and how pieces fit together.

---

## 5. Proper File Structure

**Principle**: Files serving different functionality at different levels of the service should be organized into folders or sub-folders with names that concisely explain their content.

- Working with the Co-located Documentation principle, each folder should have one and only one `META.md` that describes all of its content (scripts, sub-folders)
- Properly use sub-folders to organize code
- Understand file structure as a tree: any non-leaf node should not have too many files, or no files at all if logically there should be no file at that abstract level

**Why**: Clear hierarchical organization makes the codebase navigable and understandable. Balanced tree structure prevents both flat chaos and over-nesting.

---

## 6. Comments and Code Style

**Principle**: Adapt Google Style in specific code writing. Comments should be good so that another developer would be able to pick up development of the project.

**Guidelines**:
- Explain WHY, not WHAT (code should be self-explanatory for what it does)
- Document complex algorithms or non-obvious logic
- Link to relevant META files for deeper context
- Use JSDoc for public APIs
- Don't leave commented-out code (use git history instead)

**Why**: Consistent style improves readability across the codebase. Good comments explain reasoning and context that isn't apparent from code alone.

---

## 7. Iteration Awareness

**Principle**: We code in iterations. Therefore, it is extremely important to be aware of cleaning up old-version code if the older versions are no longer in use.

Avoid redundancy at your best.

**Guidelines**:
- Remove unused imports, functions, and files after refactoring
- Don't keep "just in case" code; use version control instead
- When deprecating: mark with JSDoc, log warnings, document replacement, then remove after one iteration
- Before refactoring: ensure tests exist
- After refactoring: remove old code and update documentation

**Why**: Code accumulates cruft over time. Regular cleanup prevents confusion, reduces maintenance burden, and keeps the codebase lean and understandable.

---

## Enforcement

### Code Review Checklist
- [ ] Each file has single, well-defined purpose
- [ ] Functions are focused and do one thing well
- [ ] Tests are comprehensive and reasonable
- [ ] Complex features have co-located META documentation
- [ ] File structure is organized with folder META.md files
- [ ] Comments explain WHY, not WHAT
- [ ] No redundant or deprecated code remains
- [ ] Follows Google TypeScript style guide

### Claude Agent Integration
When using agents (see [../../CLAUDE.md](../../CLAUDE.md)), instruct them to follow these principles:
- "Follow patterns in TECHNICAL.md and REGULATION.md"
- Agents should update relevant META files after major changes

---

## When to Break Principles

These are strong guidelines, not rigid laws. Exceptions are acceptable when:
- **Performance**: Optimization requires different approach
- **Prototyping**: MVP features may temporarily defer complete documentation
- **External constraints**: Third-party libraries impose different patterns

**When breaking principles, document why**: Use comments to explain the exception and reference relevant discussion or META files.

---

## Quick Reference

| Principle | Core Idea |
|-----------|-----------|
| Atomic File Structure | One purpose per file |
| Atomic Code | One thing per function/class |
| Always Test | Test early and comprehensively |
| Co-located Documentation | Complex features need `***_META.md` |
| Proper File Structure | Balanced tree, folder META.md required |
| Comments and Style | Google TypeScript, explain WHY |
| Iteration Awareness | Clean up old code immediately |

---

**Version**: 1.0 | **Updated**: 2024-11-11
