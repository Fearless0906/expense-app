import { API_URL } from './api';

/** Full URL of an uploaded file (e.g. a profile photo) from its media path, or undefined. */
export function mediaUrl(path: string | null | undefined): string | undefined {
  return path ? `${API_URL}/media/${path}` : undefined;
}
