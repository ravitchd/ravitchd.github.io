---
# HOW TO ADD A DISH TO THE GALLERY
# 1. Put the photo in src/content/gallery/images/ (any size; the site makes web versions).
# 2. Copy this file, rename it (e.g. my-dish.md, no leading underscore), and fill it in.
# Files that start with an underscore, like this one, are ignored.
title: Name of the dish
caption: One sentence about it.
image: ./images/my-dish.jpg
alt: What the photo shows, for screen readers.
tags: [pizza]          # shown with the dish; 'pizza' also counts towards Pizza nights
order: 10              # lower numbers show first (optional)
# recipe: my-recipe    # optional: id of a recipe in src/content/recipes to link to
---
