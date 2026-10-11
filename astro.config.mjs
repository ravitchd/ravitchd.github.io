import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://ravitchd.github.io',
  // The rockets moved from the CAD page to Aerospace; keep their old links working.
  redirects: {
    '/prints/rocket-airframe': '/aerospace/spaceport-america-cup-rocket/',
    '/prints/test-rocket': '/aerospace/test-rocket/',
  },
});
