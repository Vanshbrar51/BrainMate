import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Next.js headers/auth
vi.mock('next/headers', () => ({
  headers: () => new Map(),
  cookies: () => new Map(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(() => Promise.resolve({ userId: 'test-user-id' })),
}));

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => Promise.resolve({ data: [], error: null })),
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
  })),
}));

// Mock Redis
vi.mock('@/lib/redis', () => ({
  getRedisPool: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    setex: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
  })),
  isCircuitOpen: vi.fn(() => false),
  ns: vi.fn((...args) => args.join(':')),
}));
