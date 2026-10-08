---
# HOW TO ADD A RECIPE
# Copy this file, rename it (e.g. my-dish.md, no leading underscore), and fill it in.
# Files that start with an underscore, like this one, are ignored.
# If the dish is already listed under "Recipes on the way" (src/data/menu.ts),
# set its recipe: to this file's name so the list links here instead.
title: Name of the dish
category: savory          # savory, sweet, bread, or technique
date: 2026-10-08          # newest three show on the home page
# makes: 8 bagels         # optional
# source: https://...     # optional link to where it came from
ingredients:              # a plain list...
  - 1 cup something
  - 2 tbsp something else
# ...or titled groups:
# ingredients:
#   - title: For the topping
#     items: [1/4 cup sugar]
steps:
  - Do the first thing.
  - Do the second thing.
notes: []                 # optional tips shown under the steps
---
