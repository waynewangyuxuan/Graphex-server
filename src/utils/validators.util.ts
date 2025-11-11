/**
 * Validation Utility Functions
 */

import { FILE_UPLOAD } from '../config/constants';

/**
 * Validate file MIME type
 */
export const isValidMimeType = (mimetype: string): boolean => {
  const allowedTypes = FILE_UPLOAD.ALLOWED_MIME_TYPES as readonly string[];
  return allowedTypes.includes(mimetype);
};

/**
 * Validate file size
 */
export const isValidFileSize = (size: number): boolean => {
  return size <= FILE_UPLOAD.MAX_SIZE;
};

/**
 * Validate URL format
 */
export const isValidUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    // Block localhost and internal IPs
    const hostname = urlObj.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname.startsWith('127.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.16.')
    ) {
      return false;
    }
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Validate UUID format
 */
export const isValidUuid = (uuid: string): boolean => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};
