import { describe, expect, it } from 'vitest';

if (typeof globalThis.document === 'undefined') {
  const dummyEl = {
    replaceChildren: () => {},
    setAttribute: () => {},
    removeAttribute: () => {},
    appendChild: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    innerHTML: ''
  };
  (globalThis as any).document = {
    getElementById: () => dummyEl,
    createElement: () => dummyEl,
    fonts: { ready: Promise.resolve() }
  };
  (globalThis as any).window = {
    addEventListener: () => {},
    location: { hash: '#/' },
    matchMedia: () => ({ matches: false, addEventListener: () => {} })
  };
}

describe('All Pages Export createPage', () => {
  it('should export createPage for all pages', async () => {
    const titlePage = await import('../src/pages/title');
    expect(typeof titlePage.createPage).toBe('function');
    const mapPage = await import('../src/pages/map');
    expect(typeof mapPage.createPage).toBe('function');
    const passportPage = await import('../src/pages/passport');
    expect(typeof passportPage.createPage).toBe('function');
    const missionAsiaPage = await import('../src/pages/missionAsia');
    expect(typeof missionAsiaPage.createPage).toBe('function');
    const missionEuropePage = await import('../src/pages/missionEurope');
    expect(typeof missionEuropePage.createPage).toBe('function');
    const missionAfricaPage = await import('../src/pages/missionAfrica');
    expect(typeof missionAfricaPage.createPage).toBe('function');
    const missionAmericasPage = await import('../src/pages/missionAmericas');
    expect(typeof missionAmericasPage.createPage).toBe('function');
    const missionOceaniaPage = await import('../src/pages/missionOceania');
    expect(typeof missionOceaniaPage.createPage).toBe('function');
    const missionDialoguePage = await import('../src/pages/missionDialogue');
    expect(typeof missionDialoguePage.createPage).toBe('function');
    const completionPage = await import('../src/pages/completion');
    expect(typeof completionPage.createPage).toBe('function');
  });
});
