import apiClient from './apiClient';
import { User } from '../types/auth.types';

export const userService = {
  getAllUsers: async (): Promise<User[]> => {
    const response = await apiClient.get('/api/users');
    return response.data.data.users;
  }
};