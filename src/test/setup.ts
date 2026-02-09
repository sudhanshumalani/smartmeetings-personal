import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { webcrypto } from 'node:crypto';

// Polyfill Web Crypto API for happy-dom test environment
if (!globalThis.crypto?.subtle) {
  globalThis.crypto = webcrypto as unknown as Crypto;
}
