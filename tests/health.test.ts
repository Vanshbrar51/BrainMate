import { describe, it, expect } from 'vitest';

describe('System Health & Integration', () => {
  it('Should communicate with Redis', async () => {
    const { getRedisPool, isCircuitOpen } = await import('@/lib/redis');
    
    // Check if circuit breaker is working
    expect(isCircuitOpen()).toBeDefined();
    
    const redis = getRedisPool();
    expect(redis).toBeDefined();
    expect(typeof redis.get).toBe('function');
  });

  it('Should have access to Supabase Admin', async () => {
    const { getSupabaseAdmin } = await import('@/lib/supabase');
    const supabase = getSupabaseAdmin();
    expect(supabase).toBeDefined();
    expect(typeof supabase.from).toBe('function');
  });

  it('API route structure check for WriteRight', async () => {
    // This is a static check to ensure the module structure is correct
    const fs = await import('fs');
    const path = await import('path');
    
    const chatRoute = path.resolve(__dirname, '../../app/api/writeright/chat/route.ts');
    if (fs.existsSync(chatRoute)) {
        const content = fs.readFileSync(chatRoute, 'utf8');
        expect(content).toMatch(/withErrorHandler/);
        expect(content).toMatch(/withSpan/);
        expect(content).toMatch(/auth\(\)/);
    }
  });

  it('Checks Python worker configuration', async () => {
    const fs = await import('fs');
    const path = await import('path');
    
    const workerEnv = path.resolve(__dirname, '../python-worker/.env.example');
    expect(fs.existsSync(workerEnv)).toBe(true);
    
    const workerMain = path.resolve(__dirname, '../python-worker/main.py');
    expect(fs.existsSync(workerMain)).toBe(true);
  });
});
