# ravitchd.github.io

Personal website: resume, projects and recipes. Built with [Astro](https://astro.build) and deployed to GitHub Pages on every push to `main`.

## Editing

- **Name, tagline, links:** `src/site.ts`
- **Add a project:** add a Markdown file to `src/content/projects/` (copy `personal-website.md`)
- **Add a recipe:** add a Markdown file to `src/content/recipes/` (copy `example-recipe.md`)
- **Colors and fonts:** `src/styles/global.css`

## Local development

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs to dist/
```
