import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'checkers.solutions'

const axiosInstance = axios.create({
  baseURL: `https://${BASE_URL}`,
});

axiosInstance.interceptors.request.use(async function (config) {
  let token = await AsyncStorage.getItem('authToken');
  token = token ? JSON.parse(token) : '';

  config.headers.Authorization = `${token}`;
  if (!config.headers['Content-Type']) {
    config.headers['Content-Type'] = 'application/json';
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.data?.message) {
      error.message = error.response.data.message;
    }
    return Promise.reject(error);
  }
);

export const webSocketBaseURL = BASE_URL
export default axiosInstance;