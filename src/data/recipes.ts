import type { CollectionEntry } from 'astro:content';

type Recipe = CollectionEntry<'recipes'>;
type Group = { title?: string; items: string[] };

export const count = (groups: Group[]) => groups.reduce((n, g) => n + g.items.length, 0);

/** Each batch of a recipe with its own ingredients and steps (just one when there are no versions). */
export function batches(recipe: Recipe) {
  const { ingredients, steps, makes, versions } = recipe.data;
  if (!versions.length) return [{ label: '', makes, ingredients, steps }];
  return versions.map((v) => ({
    label: v.label,
    makes: v.makes ?? makes,
    ingredients: v.ingredients ?? ingredients,
    steps: v.steps ?? steps,
  }));
}

/** "13 ingredients · 11 steps", from the first batch. */
export function summary(recipe: Recipe) {
  const b = batches(recipe)[0];
  const parts = [];
  const i = count(b.ingredients);
  const s = count(b.steps);
  if (i) parts.push(`${i} ingredient${i === 1 ? '' : 's'}`);
  if (s) parts.push(`${s} step${s === 1 ? '' : 's'}`);
  if (recipe.data.versions.length > 1) parts.push(`${recipe.data.versions.length} batch sizes`);
  return parts.join(' · ');
}

export const CATEGORY_LABEL = { savory: 'Savory', sweet: 'Sweet', bread: 'Bread', technique: 'Technique' } as const;
