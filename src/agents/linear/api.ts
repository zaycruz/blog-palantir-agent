// Linear GraphQL API client

import {
  LinearApiConfig,
  LinearIssue,
  LinearTeam,
  LinearProject,
  LinearCycle,
  LinearUser,
  LinearWorkflowState,
  CreateIssueInput,
  UpdateIssueInput,
  CreateCommentInput
} from './types.js';

const LINEAR_API_URL = 'https://api.linear.app/graphql';

export class LinearApiClient {
  private apiKey: string;

  constructor(config: LinearApiConfig) {
    this.apiKey = config.apiKey;
  }

  private async query<T>(query: string, variables?: Record<string, any>): Promise<T> {
    const response = await fetch(LINEAR_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.apiKey
      },
      body: JSON.stringify({ query, variables })
    });

    const result = await response.json();

    if (result.errors) {
      throw new Error(result.errors.map((e: any) => e.message).join(', '));
    }

    return result.data;
  }

  // Get current user
  async getViewer(): Promise<LinearUser> {
    const data = await this.query<{ viewer: LinearUser }>(`
      query {
        viewer {
          id
          name
          email
          displayName
        }
      }
    `);
    return data.viewer;
  }

  // Get all teams
  async getTeams(): Promise<LinearTeam[]> {
    const data = await this.query<{ teams: { nodes: LinearTeam[] } }>(`
      query {
        teams {
          nodes {
            id
            name
            key
            description
          }
        }
      }
    `);
    return data.teams.nodes;
  }

  // Get workflow states for a team
  async getWorkflowStates(teamId: string): Promise<LinearWorkflowState[]> {
    const data = await this.query<{ team: { states: { nodes: LinearWorkflowState[] } } }>(`
      query($teamId: String!) {
        team(id: $teamId) {
          states {
            nodes {
              id
              name
              type
              color
              position
            }
          }
        }
      }
    `, { teamId });
    return data.team.states.nodes;
  }

  // Create an issue
  async createIssue(input: CreateIssueInput): Promise<LinearIssue> {
    const data = await this.query<{ issueCreate: { issue: LinearIssue } }>(`
      mutation($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          issue {
            id
            identifier
            title
            description
            priority
            url
            state {
              id
              name
              type
            }
            assignee {
              id
              name
              email
            }
            team {
              id
              name
              key
            }
            createdAt
            updatedAt
          }
        }
      }
    `, { input });
    return data.issueCreate.issue;
  }

  // Update an issue
  async updateIssue(input: UpdateIssueInput): Promise<LinearIssue> {
    const { id, ...updateData } = input;
    const data = await this.query<{ issueUpdate: { issue: LinearIssue } }>(`
      mutation($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          issue {
            id
            identifier
            title
            description
            priority
            url
            state {
              id
              name
              type
            }
            assignee {
              id
              name
              email
            }
            team {
              id
              name
              key
            }
            updatedAt
          }
        }
      }
    `, { id, input: updateData });
    return data.issueUpdate.issue;
  }

  // Search issues
  async searchIssues(query: string, limit: number = 20): Promise<LinearIssue[]> {
    const data = await this.query<{ issueSearch: { nodes: LinearIssue[] } }>(`
      query($query: String!, $first: Int) {
        issueSearch(query: $query, first: $first) {
          nodes {
            id
            identifier
            title
            description
            priority
            url
            state {
              id
              name
              type
            }
            assignee {
              id
              name
              email
            }
            project {
              id
              name
            }
            team {
              id
              name
              key
            }
            labels {
              nodes {
                id
                name
                color
              }
            }
            createdAt
            updatedAt
          }
        }
      }
    `, { query, first: limit });
    return data.issueSearch.nodes;
  }

  // Get issues assigned to current user
  async getMyIssues(limit: number = 20): Promise<LinearIssue[]> {
    const data = await this.query<{ viewer: { assignedIssues: { nodes: LinearIssue[] } } }>(`
      query($first: Int) {
        viewer {
          assignedIssues(first: $first, filter: { state: { type: { nin: ["completed", "canceled"] } } }) {
            nodes {
              id
              identifier
              title
              description
              priority
              url
              state {
                id
                name
                type
              }
              project {
                id
                name
              }
              team {
                id
                name
                key
              }
              labels {
                nodes {
                  id
                  name
                  color
                }
              }
              createdAt
              updatedAt
            }
          }
        }
      }
    `, { first: limit });
    return data.viewer.assignedIssues.nodes;
  }

  // Get issue by identifier (e.g., "ENG-123")
  async getIssue(identifier: string): Promise<LinearIssue | null> {
    try {
      const data = await this.query<{ issue: LinearIssue }>(`
        query($id: String!) {
          issue(id: $id) {
            id
            identifier
            title
            description
            priority
            url
            state {
              id
              name
              type
            }
            assignee {
              id
              name
              email
            }
            project {
              id
              name
            }
            team {
              id
              name
              key
            }
            labels {
              nodes {
                id
                name
                color
              }
            }
            createdAt
            updatedAt
          }
        }
      `, { id: identifier });
      return data.issue;
    } catch {
      return null;
    }
  }

  // Add comment to issue
  async addComment(input: CreateCommentInput): Promise<{ id: string; body: string }> {
    const data = await this.query<{ commentCreate: { comment: { id: string; body: string } } }>(`
      mutation($input: CommentCreateInput!) {
        commentCreate(input: $input) {
          comment {
            id
            body
          }
        }
      }
    `, { input });
    return data.commentCreate.comment;
  }

  // Get projects
  async getProjects(first: number = 20): Promise<LinearProject[]> {
    const data = await this.query<{ projects: { nodes: LinearProject[] } }>(`
      query($first: Int) {
        projects(first: $first) {
          nodes {
            id
            name
            description
            state
            progress
            targetDate
            teams {
              nodes {
                id
                name
                key
              }
            }
          }
        }
      }
    `, { first });
    return data.projects.nodes;
  }

  // Get current cycle for a team
  async getCurrentCycle(teamId: string): Promise<LinearCycle | null> {
    const data = await this.query<{ team: { activeCycle: LinearCycle | null } }>(`
      query($teamId: String!) {
        team(id: $teamId) {
          activeCycle {
            id
            number
            name
            startsAt
            endsAt
            progress
            issues {
              nodes {
                id
                identifier
                title
                priority
                state {
                  id
                  name
                  type
                }
                assignee {
                  id
                  name
                }
              }
            }
          }
        }
      }
    `, { teamId });
    return data.team.activeCycle;
  }

  // Get team members
  async getTeamMembers(teamId: string): Promise<LinearUser[]> {
    const data = await this.query<{ team: { members: { nodes: LinearUser[] } } }>(`
      query($teamId: String!) {
        team(id: $teamId) {
          members {
            nodes {
              id
              name
              email
              displayName
            }
          }
        }
      }
    `, { teamId });
    return data.team.members.nodes;
  }
}
