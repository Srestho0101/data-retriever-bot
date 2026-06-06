// API base URL for the FastAPI backend.
// In development: "" (relative path, goes through the Replit proxy)
// In production:  "https://your-backend-url.railway.app" or "https://your-backend.onrender.com"
//
// Set VITE_API_BASE_URL in your environment or a .env file:
//   VITE_API_BASE_URL=https://your-backend.onrender.com

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

function apiUrl(path: string): string {
  return API_BASE_URL + path;
}

export { apiUrl };
