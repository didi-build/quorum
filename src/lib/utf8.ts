/** Truncate a string to at most `maxBytes` UTF-8 bytes without splitting a code point. */
export function truncateUtf8ToMaxBytes(value: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength <= maxBytes) {
    return value;
  }
  let end = maxBytes;
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) {
    end -= 1;
  }
  return new TextDecoder().decode(bytes.slice(0, end));
}
