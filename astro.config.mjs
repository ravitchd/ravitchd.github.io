import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://ravitchd.github.io',
  // Keep old links working: the rockets moved from the CAD page to Aerospace,
  // and the personal website is no longer listed as a project.
  redirects: {
    '/prints/rocket-airframe': '/aerospace/spaceport-america-cup-rocket/',
    '/prints/test-rocket': '/aerospace/test-rocket/',
    '/projects/personal-website': '/projects/',
  },
});
