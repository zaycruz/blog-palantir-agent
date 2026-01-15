export type ContentType = "linkedin_post" | "linkedin_article" | "blog_post";

export type ApprovalStatus = "pending" | "approved" | "rejected";

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

export interface InterviewEntry {
  id: string;
  question: string;
  answer: string;
  createdAt: string;
}

export interface TopicQueueItem {
  id: string;
  topic: string;
  notes?: string;
  createdAt: string;
}

export interface StoreData {
  drafts: Draft[];
  interviews: InterviewEntry[];
  topics: TopicQueueItem[];
}
