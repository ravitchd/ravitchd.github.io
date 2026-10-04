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

const recipes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/recipes' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    tags: z.array(z.string()).default([]),
    prepTime: z.string().optional(),
    cookTime: z.string().optional(),
    servings: z.number().optional(),
    date: z.coerce.date(),
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
