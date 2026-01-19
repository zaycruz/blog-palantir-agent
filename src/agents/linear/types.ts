// Linear API types

export interface LinearIssue {
  id: string;
  identifier: string; // e.g., "ENG-123"
  title: string;
  description?: string;
  priority: number; // 0=none, 1=urgent, 2=high, 3=medium, 4=low
  state: {
    id: string;
    name: string;
    type: string; // backlog, unstarted, started, completed, canceled
  };
  assignee?: {
    id: string;
    name: string;
    email: string;
  };
  project?: {
    id: string;
    name: string;
  };
  team: {
    id: string;
    name: string;
    key: string;
  };
  labels: {
    nodes: Array<{
      id: string;
      name: string;
      color: string;
    }>;
  };
  createdAt: string;
  updatedAt: string;
  url: string;
}

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
  description?: string;
}

export interface LinearProject {
  id: string;
  name: string;
  description?: string;
  state: string;
  progress: number;
  targetDate?: string;
  teams: {
    nodes: LinearTeam[];
  };
}

export interface LinearCycle {
  id: string;
  number: number;
  name?: string;
  startsAt: string;
  endsAt: string;
  progress: number;
  issues: {
    nodes: LinearIssue[];
  };
}

export interface LinearUser {
  id: string;
  name: string;
  email: string;
  displayName: string;
}

export interface LinearWorkflowState {
  id: string;
  name: string;
  type: string;
  color: string;
  position: number;
}

export interface CreateIssueInput {
  title: string;
  description?: string;
  teamId: string;
  priority?: number;
  assigneeId?: string;
  projectId?: string;
  labelIds?: string[];
  stateId?: string;
}

export interface UpdateIssueInput {
  id: string;
  title?: string;
  description?: string;
  priority?: number;
  assigneeId?: string;
  stateId?: string;
  projectId?: string;
}

export interface CreateCommentInput {
  issueId: string;
  body: string;
}

export interface LinearApiConfig {
  apiKey: string;
}
