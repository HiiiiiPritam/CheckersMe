import apiClient from './apiClient';

export const groupService = {
  createGroup: async (name: string, initialMembers: string[] = [], franchiseIds: string[] = []) => {
    const response = await apiClient.post('/api/groups', { name, initialMembers, franchiseIds });
    return response.data.data;
  },

  getGroupDetails: async (groupId: string) => {
    const response = await apiClient.get(`/api/groups/${groupId}`);
    return response.data.data;
  },

  addMembers: async (groupId: string, newMemberIds: string[]) => {
    const response = await apiClient.post(`/api/groups/${groupId}/members`, { newMemberIds });
    return response.data.data;
  },

  updateGroup: async (groupId: string, updates: { name?: string; description?: string }) => {
    const response = await apiClient.put(`/api/groups/${groupId}`, updates);
    return response.data.data;
  },

  removeGroupMembers: async (groupId: string, memberIdsToRemove: string[]) => {
    const response = await apiClient.delete(`/api/groups/${groupId}/members`, {
      data: { memberIdsToRemove }
    });
    return response.data.data;
  }
};