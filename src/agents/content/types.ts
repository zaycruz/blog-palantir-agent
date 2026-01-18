// Content Agent types

import { Draft, ContentType, ApprovalStatus, ResearchItem, SignalLogEntry, InterviewEntry, TopicQueueItem } from '../../shared/types.js';

export {
  Draft,
  ContentType,
  ApprovalStatus,
  ResearchItem,
  SignalLogEntry,
  InterviewEntry,
  TopicQueueItem
};

export interface CreateDraftInput {
  title: string;
  body: string;
  contentType: ContentType;
}

export interface UpdateDraftInput {
  title?: string;
  body?: string;
}

export interface DraftWithCriticFeedback extends Draft {
  criticFeedback?: string[];
  humanFeedback?: string[];
  version: number;
}

export interface ResearchResult {
  items: ResearchItem[];
  signals: SignalLogEntry[];
  synthesis?: string;
}

export interface ContentCheckpoint {
  draft: Draft;
  criticFeedback: string[];
  needsHumanReview: boolean;
}
