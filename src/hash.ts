import { createHash } from 'node:crypto';

export const sha256 = (s: string): string => {
  const hash = createHash('sha256');
  hash.update(s, 'utf-8');
  return hash.digest('base64');
};
