import path from 'path';
import { S3Client } from '@aws-sdk/client-s3';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']);

export const upload = multer({
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (jpeg, png, gif, webp, avif).'));
    }
  },
  storage: multerS3({
    s3,
    bucket: process.env.AWS_S3_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      cb(null, `projects/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
});

export { s3 };
