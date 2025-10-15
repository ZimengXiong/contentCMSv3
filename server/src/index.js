const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs/promises');
const fse = require('fs-extra');
const multer = require('multer');
const prettier = require('prettier');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 4000;
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50MB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_SIZE } });

const CONTENT_ROOT = path.resolve(__dirname, '../../content');
const POSTS_DIR = path.join(CONTENT_ROOT, 'posts');
const WEBSITE_SCRIPT = path.join(CONTENT_ROOT, 'website.fish');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

app.use('/media/posts', express.static(POSTS_DIR));

function assertValidName(name) {
  if (!name || typeof name !== 'string') {
    const error = new Error('Name is required');
    error.status = 400;
    throw error;
  }
  if (name.includes('/') || name.includes('..')) {
    const error = new Error('Invalid name');
    error.status = 400;
    throw error;
  }
}

function resolvePostDir(slug) {
  const joined = path.join(POSTS_DIR, slug);
  const normalized = path.normalize(joined);
  if (!normalized.startsWith(POSTS_DIR)) {
    const error = new Error('Invalid post path');
    error.status = 400;
    throw error;
  }
  return normalized;
}

function resolveWithin(baseDir, targetPath = '') {
  const joined = path.join(baseDir, targetPath);
  const normalized = path.normalize(joined);
  if (!normalized.startsWith(baseDir)) {
    const error = new Error('Path traversal is not allowed');
    error.status = 400;
    throw error;
  }
  return normalized;
}

async function directoryTree(currentDir, baseDir) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const items = await Promise.all(
    entries
      .filter((entry) => entry.name !== '.DS_Store')
      .map(async (entry) => {
        const fullPath = path.join(currentDir, entry.name);
        const relPath = path.relative(baseDir, fullPath).split(path.sep).join('/');
        if (entry.isDirectory()) {
          const children = await directoryTree(fullPath, baseDir);
          return { type: 'directory', name: entry.name, path: relPath, children };
        }
        const stats = await fs.stat(fullPath);
        return { type: 'file', name: entry.name, path: relPath, size: stats.size, modifiedAt: stats.mtime }; 
      })
  );

  return items.sort((a, b) => {
    if (a.type === b.type) {
      return a.name.localeCompare(b.name);
    }
    return a.type === 'directory' ? -1 : 1;
  });
}

async function ensureContentStructure() {
  const exists = await fse.pathExists(POSTS_DIR);
  if (!exists) {
    throw new Error('Posts directory not found. Expected at ' + POSTS_DIR);
  }
  const scriptExists = await fse.pathExists(WEBSITE_SCRIPT);
  if (!scriptExists) {
    throw new Error('website.fish script not found. Expected at ' + WEBSITE_SCRIPT);
  }
}

async function ensurePostDirectory(dirPath) {
  const exists = await fse.pathExists(dirPath);
  if (!exists) {
    const error = new Error('Post not found');
    error.status = 404;
    throw error;
  }
}

function runWebsiteScript(name) {
  return new Promise((resolve, reject) => {
    const child = spawn('fish', [WEBSITE_SCRIPT, 'post', name], { cwd: CONTENT_ROOT });
    let stderr = '';
    let stdout = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        const error = new Error(stderr || 'Failed to create post');
        error.status = 500;
        reject(error);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

app.get('/api/posts', async (req, res, next) => {
  try {
    await ensureContentStructure();
    const entries = await fs.readdir(POSTS_DIR, { withFileTypes: true });
    const posts = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const dirPath = path.join(POSTS_DIR, entry.name);
          const indexPath = path.join(dirPath, 'index.md');
          const stats = await fs.stat(dirPath);
          const indexStats = await fs.stat(indexPath).catch(() => null);
          return {
            name: entry.name,
            slug: entry.name,
            hasIndex: Boolean(indexStats),
            modifiedAt: (indexStats || stats).mtime,
          };
        })
    );

    posts.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
    res.json({ posts });
  } catch (error) {
    next(error);
  }
});

app.post('/api/posts', async (req, res, next) => {
  try {
    const { name } = req.body;
    assertValidName(name);
    const targetDir = path.join(POSTS_DIR, name);
    const exists = await fse.pathExists(targetDir);
    if (exists) {
      const error = new Error('A post with this name already exists');
      error.status = 409;
      throw error;
    }
    await ensureContentStructure();
    await runWebsiteScript(name);
    res.status(201).json({ message: 'Post created', name });
  } catch (error) {
    next(error);
  }
});

app.put('/api/posts/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { name: newName } = req.body;
    assertValidName(newName);
    const currentDir = resolvePostDir(slug);
    await ensurePostDirectory(currentDir);
    const newDir = path.join(POSTS_DIR, newName);
    const exists = await fse.pathExists(newDir);
    if (exists) {
      const error = new Error('A post with the new name already exists');
      error.status = 409;
      throw error;
    }
    await fse.rename(currentDir, newDir);
    res.json({ message: 'Post renamed', name: newName });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/posts/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const targetDir = resolvePostDir(slug);
    await ensurePostDirectory(targetDir);
    await fse.remove(targetDir);
    res.json({ message: 'Post deleted' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/posts/:slug/index', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const postDir = resolvePostDir(slug);
  await ensurePostDirectory(postDir);
    const indexPath = path.join(postDir, 'index.md');
    const exists = await fse.pathExists(indexPath);
    if (!exists) {
      const error = new Error('index.md not found');
      error.status = 404;
      throw error;
    }
    const content = await fs.readFile(indexPath, 'utf8');
    res.json({ content });
  } catch (error) {
    next(error);
  }
});

app.put('/api/posts/:slug/index', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { content } = req.body;
    if (typeof content !== 'string') {
      const error = new Error('Content must be a string');
      error.status = 400;
      throw error;
    }
    const postDir = resolvePostDir(slug);
    await ensurePostDirectory(postDir);
    const indexPath = path.join(postDir, 'index.md');
    const formatted = await prettier.format(content, { parser: 'markdown' });
    await fs.writeFile(indexPath, formatted, 'utf8');
    res.json({ content: formatted });
  } catch (error) {
    next(error);
  }
});

app.get('/api/posts/:slug/files', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const postDir = resolvePostDir(slug);
    await ensurePostDirectory(postDir);
    const tree = await directoryTree(postDir, postDir);
    res.json({ tree });
  } catch (error) {
    next(error);
  }
});

app.post('/api/posts/:slug/files/upload', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'target', maxCount: 1 }]), async (req, res, next) => {
  try {
    const { slug } = req.params;
    const target = req.body.target || '';
    if (!req.files || !req.files.file || req.files.file.length === 0) {
      const error = new Error('File is required');
      error.status = 400;
      throw error;
    }
    const file = req.files.file && Array.isArray(req.files.file) ? req.files.file[0] : req.files.file;
    const postDir = resolvePostDir(slug);
    await fse.ensureDir(postDir); // Ensure post directory exists
    const destinationDir = resolveWithin(postDir, target);
    await fse.ensureDir(destinationDir);
    const filePath = path.join(destinationDir, file.originalname);
    await fs.writeFile(filePath, file.buffer);
    res.status(201).json({ message: 'File uploaded' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/posts/:slug/files/create-folder', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { parent = '', name } = req.body;
    assertValidName(name);
    const postDir = resolvePostDir(slug);
    await fse.ensureDir(postDir); // Ensure post directory exists
    const parentDir = resolveWithin(postDir, parent);
    const folderPath = path.join(parentDir, name);
    const exists = await fse.pathExists(folderPath);
    if (exists) {
      const error = new Error('Folder already exists');
      error.status = 409;
      throw error;
    }
    await fse.ensureDir(folderPath);
    res.status(201).json({ message: 'Folder created' });
  } catch (error) {
    next(error);
  }
});

app.put('/api/posts/:slug/files/rename', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { source, target } = req.body;
    if (!source || !target) {
      const error = new Error('source and target are required');
      error.status = 400;
      throw error;
    }
    const postDir = resolvePostDir(slug);
    await ensurePostDirectory(postDir);
    const sourcePath = resolveWithin(postDir, source);
    const targetPath = resolveWithin(postDir, target);
    const targetExists = await fse.pathExists(targetPath);
    if (targetExists) {
      const error = new Error('Target already exists');
      error.status = 409;
      throw error;
    }
    await fse.move(sourcePath, targetPath);
    res.json({ message: 'Renamed successfully' });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/posts/:slug/files', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { target } = req.body;
    if (!target) {
      const error = new Error('target is required');
      error.status = 400;
      throw error;
    }
    const postDir = resolvePostDir(slug);
    await ensurePostDirectory(postDir);
    const targetPath = resolveWithin(postDir, target);
    await fse.remove(targetPath);
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/deploy', async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      const error = new Error('Commit message is required');
      error.status = 400;
      throw error;
    }

    const hugoSiteDir = path.resolve(process.env.HOME || '/home/zimengx', 'Code/hugoSite');
    const dirExists = await fse.pathExists(hugoSiteDir);
    if (!dirExists) {
      const error = new Error('Hugo site directory not found');
      error.status = 404;
      throw error;
    }

    // Run git add .
    await new Promise((resolve, reject) => {
      const gitAdd = spawn('git', ['add', '.'], { cwd: hugoSiteDir });
      let stderr = '';
      gitAdd.stderr.on('data', (data) => { stderr += data.toString(); });
      gitAdd.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`git add failed: ${stderr}`));
        } else {
          resolve();
        }
      });
    });

    // Run git commit
    await new Promise((resolve, reject) => {
      const gitCommit = spawn('git', ['commit', '-am', message], { cwd: hugoSiteDir });
      let stderr = '';
      let stdout = '';
      gitCommit.stdout.on('data', (data) => { stdout += data.toString(); });
      gitCommit.stderr.on('data', (data) => { stderr += data.toString(); });
      gitCommit.on('close', (code) => {
        // Code 0 = success, Code 1 = nothing to commit (not an error for us)
        if (code !== 0 && code !== 1) {
          reject(new Error(`git commit failed: ${stderr}`));
        } else {
          resolve();
        }
      });
    });

    // Run git push
    await new Promise((resolve, reject) => {
      const gitPush = spawn('git', ['push'], { cwd: hugoSiteDir });
      let stderr = '';
      let stdout = '';
      gitPush.stdout.on('data', (data) => { stdout += data.toString(); });
      gitPush.stderr.on('data', (data) => { stderr += data.toString(); });
      gitPush.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`git push failed: ${stderr}`));
        } else {
          resolve();
        }
      });
    });

    res.json({ message: 'Deployed successfully' });
  } catch (error) {
    next(error);
  }
});

const CLIENT_DIST = path.resolve(__dirname, '../../web/dist');
const hasClientBundle = fse.pathExistsSync(CLIENT_DIST);

if (hasClientBundle) {
  app.use(express.static(CLIENT_DIST));
  app.use(async (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    try {
      const indexPath = path.join(CLIENT_DIST, 'index.html');
      const exists = await fse.pathExists(indexPath);
      if (!exists) {
        return next();
      }
      return res.sendFile(indexPath);
    } catch (error) {
      next(error);
    }
  });
}

app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal Server Error',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
