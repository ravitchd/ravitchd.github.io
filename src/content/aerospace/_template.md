---
# HOW TO ADD AN AEROSPACE PROJECT (a rocket, a flight computer, an ESP32 build...)
# 1. Copy this file, rename it (e.g. esp32-altimeter.md, no leading underscore), and fill it in.
#    Files that start with an underscore, like this one, are ignored.
# 2. Pick how it's shown (all optional, use whichever you have):
#    - a 3D model: put an .stl in public/aerospace/ and set model (Z up, in mm)
#    - a photo: put it in src/content/aerospace/images/ and set image and alt
#    - neither: the card shows the category and tools instead
# 3. Delete any lines you don't need.
title: Name of the project
summary: One sentence about what it is and what it does.
category: Electronics           # short label on the card: Rocketry, Electronics, Avionics...
# model: /aerospace/my-part.stl
# image: ./images/my-project.jpg
# alt: What the photo shows
tools: [ESP32, C++, PlatformIO] # hardware, languages and software you used
links:                          # buttons to code, videos, docs...
  - { label: Code on GitHub, href: https://github.com/ravitchd/my-project }
files:                          # downloads (STEP, STL, wiring diagram PDF...)
  - { label: STEP, href: /aerospace/my-part.step }
# project: my-project           # optional: id of a write-up in src/content/projects to link to
tags: [esp32, sensors]
date: 2026-10-11
order: 30                       # lower numbers show first
---

Write-up goes here: what you built, how it works, what you learned. Markdown works,
including images: ![Wiring](./images/my-project-wiring.jpg)
