---
# HOW TO ADD A 3D PRINT
# 1. Put the model file in public/prints/ (an .stl, exported from CAD or your slicer).
# 2. Copy this file, rename it (e.g. phone-stand.md, no leading underscore), and fill it in.
# Files that start with an underscore, like this one, are ignored.
title: Name of the part
summary: One sentence about what it is and why you made it.
model: /prints/my-part.stl     # shown in the 3D viewer (Z up, in mm)
files:                         # downloads (the .stl, a STEP file, a 3MF...)
  - { label: STL, href: /prints/my-part.stl }
printer: Bambu Lab P1S         # all of the print settings below are optional
material: PETG
layerHeight: 0.2               # mm
infill: 20% gyroid
printTime: 2 h 10 min
filament: 38 g
# project: my-project         # optional: id of a write-up in src/content/projects to link to
tags: [functional]
date: 2026-10-08
order: 10                      # lower numbers show first
---

Write-up goes here: the problem, how you designed it, what you changed after the first print.
