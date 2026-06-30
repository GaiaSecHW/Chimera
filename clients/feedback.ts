import { API_BASE, getHeaders, handleResponse } from './base';

const PREFIX = '/api/chirmera-platform-feedback';

export interface FeedbackItem {
  id: string;
  content: string;
  replyContent: string | null;
  replyAt: string | null;
  replyReadAt: string | null;
  createdAt: string;
  createdBy: string;
}

export interface FeedbackPage {
  records: FeedbackItem[];
  total: number;
  size: number;
  current: number;
  pages: number;
}

export const feedbackApi = {
  submit: async (content: string): Promise<{ code: number; message: string }> => {
    const res = await fetch(`${API_BASE}${PREFIX}/feedbacks`, {
      method: 'POST',
      headers: { ...getHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    return handleResponse(res);
  },

  listMine: async (pageNum = 1, pageSize = 10): Promise<FeedbackPage> => {
    const res = await fetch(
      `${API_BASE}${PREFIX}/feedbacks/my?pageNum=${pageNum}&pageSize=${pageSize}`,
      { headers: getHeaders() }
    );
    const result = await handleResponse(res);
    return result.data;
  },

  countUnread: async (): Promise<number> => {
    const res = await fetch(`${API_BASE}${PREFIX}/feedbacks/my/count`, {
      headers: getHeaders(),
    });
    const result = await handleResponse(res);
    return result.data;
  },

  markRead: async (id: string): Promise<void> => {
    const res = await fetch(`${API_BASE}${PREFIX}/feedbacks/${id}/read`, {
      method: 'PATCH',
      headers: getHeaders(),
    });
    await handleResponse(res);
  },

  getDetail: async (id: string): Promise<FeedbackItem> => {
    const res = await fetch(`${API_BASE}${PREFIX}/feedbacks/${id}`, {
      headers: getHeaders(),
    });
    const result = await handleResponse(res);
    return result.data;
  },

  delete: async (id: string): Promise<void> => {
    const res = await fetch(`${API_BASE}${PREFIX}/feedbacks/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    await handleResponse(res);
  },

  listAll: async (pageNum = 1, pageSize = 10): Promise<FeedbackPage> => {
    const res = await fetch(
      `${API_BASE}${PREFIX}/feedbacks?pageNum=${pageNum}&pageSize=${pageSize}`,
      { headers: getHeaders() }
    );
    const result = await handleResponse(res);
    return result.data;
  },

  reply: async (id: string, replyContent: string): Promise<void> => {
    const res = await fetch(`${API_BASE}${PREFIX}/feedbacks/${id}/reply`, {
      method: 'PUT',
      headers: { ...getHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ replyContent }),
    });
    await handleResponse(res);
  },
};
