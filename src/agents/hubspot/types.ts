// HubSpot Agent types

export interface HubSpotConfig {
  accessToken: string;
  portalId?: string;
}

// API Response types
export interface HubSpotApiResponse<T> {
  results?: T[];
  paging?: {
    next?: {
      after: string;
      link: string;
    };
  };
}

export interface HubSpotContact {
  id: string;
  properties: {
    email?: string;
    firstname?: string;
    lastname?: string;
    company?: string;
    jobtitle?: string;
    phone?: string;
    [key: string]: string | undefined;
  };
  createdAt: string;
  updatedAt: string;
}

export interface HubSpotCompany {
  id: string;
  properties: {
    name?: string;
    domain?: string;
    industry?: string;
    [key: string]: string | undefined;
  };
  createdAt: string;
  updatedAt: string;
}

export interface HubSpotDeal {
  id: string;
  properties: {
    dealname?: string;
    dealstage?: string;
    amount?: string;
    closedate?: string;
    pipeline?: string;
    [key: string]: string | undefined;
  };
  createdAt: string;
  updatedAt: string;
}

export interface HubSpotTask {
  id: string;
  properties: {
    hs_task_subject?: string;
    hs_task_body?: string;
    hs_task_status?: string;
    hs_task_priority?: string;
    hs_timestamp?: string;
    [key: string]: string | undefined;
  };
  createdAt: string;
  updatedAt: string;
}

export interface HubSpotNote {
  id: string;
  properties: {
    hs_note_body?: string;
    hs_timestamp?: string;
    [key: string]: string | undefined;
  };
  createdAt: string;
  updatedAt: string;
}

// Input types for creating entities
export interface CreateContactInput {
  email?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  phone?: string;
}

export interface CreateCompanyInput {
  name: string;
  domain?: string;
  industry?: string;
}

export interface CreateDealInput {
  name: string;
  stage?: string;
  amount?: number;
  closeDate?: string;
  pipeline?: string;
}

export interface CreateTaskInput {
  subject: string;
  body?: string;
  dueDate?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  associatedContactId?: string;
  associatedDealId?: string;
}

export interface CreateNoteInput {
  body: string;
  associatedContactId?: string;
  associatedDealId?: string;
  associatedCompanyId?: string;
}

// Pipeline stages
export interface PipelineStage {
  id: string;
  label: string;
  displayOrder: number;
}

export interface Pipeline {
  id: string;
  label: string;
  stages: PipelineStage[];
}
