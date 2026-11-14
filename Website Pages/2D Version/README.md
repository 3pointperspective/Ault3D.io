# 2D Version: how the folders become the website

Each **folder** in here is one **project page**. The site is built from these files, so updating the site means adding or changing files here.

```
2D Version/
  _about.md                     ← your name, email, socials and About text
  Product Visualization/        ← one project (the folder name doesn't matter much; see "title")
    project.md                  ← title, year, role, tools, links + intro text
    cover.png                   ← thumbnail on the home page (optional, else the first image is used)
    captions.txt                ← captions for the loose images in this folder (optional)
    01-hero.png                 ← a loose image = full width
    02-process.md               ← a text section
    03-renders/                 ← a subfolder = one masonry section
      _section.md               ←   optional heading + intro for the section
      captions.txt              ←   optional captions for this section
      01-front.png
      02-detail-knob.png
    04-walkthrough.txt          ← a YouTube/Vimeo link = embedded video player
    05-closeups/                ← another masonry section
    06-turntable.mp4            ← a short video file = silent looping clip
```

## Order
- **Inside a project**, things appear in the order of their names, so start names with numbers: `01-`, `02-`, `03-`…
  Numbers are only for sorting and never shown. Use `10-`, `20-`, `30-` if you want room to slot things in later.
- **Projects on the home page** are ordered by `order:` in `project.md` (1 = first). Without it, a number at the start of the folder name is used (`01-Grim Bliss`).

## project.md
```
---
title: Grim Bliss
year: 2026
order: 1
status: wip              ← shows a "WIP" badge; leave empty for finished work
role: Solo developer, 3D, design
tools: Blender, Unity
studio: (optional)
summary: One line used when the page is shared on social media
steam: https://store.steampowered.com/app/...
itch: https://...
youtube: https://...
website: https://...
hidden: false            ← true hides the project without deleting it
---
Intro text under the title. Empty line = new paragraph.
**bold**, *italic*, [link text](https://example.com)
```
Empty fields are simply ignored. Each link field becomes a button (Steam gets a Steam-coloured one).

## Captions
`captions.txt` in the same folder as the images, one line per image:
```
01-front: Front view, studio lighting
02-detail-knob.png: Volume knob, knurled aluminium
```
Captions show under the image and in the zoomed-in view.

## Text sections (.md)
Any `.md` file becomes a text block in its place in the order. Optional heading via `title:`:
```
---
title: Process
---
Paragraph one.

Paragraph two.
```

## Videos
- **Long videos** go on YouTube (unlisted is fine) or Vimeo. Put the link in a `.txt` file, first line; optional caption on the second line.
- **Short loops/turntables** can be `.mp4` or `.webm` files placed directly; they play silently on loop. Keep each file **under 25 MB**.

## Images
PNG, JPG, GIF, WebP or AVIF. For fast loading, export at most ~2400 px on the long edge and prefer JPG/WebP for renders (PNG only when you need transparency). Each file must be under 25 MB.

## Ignored files
Anything starting with `_` or `.` is not shown (except `_section.md` and `_about.md`, which are settings). Use this for drafts: `_wip-render.png`.
