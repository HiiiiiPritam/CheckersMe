import api from './api';

export const groupService = {
  getGroupDetails: async (groupId) => {
    const response = await api.get(`/api/groups/${groupId}`);
    return response.data;
  },
  
  getUsersForGroupManagement: async (groupId) => {
    const response = await api.get(`/api/groups/${groupId}/users`);
    return response.data;
  },
  
  removeGroupMembers: async (groupId, memberIdsToRemove) => {
    const response = await api.delete(`/api/groups/${groupId}/members`, {
      data: { memberIdsToRemove }
    });
    return response.data;
  },
  
  updateGroup: async (groupId, updates) => {
    const response = await api.put(`/api/groups/${groupId}`, updates);
    return response.data;
  }
};