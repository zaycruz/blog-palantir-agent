// Shared Slack utilities for the multi-agent platform

import { Draft } from "./types.js";

// Check if a message is a direct message
export const isDirectMessage = (channelType: string): boolean => {
  return channelType === 'im';
};

// Format a draft for Slack display
export const formatDraftSummary = (draft: Draft): string => {
  const bodyPreview = draft.body.length > 120 ? `${draft.body.slice(0, 117)}...` : draft.body;
  return `*${draft.title}* (${draft.contentType})\nStatus: ${draft.status}\n${bodyPreview}`;
};

// Format entity for display
export const formatEntity = (type: string, name: string, details?: string): string => {
  const icon = getEntityIcon(type);
  return details ? `${icon} *${name}* — ${details}` : `${icon} *${name}*`;
};

// Get icon for entity type
export const getEntityIcon = (type: string): string => {
  const icons: Record<string, string> = {
    contact: ':bust_in_silhouette:',
    company: ':office:',
    deal: ':handshake:',
    task: ':white_check_mark:',
    note: ':memo:',
    draft: ':page_facing_up:'
  };
  return icons[type] || ':small_blue_diamond:';
};

// Format success message
export const formatSuccess = (action: string, entity: string, details?: string): string => {
  const base = `:white_check_mark: ${action}: *${entity}*`;
  return details ? `${base}\n${details}` : base;
};

// Format error message
export const formatError = (message: string): string => {
  return `:x: ${message}`;
};

// Format info message
export const formatInfo = (message: string): string => {
  return `:information_source: ${message}`;
};

// Format warning message
export const formatWarning = (message: string): string => {
  return `:warning: ${message}`;
};

// Format list of items
export const formatList = (items: string[], title?: string): string => {
  const listItems = items.map(item => `• ${item}`).join('\n');
  return title ? `*${title}*\n${listItems}` : listItems;
};

// Format HubSpot contact
export const formatContact = (contact: {
  firstName?: string;
  lastName?: string;
  email?: string;
  company?: string;
  title?: string;
}): string => {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown';
  const details: string[] = [];

  if (contact.title) details.push(contact.title);
  if (contact.company) details.push(contact.company);
  if (contact.email) details.push(contact.email);

  return formatEntity('contact', name, details.join(' | '));
};

// Format HubSpot deal
export const formatDeal = (deal: {
  name: string;
  stage: string;
  amount?: number;
  closeDate?: string;
}): string => {
  const details: string[] = [deal.stage];

  if (deal.amount) {
    details.push(`$${deal.amount.toLocaleString()}`);
  }
  if (deal.closeDate) {
    details.push(`Close: ${deal.closeDate}`);
  }

  return formatEntity('deal', deal.name, details.join(' | '));
};

// Format HubSpot task
export const formatTask = (task: {
  subject: string;
  status: string;
  dueDate?: string;
  priority?: string;
}): string => {
  const details: string[] = [task.status];

  if (task.dueDate) {
    details.push(`Due: ${task.dueDate}`);
  }
  if (task.priority) {
    details.push(task.priority);
  }

  return formatEntity('task', task.subject, details.join(' | '));
};

// Strip bot mention from message
export const stripBotMention = (text: string, botUserId?: string): string => {
  if (!text) return '';

  // Remove <@USERID> mentions
  let cleaned = text.replace(/<@[A-Z0-9]+>/g, '').trim();

  // Remove multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ');

  return cleaned;
};

// Parse Slack user ID from mention
export const parseUserMention = (text: string): string | null => {
  const match = text.match(/<@([A-Z0-9]+)>/);
  return match ? match[1] : null;
};

// Format relative time (e.g., "2 hours ago")
export const formatRelativeTime = (date: Date | string): string => {
  const now = new Date();
  const then = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return then.toLocaleDateString();
};

// Truncate text with ellipsis
export const truncate = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
};

// Build thread key for context tracking
export const buildThreadKey = (channelId: string, threadTs?: string): string => {
  return threadTs ? `${channelId}:${threadTs}` : channelId;
};
