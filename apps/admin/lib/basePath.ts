export const BASE_PATH = '/admin';

export function withBasePath(path: string): string {
  if (!path.startsWith('/')) return `${BASE_PATH}/${path}`;
  return path === '/' ? BASE_PATH : `${BASE_PATH}${path}`;
}
