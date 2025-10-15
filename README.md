# Content CMS v3

A full-stack web application for managing markdown-based posts in the `content/posts` directory. It provides an Obsidian-like editor with live preview, LaTeX rendering, GitHub-flavoured markdown styling, and file management tools for each post.

## Features

- **Post index**: browse, create, rename, and delete posts backed by the `content/posts` folders.
- **Automated scaffolding**: creating a post runs `website.fish post "<name>"` to generate the folder and timestamped `index.md`.
- **Dual-pane editor**: edit markdown using a CodeMirror-based editor with autosave and Prettier-backed auto-formatting on save.
- **Live preview**: GitHub-styled markdown rendering with LaTeX support via KaTeX and syntax highlighting via highlight.js.
- **File browser**: toggleable tree per post to upload, rename, delete files, and manage folders directly within the post directory.
- **Robust backend**: Express API ensures safe filesystem operations, runs the fish script, and formats markdown consistently with Prettier.

## Project structure

```
contentCMSv3/
├── content/                # Existing content repository (unchanged)
├── server/                 # Express backend serving the API and static build
└── web/                    # Vite + React frontend
```

## Getting started

### Prerequisites

- Node.js 18+
- Fish shell (already required by `website.fish`)

### Install dependencies

```fish
cd /home/zimengx/Code/contentCMSv3/server
npm install

cd /home/zimengx/Code/contentCMSv3/web
npm install
```

### Run in development

Open two terminals:

```fish
# Terminal 1 – backend
cd /home/zimengx/Code/contentCMSv3/server
npm run dev

# Terminal 2 – frontend (Vite dev server with API proxy)
cd /home/zimengx/Code/contentCMSv3/web
npm run dev
```

The app will be available at `http://localhost:5173` (or the next available port). API requests are proxied to `http://localhost:4000`.

### Build for production

```fish
cd /home/zimengx/Code/contentCMSv3/web
npm run build

cd /home/zimengx/Code/contentCMSv3/server
NODE_ENV=production npm start
```

The Express server will serve the static build from `web/dist` when it exists.

### Testing the editor

1. Browse posts on the homepage, create or manage folders.
2. Select a post to open the dual-pane editor.
3. Modify markdown — autosave runs after short pauses, or trigger manual save/Ctrl+S.
4. Toggle the file browser to upload assets, rename files, or organise content.

## API overview

- `GET /api/posts` — list post directories.
- `POST /api/posts` — create a post (runs `website.fish`).
- `PUT /api/posts/:slug` — rename a post directory.
- `DELETE /api/posts/:slug` — delete a post directory.
- `GET /api/posts/:slug/index` — read `index.md`.
- `PUT /api/posts/:slug/index` — format & save markdown.
- `GET /api/posts/:slug/files` — file tree for the post directory.
- `POST /api/posts/:slug/files/upload` — upload files (supports multiple files per request).
- `POST /api/posts/:slug/files/create-folder` — create folders.
- `PUT /api/posts/:slug/files/rename` — rename/move files or folders.
- `DELETE /api/posts/:slug/files` — delete files or folders.

All filesystem operations validate paths to prevent traversal and return helpful error messages.

## Notes

- Auto-formatting relies on Prettier’s markdown parser. If you want custom formatting rules, add a `.prettierrc` file.
- The file browser prevents path traversal and shows quick feedback for errors.
- If `index.md` is missing, the editor lets you create it with the next save.

Enjoy your streamlined content workflow!
