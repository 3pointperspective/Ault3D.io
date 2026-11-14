# ault3d.io

Portfolio website of Aidan Ault, 3D Generalist.

| Folder | What it is |
|---|---|
| `Website Pages/2D Version/` | Content for the gallery site: one folder per project. See the README inside. |
| `Website Pages/3D Version/` | Blender scenes and exports for the 3D tour (coming). |
| `site/` | The code that turns the content into the website. |
| `dist/` | The built website (generated, not stored in git). |

## Preview on your computer
Needs [Node.js](https://nodejs.org) (LTS). In this folder:

```
npm run dev
```
Then open http://localhost:4321. It rebuilds whenever you change a file.

## Publishing
Hosted on Cloudflare Pages, connected to this GitHub repo:
- Build command: `npm run build`
- Output directory: `dist`

Every push to `main` goes live on ault3d.io within a minute or two.
