# Linear Issue Management

## Issue Workflow

### Status Flow
1. **Backlog** → Unplanned work, ideas for later
2. **Todo** → Planned for upcoming work
3. **In Progress** → Actively being worked on
4. **In Review** → Code complete, awaiting review
5. **Done** → Completed and verified
6. **Canceled** → No longer needed

### Priority Guidelines
- **Urgent (1)**: Production issues, security vulnerabilities, blocking other work
- **High (2)**: Important features, significant bugs, deadline-driven
- **Medium (3)**: Standard work, improvements, non-critical bugs
- **Low (4)**: Nice-to-haves, minor improvements, tech debt
- **None (0)**: Unprioritized, needs triage

## Best Practices

### Creating Issues
- Use clear, action-oriented titles: "Add dark mode toggle" not "Dark mode"
- Include acceptance criteria in description
- Link related issues when relevant
- Add appropriate labels (Bug, Feature, Improvement)

### Updating Issues
- Move to "In Progress" when starting work
- Add comments for significant updates or blockers
- Link PRs when code is ready for review

## Team Context (Raava Solutions)

- Team key: RAA
- Issue format: RAA-{number}
- Focus areas: Web development, automation, AI agents

## Delegation to Coding Agents

When delegating issues to coding agents:

### Factory (@Factory)
- Fully autonomous - creates PRs automatically
- Best for: Well-defined tasks, bug fixes, feature implementation
- Runs tests, iterates on failures
- Use as default for coding work

### Codex (@Codex)
- Creates solution for review before PR
- Best for: Complex changes needing human oversight
- User explicitly requests: "assign to Codex"

### Assignment Commands
- "Create an issue and assign to Factory" → Auto-assign @Factory
- "Create an issue for Codex" → Assign to @Codex
- "Create an issue" (no agent mentioned) → Assign to @Factory by default
