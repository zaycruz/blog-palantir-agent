# Sprint Planning & Cycles

## Cycle Management

### Viewing Current Sprint
- Use `getCurrentCycle` to see active sprint and its issues
- Report: total issues, completed, in progress, remaining

### Sprint Metrics
- **Velocity**: Issues completed per sprint
- **Burndown**: Remaining work over time
- **Scope changes**: Issues added/removed mid-sprint

## Common Queries

### "What's in the sprint?"
1. Call getCurrentCycle
2. Summarize by status (Todo, In Progress, Done)
3. Highlight blocked or at-risk items

### "Sprint progress"
1. Get cycle data
2. Calculate completion percentage
3. Compare to time elapsed in sprint

### "What should I work on?"
1. Get user's assigned issues
2. Filter by current cycle
3. Prioritize by: Urgent > High > deadline > oldest

## Backlog Grooming

### Prioritization Framework
1. Business value (revenue impact, user requests)
2. Technical risk (complexity, dependencies)
3. Effort estimate
4. Strategic alignment

### Issue Sizing
- **Small**: < 1 day, well-understood
- **Medium**: 1-3 days, some unknowns
- **Large**: 3-5 days, needs breakdown
- **Epic**: > 5 days, must be split
