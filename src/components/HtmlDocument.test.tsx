import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import HtmlDocument from './HtmlDocument';

describe('HtmlDocument', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders iframe with safe sandbox attributes (allow-scripts and NO allow-same-origin)', () => {
    render(<HtmlDocument value="<h1>Hello World</h1>" />);

    const iframe = screen.getByTitle('Nội dung HTML') as HTMLIFrameElement;
    expect(iframe).toBeDefined();

    const sandbox = iframe.getAttribute('sandbox') || '';
    expect(sandbox).toContain('allow-scripts');
    expect(sandbox).toContain('allow-forms');
    expect(sandbox).toContain('allow-modals');
    expect(sandbox).toContain('allow-popups');

    // Không bao giờ chứa allow-same-origin khi đã có allow-scripts (tránh XSS / thoát sandbox)
    expect(sandbox).not.toContain('allow-same-origin');
  });

  it('injects head preparation script (storage polyfill + safe links) and resize reporting script into srcDoc', () => {
    const rawHtml = '<!DOCTYPE html><html><head><title>Test</title></head><body><p>Test</p></body></html>';
    render(<HtmlDocument value={rawHtml} />);

    const iframe = screen.getByTitle('Nội dung HTML') as HTMLIFrameElement;
    const srcDoc = iframe.getAttribute('srcDoc') || '';

    expect(srcDoc).toContain('<p>Test</p>');
    // Head script
    expect(srcDoc).toContain('localStorage');
    expect(srcDoc).toContain('noopener noreferrer');
    // Body script
    expect(srcDoc).toContain('docs-html-frame-resize');
    expect(srcDoc).toContain('window.parent.postMessage');
  });

  it('updates height when postMessage is received from the iframe', () => {
    render(<HtmlDocument value="<div>Content</div>" />);

    const iframe = screen.getByTitle('Nội dung HTML') as HTMLIFrameElement;
    expect(iframe.style.height).toBe('200px');

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'docs-html-frame-resize', height: 450 },
          source: iframe.contentWindow,
        }),
      );
    });

    expect(iframe.style.height).toBe('450px');
  });

  it('ignores postMessage with wrong type or foreign source', () => {
    render(<HtmlDocument value="<div>Content</div>" />);

    const iframe = screen.getByTitle('Nội dung HTML') as HTMLIFrameElement;
    expect(iframe.style.height).toBe('200px');

    act(() => {
      // Wrong type
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'other-message', height: 999 },
          source: iframe.contentWindow,
        }),
      );
      // Foreign source
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'docs-html-frame-resize', height: 999 },
          source: window,
        }),
      );
    });

    expect(iframe.style.height).toBe('200px');
  });
});
