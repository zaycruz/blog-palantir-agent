# Palantir Foundry Domain Knowledge

Deep expertise in Palantir Foundry is a key differentiator for Raava. This knowledge informs content and establishes credibility.

## What is Palantir Foundry?

Foundry is Palantir's commercial software platform that helps organizations integrate, manage, and analyze data to make better decisions. It's an operating system for data-driven operations.

**Key value propositions:**
- Unify data from disparate sources
- Build operational applications on top of data
- Enable non-technical users to work with data
- Maintain data lineage and governance
- Deploy AI/ML models operationally

## Core Concepts

### The Ontology
The heart of Foundry. A semantic layer that models real-world business objects and their relationships.

- **Object Types** - Represent business entities (Customer, Order, Asset, etc.)
- **Properties** - Attributes of objects (name, status, value)
- **Links** - Relationships between objects (Customer → Orders)
- **Actions** - Operations that modify objects (Approve, Reject, Update)

**Why it matters:** The Ontology makes data accessible to business users without SQL. It's the abstraction layer that enables operational applications.

### Data Integration (Pipeline Builder)
- Visual and code-based data transformation
- Supports Python, SQL, and low-code transforms
- Incremental processing for efficiency
- Full data lineage tracking

### OSDK (Ontology SDK)
Developer toolkit for building applications on top of the Ontology:
- TypeScript, Python, and other language SDKs
- Type-safe access to Ontology objects
- Enables custom UIs and integrations
- Powers both internal tools and customer-facing apps

### AIP (Artificial Intelligence Platform)
Palantir's AI/LLM layer on top of Foundry:
- **AIP Logic** - LLM-powered functions that can read/write Ontology
- **AIP Assist** - Conversational interface for data exploration
- **AIP Agents** - Autonomous workflows powered by LLMs
- Connects AI to operational data and actions (not just chat)

### Workshop
Low-code application builder:
- Drag-and-drop UI components
- Connects directly to Ontology
- Build operational dashboards and workflows
- No frontend code required

### Other Key Components
- **Quiver** - Spreadsheet-like interface on Ontology
- **Vertex** - Graph visualization and analysis
- **Contour** - Visual data exploration and analysis
- **Slate** - Custom dashboard builder (older, being replaced by Workshop)
- **Code Repositories** - Git-based code management
- **Marketplace** - Pre-built solutions and templates

## Common Use Cases

### Operations Management
- Supply chain visibility and optimization
- Asset tracking and maintenance
- Resource allocation and scheduling

### Decision Support
- Executive dashboards
- Scenario modeling
- What-if analysis

### Data Integration
- Unifying siloed data sources
- Master data management
- Data quality monitoring

### AI/ML Deployment
- Model training and deployment
- Operational AI (not just analytics)
- Human-in-the-loop workflows

## Foundry vs. Competitors

### vs. Snowflake/Databricks
- Foundry is an application platform, not just a data warehouse
- Ontology provides semantic layer they lack
- More opinionated about how to build operational systems

### vs. Custom Development
- Faster time to value
- Built-in data governance
- Less maintenance burden
- But less flexibility for very custom needs

### vs. Low-Code Platforms (Retool, etc.)
- Much more powerful data integration
- Better for complex data environments
- Steeper learning curve
- More expensive

## Foundry Strengths

- **Data integration at scale** - Handles complex, messy enterprise data
- **Governance built-in** - Lineage, access control, audit trails
- **Ontology abstraction** - Makes data accessible to non-technical users
- **Operational focus** - Built for action, not just analysis
- **AI integration** - AIP connects LLMs to operational workflows

## Foundry Limitations

- **Cost** - Expensive, especially for smaller organizations
- **Complexity** - Steep learning curve
- **Vendor lock-in** - Significant investment to adopt
- **Overkill for simple needs** - Not every problem needs Foundry
- **Implementation effort** - Requires real commitment to see value

## Content Angles for Raava

When writing about Foundry:
- **Be honest about tradeoffs** - Builds credibility
- **Focus on practical value** - Not feature lists
- **Address SMB concerns** - Cost, complexity, fit
- **Share real insights** - Not marketing talking points
- **Compare fairly** - Acknowledge alternatives
- **Emphasize outcomes** - What can you actually do with it?

## Key Resources

- **docs.palantir.com** - Official documentation
- **blog.palantir.com** - Company blog and announcements
- **Palantir YouTube** - Demos and AIP Con recordings
- **r/palantir** - Community discussions (investor-heavy but some practitioners)
- **LinkedIn** - Palantir employees sharing insights
