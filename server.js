const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { MongoClient } = require('mongodb');

const projectRoot = __dirname;
const port = Number(process.env.PORT || 3000);
const mongoUri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB || 'suthanPortfolio';
const maxRequestBytes = 10 * 1024;
const publicFiles = new Set(['Iindex.html', 'script.js', 'style.css', 'suthan.jpeg', 'resume.pdf']);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.pdf': 'application/pdf'
};

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

if (!mongoUri) {
  throw new Error('MONGODB_URI is required. Add your MongoDB Atlas connection string to .env.');
}

const mongoClient = new MongoClient(mongoUri);
const contactMessages = () => mongoClient.db(databaseName).collection('contactMessages');

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let byteLength = 0;
    let tooLarge = false;

    request.on('data', chunk => {
      byteLength += chunk.length;
      if (byteLength > maxRequestBytes) {
        tooLarge = true;
        chunks.length = 0;
      } else if (!tooLarge) {
        chunks.push(chunk);
      }
    });

    request.on('end', () => {
      if (tooLarge) {
        reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413 }));
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400 }));
      }
    });

    request.on('error', reject);
  });
}

function validateContactMessage(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'A JSON object is required.';
  }

  const { name, email, message } = body;
  if (typeof name !== 'string' || typeof email !== 'string' || typeof message !== 'string') {
    return 'Name, email, and message are required.';
  }

  if (!name.trim() || name.trim().length > 100) {
    return 'Name must be between 1 and 100 characters.';
  }

  const normalizedEmail = email.trim();
  if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return 'Enter a valid email address.';
  }

  if (!message.trim() || message.trim().length > 5000) {
    return 'Message must be between 1 and 5000 characters.';
  }

  return null;
}

const server = createServer(async (request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }

  if (pathname === '/api/contact') {
    if (request.method !== 'POST') {
      response.writeHead(405, { Allow: 'POST' }).end('Method not allowed');
      return;
    }

    if (!request.headers['content-type']?.includes('application/json')) {
      sendJson(response, 415, { error: 'Content-Type must be application/json.' });
      return;
    }

    try {
      const body = await readJsonBody(request);
      const validationError = validateContactMessage(body);
      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }

      await contactMessages().insertOne({
        name: body.name.trim(),
        email: body.email.trim(),
        message: body.message.trim(),
        createdAt: new Date()
      });

      sendJson(response, 201, { message: 'Your message has been sent.' });
    } catch (error) {
      if (error.statusCode) {
        sendJson(response, error.statusCode, { error: error.message });
        return;
      }

      console.error('Failed to save contact message:', error);
      sendJson(response, 500, { error: 'Unable to send your message right now. Please try again later.' });
    }
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }

  const requestedPath = pathname === '/' ? '/Iindex.html' : pathname;
  const fileName = path.basename(requestedPath);
  if (requestedPath !== `/${fileName}` || !publicFiles.has(fileName)) {
    response.writeHead(404).end('Not found');
    return;
  }

  const filePath = path.join(projectRoot, fileName);
  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') {
      response.writeHead(404).end('Not found');
      return;
    }

    console.error('Failed to serve request:', error);
    response.writeHead(500).end('Internal server error');
  }
});

async function startServer() {
  await mongoClient.connect();
  server.listen(port, 'localhost', () => {
    console.log(`Portfolio server running at http://localhost:${port}`);
  });
}

startServer().catch(error => {
  console.error('Failed to connect to MongoDB Atlas:', error);
  process.exitCode = 1;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(async () => {
      await mongoClient.close();
      process.exitCode = 0;
    });
  });
}
