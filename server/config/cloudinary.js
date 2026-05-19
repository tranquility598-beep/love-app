/**
 * Cloudinary configuration
 * Used for storing avatars and uploads in the cloud
 */

const cloudinary = require('cloudinary').v2;

console.log('[Cloudinary] CLOUDINARY_URL:', process.env.CLOUDINARY_URL ? 'set' : 'NOT SET');
console.log('[Cloudinary] CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME);
console.log('[Cloudinary] API_KEY:', process.env.CLOUDINARY_API_KEY ? 'set' : 'NOT SET');

if (process.env.CLOUDINARY_URL) {
  cloudinary.config(process.env.CLOUDINARY_URL);
} else if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
} else {
  console.warn('[Cloudinary] WARNING: No CLOUDINARY credentials configured!');
}

module.exports = cloudinary;