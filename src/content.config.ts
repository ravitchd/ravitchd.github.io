import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    tech: z.array(z.string()).default([]),
    repo: z.string().url().optional(),
    demo: z.string().url().optional(),
    date: z.coerce.date(),
    featured: z.boolean().default(false),
  }),
});

// Recipes: one Markdown file per recipe, all structured in the frontmatter so
// a tool (like a future Instagram-to-recipe importer) can write them. See _template.md.
const group = z.object({ title: z.string().optional(), items: z.array(z.string()) });
// Accept either a plain list or titled groups ("For the topping"), always store groups.
const groupList = z.union([
  z.array(z.string()).transform((items) => (items.length ? [{ items }] : [])),
  z.array(group),
]);
const groups = groupList.default([]);

const recipes = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/recipes' }),
  schema: z.object({
    title: z.string(),
    category: z.enum(['savory', 'sweet', 'bread', 'technique']),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    prepTime: z.string().optional(),
    cookTime: z.string().optional(),
    servings: z.number().optional(),
    makes: z.string().optional(),
    source: z.string().url().optional(),
    date: z.coerce.date(),
    ingredients: groups,
    steps: groups,
    notes: z.array(z.string()).default([]),
    // Alternate batches of the same recipe (half batch, 24 eggs...). Each one
    // replaces the top-level ingredients and/or steps it lists.
    versions: z
      .array(z.object({ label: z.string(), makes: z.string().optional(), ingredients: groupList.optional(), steps: groupList.optional() }))
      .default([]),
  }),
});

// Food gallery: one Markdown file per dish, photo in ./images. See _template.md.
const gallery = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/gallery' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      caption: z.string(),
      image: image(),
      alt: z.string(),
      tags: z.array(z.string()).default([]),
      order: z.number().default(100),
      recipe: reference('recipes').optional(),
    }),
});

export const collections = { projects, recipes, gallery };
