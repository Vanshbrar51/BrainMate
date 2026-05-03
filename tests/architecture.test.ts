import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const APP_DIR = path.resolve(__dirname, '../app');
const COMPONENTS_DIR = path.resolve(__dirname, '../components');

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    if (fs.statSync(dirPath + '/' + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + '/' + file, arrayOfFiles);
    } else {
      arrayOfFiles.push(path.join(dirPath, '/', file));
    }
  });

  return arrayOfFiles;
}

describe('Architecture Compliance', () => {
  it('API routes must contain auth() check', () => {
    const apiFiles = getAllFiles(path.join(APP_DIR, 'api')).filter(f => f.endsWith('route.ts'));
    
    apiFiles.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      // Skip auth() check for public routes if any (but rules say every API route must start with it)
      expect(content).toMatch(/await auth\(\)/);
    });
  });

  it('API routes must use withErrorHandler', () => {
    const apiFiles = getAllFiles(path.join(APP_DIR, 'api')).filter(f => f.endsWith('route.ts'));
    
    apiFiles.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).toMatch(/withErrorHandler/);
    });
  });

  it('Module pages must have data-module attribute', () => {
    const dashboardDir = path.join(APP_DIR, 'dashboard');
    if (fs.existsSync(dashboardDir)) {
        const pageFiles = getAllFiles(dashboardDir).filter(f => f.endsWith('page.tsx'));
        
        pageFiles.forEach(file => {
          const content = fs.readFileSync(file, 'utf8');
          // All modules root div must have data-module
          if (content.includes('chat-workspace')) {
            expect(content).toMatch(/data-module=/);
          }
        });
    }
  });

  it('Should not use console.log in production code', () => {
    const srcFiles = [
        ...getAllFiles(APP_DIR),
        ...getAllFiles(path.join(__dirname, '../lib'))
    ].filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));

    const allowedFiles = [
        'lib/writeright-logger.ts',
        'lib/opentelemetry.ts',
        'instrumentation.ts',
        'lib/secrets.ts',
        'proxy.ts'
    ];

    srcFiles.forEach(file => {
      const relativePath = path.relative(path.join(__dirname, '..'), file);
      if (allowedFiles.some(allowed => relativePath.includes(allowed))) return;

      const content = fs.readFileSync(file, 'utf8');
      expect(content).not.toMatch(/console\.log/);
    });
  });
});
