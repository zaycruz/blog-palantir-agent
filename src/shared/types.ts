// Shared types for the multi-agent platform

// Agent types
export type AgentType = 'content' | 'hubspot' | 'general';

// Content types (from original models)
export type ContentType = "linkedin_post" | "linkedin_article" | "blog_post";
export type ApprovalStatus = "pending" | "approved" | "rejected";

// Draft model
export interface Draft {
  id: string;
  title: string;
  body: string;
  contentType: ContentType;
  createdAt: string;
  updatedAt: string;
  status: ApprovalStatus;
  feedback?: string;
}

// Interview entry
export interface InterviewEntry {
  id: string;
  question: string;
  answer: string;
  createdAt: string;
}

// Topic queue item
export interface TopicQueueItem {
  id: string;
  topic: string;
  notes?: string;
  createdAt: string;
}

// Content store data
export interface ContentStoreData {
  drafts: Draft[];
  interviews: InterviewEntry[];
  topics: TopicQueueItem[];
}

// Research item for Content Agent
export interface ResearchItem {
  id: string;
  date: string;
  source: string;
  url: string;
  title: string;
  summary: string;
  tags: string[];
  usedInPost: boolean;
}

// Signal log entry for Content Agent
export interface SignalLogEntry {
  id: string;
  date: string;
  source: string;
  observation: string;
  potentialAngle: string;
  frequency: number;
}

// HubSpot entity types
export interface HubSpotContact {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  phone?: string;
  properties: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface HubSpotCompany {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  properties: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface HubSpotDeal {
  id: string;
  name: string;
  stage: string;
  amount?: number;
  closeDate?: string;
  pipeline?: string;
  associatedContacts: string[];
  associatedCompanies: string[];
  properties: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface HubSpotTask {
  id: string;
  subject: string;
  body?: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  dueDate?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  associatedContactId?: string;
  associatedDealId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HubSpotNote {
  id: string;
  body: string;
  associatedContactId?: string;
  associatedDealId?: string;
  associatedCompanyId?: string;
  createdAt: string;
}

// Entity reference for conversation context
export interface EntityRef {
  type: 'contact' | 'deal' | 'company' | 'task';
  id: string;
  name: string;
  mentionedAt: string;
}

// Conversation turn
export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  agent?: AgentType;
}

// Conversation context
export interface ConversationContext {
  id: string;
  slackChannelId: string;
  slackThreadTs?: string;
  userId: string;
  activeAgent: AgentType | null;
  history: ConversationTurn[];
  entities: {
    contacts: EntityRef[];
    deals: EntityRef[];
    companies: EntityRef[];
  };
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
}

// Classification result
export interface ClassificationResult {
  agent: AgentType;
  intent: string;
  confidence: number;
  entities: ExtractedEntity[];
}

// Extracted entity from message
export interface ExtractedEntity {
  type: 'contact' | 'deal' | 'company' | 'task' | 'date' | 'amount';
  value: string;
  resolved_id?: string;
  resolved_name?: string;
}

// Agent response
export interface AgentResponse {
  message: string;
  entities?: EntityRef[];
  actions?: AgentAction[];
}

// Agent action for tracking what was done
export interface AgentAction {
  type: string;
  description: string;
  entityId?: string;
  entityType?: string;
}

// Search result from web search
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  score: number;
}

// LLM message format
export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
