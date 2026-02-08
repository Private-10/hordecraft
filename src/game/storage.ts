/**
 * Encrypted localStorage wrapper
 * Simple XOR + base64 obfuscation to prevent casual tampering
 */

const STORAGE_KEY_PREFIX = "hc_";
const CIPHER_KEY = "H0rd3Cr4ft_2026!xK9mP";

function xorCipher(text: string, key: string): string {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

function toBase64(str: string): string {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch {
    return btoa(str);
  }
}

function fromBase64(b64: string): string {
  try {
    return decodeURIComponent(escape(atob(b64)));
  } catch {
    return atob(b64);
  }
}

export function secureSet(key: string, value: string): void {
  try {
    const encrypted = toBase64(xorCipher(value, CIPHER_KEY));
    localStorage.setItem(STORAGE_KEY_PREFIX + key, encrypted);
  } catch {}
}

export function secureGet(key: string): string | null {
  try {
    // Try encrypted first
    const encrypted = localStorage.getItem(STORAGE_KEY_PREFIX + key);
    if (encrypted) {
      return xorCipher(fromBase64(encrypted), CIPHER_KEY);
    }
    // Fallback: try old unencrypted key for migration
    const plain = localStorage.getItem(key);
    if (plain) {
      // Migrate to encrypted
      secureSet(key, plain);
      localStorage.removeItem(key);
      return plain;
    }
    return null;
  } catch {
    return null;
  }
}

export function secureRemove(key: string): void {
  try {
    localStorage.removeItem(STORAGE_KEY_PREFIX + key);
    localStorage.removeItem(key); // also remove old unencrypted
  } catch {}
}
