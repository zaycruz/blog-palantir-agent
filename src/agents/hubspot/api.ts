// HubSpot API client

import {
  HubSpotConfig,
  HubSpotContact,
  HubSpotCompany,
  HubSpotDeal,
  HubSpotTask,
  HubSpotNote,
  HubSpotApiResponse,
  Pipeline
} from './types.js';
import {
  createApiError,
  createAuthError,
  createRateLimitError,
  withRetry
} from '../../shared/errors.js';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

export class HubSpotApiClient {
  private accessToken: string;

  constructor(config: HubSpotConfig) {
    this.accessToken = config.accessToken;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    endpoint: string,
    body?: any
  ): Promise<T> {
    return withRetry(async () => {
      const response = await fetch(`${HUBSPOT_API_BASE}${endpoint}`, {
        method,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
      });

      if (response.status === 401) {
        throw createAuthError('HubSpot');
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        throw createRateLimitError('HubSpot', retryAfter ? parseInt(retryAfter) : undefined);
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw createApiError('HubSpot', response.status, errorData.message || response.statusText);
      }

      if (response.status === 204) {
        return {} as T;
      }

      return response.json() as Promise<T>;
    }, {
      maxAttempts: 3,
      initialDelayMs: 1000
    });
  }

  // ===== CONTACTS =====

  async createContact(properties: Record<string, string>): Promise<HubSpotContact> {
    return this.request<HubSpotContact>('POST', '/crm/v3/objects/contacts', {
      properties
    });
  }

  async getContact(id: string): Promise<HubSpotContact> {
    return this.request<HubSpotContact>(
      'GET',
      `/crm/v3/objects/contacts/${id}?properties=email,firstname,lastname,company,jobtitle,phone`
    );
  }

  async updateContact(id: string, properties: Record<string, string>): Promise<HubSpotContact> {
    return this.request<HubSpotContact>('PATCH', `/crm/v3/objects/contacts/${id}`, {
      properties
    });
  }

  async searchContacts(query: string, limit: number = 10): Promise<HubSpotContact[]> {
    const response = await this.request<HubSpotApiResponse<HubSpotContact>>(
      'POST',
      '/crm/v3/objects/contacts/search',
      {
        query,
        limit,
        properties: ['email', 'firstname', 'lastname', 'company', 'jobtitle', 'phone']
      }
    );
    return response.results || [];
  }

  async listContacts(limit: number = 100): Promise<HubSpotContact[]> {
    const response = await this.request<HubSpotApiResponse<HubSpotContact>>(
      'GET',
      `/crm/v3/objects/contacts?limit=${limit}&properties=email,firstname,lastname,company,jobtitle,phone`
    );
    return response.results || [];
  }

  // ===== COMPANIES =====

  async createCompany(properties: Record<string, string>): Promise<HubSpotCompany> {
    return this.request<HubSpotCompany>('POST', '/crm/v3/objects/companies', {
      properties
    });
  }

  async getCompany(id: string): Promise<HubSpotCompany> {
    return this.request<HubSpotCompany>(
      'GET',
      `/crm/v3/objects/companies/${id}?properties=name,domain,industry`
    );
  }

  async updateCompany(id: string, properties: Record<string, string>): Promise<HubSpotCompany> {
    return this.request<HubSpotCompany>('PATCH', `/crm/v3/objects/companies/${id}`, {
      properties
    });
  }

  async searchCompanies(query: string, limit: number = 10): Promise<HubSpotCompany[]> {
    const response = await this.request<HubSpotApiResponse<HubSpotCompany>>(
      'POST',
      '/crm/v3/objects/companies/search',
      {
        query,
        limit,
        properties: ['name', 'domain', 'industry']
      }
    );
    return response.results || [];
  }

  // ===== DEALS =====

  async createDeal(properties: Record<string, string>): Promise<HubSpotDeal> {
    return this.request<HubSpotDeal>('POST', '/crm/v3/objects/deals', {
      properties
    });
  }

  async getDeal(id: string): Promise<HubSpotDeal> {
    return this.request<HubSpotDeal>(
      'GET',
      `/crm/v3/objects/deals/${id}?properties=dealname,dealstage,amount,closedate,pipeline`
    );
  }

  async updateDeal(id: string, properties: Record<string, string>): Promise<HubSpotDeal> {
    return this.request<HubSpotDeal>('PATCH', `/crm/v3/objects/deals/${id}`, {
      properties
    });
  }

  async searchDeals(query: string, limit: number = 10): Promise<HubSpotDeal[]> {
    const response = await this.request<HubSpotApiResponse<HubSpotDeal>>(
      'POST',
      '/crm/v3/objects/deals/search',
      {
        query,
        limit,
        properties: ['dealname', 'dealstage', 'amount', 'closedate', 'pipeline']
      }
    );
    return response.results || [];
  }

  async listDeals(limit: number = 100): Promise<HubSpotDeal[]> {
    const response = await this.request<HubSpotApiResponse<HubSpotDeal>>(
      'GET',
      `/crm/v3/objects/deals?limit=${limit}&properties=dealname,dealstage,amount,closedate,pipeline`
    );
    return response.results || [];
  }

  // ===== TASKS =====

  async createTask(properties: Record<string, string>): Promise<HubSpotTask> {
    return this.request<HubSpotTask>('POST', '/crm/v3/objects/tasks', {
      properties
    });
  }

  async getTask(id: string): Promise<HubSpotTask> {
    return this.request<HubSpotTask>(
      'GET',
      `/crm/v3/objects/tasks/${id}?properties=hs_task_subject,hs_task_body,hs_task_status,hs_task_priority,hs_timestamp`
    );
  }

  async updateTask(id: string, properties: Record<string, string>): Promise<HubSpotTask> {
    return this.request<HubSpotTask>('PATCH', `/crm/v3/objects/tasks/${id}`, {
      properties
    });
  }

  async listTasks(limit: number = 100): Promise<HubSpotTask[]> {
    const response = await this.request<HubSpotApiResponse<HubSpotTask>>(
      'GET',
      `/crm/v3/objects/tasks?limit=${limit}&properties=hs_task_subject,hs_task_body,hs_task_status,hs_task_priority,hs_timestamp`
    );
    return response.results || [];
  }

  // ===== NOTES =====

  async createNote(properties: Record<string, string>): Promise<HubSpotNote> {
    return this.request<HubSpotNote>('POST', '/crm/v3/objects/notes', {
      properties
    });
  }

  async listNotes(limit: number = 100): Promise<HubSpotNote[]> {
    const response = await this.request<HubSpotApiResponse<HubSpotNote>>(
      'GET',
      `/crm/v3/objects/notes?limit=${limit}&properties=hs_note_body,hs_timestamp`
    );
    return response.results || [];
  }

  // ===== ASSOCIATIONS =====

  async associateContactToDeal(contactId: string, dealId: string): Promise<void> {
    await this.request<void>(
      'PUT',
      `/crm/v3/objects/contacts/${contactId}/associations/deals/${dealId}/contact_to_deal`
    );
  }

  async associateContactToCompany(contactId: string, companyId: string): Promise<void> {
    await this.request<void>(
      'PUT',
      `/crm/v3/objects/contacts/${contactId}/associations/companies/${companyId}/contact_to_company`
    );
  }

  async associateNoteTo(
    noteId: string,
    objectType: 'contacts' | 'deals' | 'companies',
    objectId: string
  ): Promise<void> {
    const associationType = objectType === 'contacts' ? 'note_to_contact' :
      objectType === 'deals' ? 'note_to_deal' : 'note_to_company';

    await this.request<void>(
      'PUT',
      `/crm/v3/objects/notes/${noteId}/associations/${objectType}/${objectId}/${associationType}`
    );
  }

  async associateTaskTo(
    taskId: string,
    objectType: 'contacts' | 'deals',
    objectId: string
  ): Promise<void> {
    const associationType = objectType === 'contacts' ? 'task_to_contact' : 'task_to_deal';

    await this.request<void>(
      'PUT',
      `/crm/v3/objects/tasks/${taskId}/associations/${objectType}/${objectId}/${associationType}`
    );
  }

  // ===== PIPELINES =====

  async getPipelines(): Promise<Pipeline[]> {
    const response = await this.request<{ results: Pipeline[] }>(
      'GET',
      '/crm/v3/pipelines/deals'
    );
    return response.results || [];
  }
}
