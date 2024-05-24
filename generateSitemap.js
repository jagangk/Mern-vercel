const { SitemapStream, streamToPromise } = require('sitemap');
const { createGzip } = require('zlib');
const fs = require('fs');
const path = require('path');
const Post = require('./models/post'); // Adjust the path to your Post model

async function generateSitemap() {
  try {
    // Fetch posts from the database
    const posts = await Post.find().select('_id');

    // Create a stream to write to
    const sitemapStream = new SitemapStream({ hostname: 'https://blogstera.site' });
    const pipeline = sitemapStream.pipe(createGzip());

    // Write each post to the sitemap
    posts.forEach(post => {
      sitemapStream.write({ url: `/post/${post._id}`, changefreq: 'daily', priority: 0.7 });
    });

    // End the stream
    sitemapStream.end();

    // Ensure the 'public' directory exists
    const sitemapPath = path.resolve(__dirname, 'public', 'sitemap.xml.gz');
    const publicDir = path.dirname(sitemapPath);
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir);
    }

    // Write the sitemap to the file system
    const sitemap = await streamToPromise(pipeline);
    fs.writeFileSync(sitemapPath, sitemap);

    console.log('Sitemap generated successfully.');
  } catch (error) {
    console.error('Error generating sitemap:', error);
  }
}

module.exports = generateSitemap;