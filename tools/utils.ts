/**
 * Utility functions file
*/

import { Request } from "express";

function hasNonLatinChars(str: string): boolean {
  return /[^\x00-\x7F]/.test(str);
}

export function checkStringValidity(str: any): {valid: boolean; error?: string} {
    if (typeof str !== 'string') {
        return {valid: false, error: "Name must be a valid string"};
    }
    if (str.trim().length === 0) {
        return {valid: false, error: "Name cannot be empty"};
    }
    if (hasNonLatinChars(str)) {
        return {valid: false, error: "Name cannot have weird characters"};   
    }
    return {valid: true};
}

// Helper function to get real client IP address
export function getClientIP(req: any): string {
  if (!req) return 'unknown';

  // Helper for req.get (Express) vs req.headers (raw Node)
  const getHeader = (name: string): string | string[] | undefined => {
    if (typeof req.get === 'function') return req.get(name);
    if (req.headers) return req.headers[name];
    return undefined;
  };

  const cfConnectingIP = getHeader('cf-connecting-ip');
  const forwardedFor = getHeader('x-forwarded-for');
  const realIP = getHeader('x-real-ip');
  const clientIP = getHeader('x-client-ip');
  
  if (cfConnectingIP && typeof cfConnectingIP === 'string') return cfConnectingIP;
  
  if (forwardedFor) {
    if (typeof forwardedFor === 'string') {
      return forwardedFor.split(',')[0].trim();
    } else if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
      return forwardedFor[0].split(',')[0].trim();
    }
  }
  
  if (realIP && typeof realIP === 'string') return realIP;
  if (clientIP && typeof clientIP === 'string') return clientIP;
  
  return (req as any).ip || (req.socket?.remoteAddress) || 'unknown';
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function countInputTokens(messages: any[]): number {
  if (!Array.isArray(messages)) return 0;
  const messageText = JSON.stringify(messages);
  return estimateTokens(messageText);
}

