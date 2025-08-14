import axios from 'axios';

// Set baseURL from env so all relative /api calls go to the server
const serverUrl = import.meta.env.VITE_SERVER_URL;
if (serverUrl) {
  axios.defaults.baseURL = serverUrl;
}

// If a token already exists, attach it so first render is authenticated
const token = localStorage.getItem('token');
if (token) {
  axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}
