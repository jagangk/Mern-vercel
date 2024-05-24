const express = require("express");
const { SitemapStream, streamToPromise } = require('sitemap');
const Post = require("./models/post"); 
const date = new Date().toISOString();
const zlib = require("zlib");
const router = express.Router();

let sitemap;

router.get('/', async function (req, res) {
    res.header('Content-Type', 'application/xml');
    res.header('Content-Encoding', 'gzip');
    if (sitemap) return res.send(sitemap);

    try {
        const data = await Post.find();
        const posts = data.map(({ _id }) => `/post/${_id}`);
        
        // Base URL of your frontend
        const frontendUrl = 'https://blogstera.site';
        
        // Base URL of your backend
        const backendUrl = 'https://api.blogstera.site';
        
        // Create a new SitemapStream with the backend URL
        const smStream = new SitemapStream({ 
            hostname: backendUrl 
        });
        const pipeline = smStream.pipe(zlib.createGzip());

        // Write post URLs to the stream using frontend URL
        posts.forEach(item => 
            smStream.write({
                url: `${frontendUrl}${item}`, 
                lastmod: date,
                changefreq: 'daily', 
                priority: 0.7
            })
        );

        // Manually add all the other important URLs
        smStream.write({
            url: `${frontendUrl}/login`, 
            lastmod: date,
            changefreq: 'monthly', 
            priority: 0.9
        });

        smStream.write({
            url: `${frontendUrl}/register`, 
            lastmod: date,
            changefreq: 'monthly', 
            priority: 0.9
        });

        smStream.write({
            url: `${frontendUrl}/create`, 
            lastmod: date,
            changefreq: 'monthly', 
            priority: 0.9
        });

        smStream.write({
            url: `${frontendUrl}/contact`, 
            lastmod: date,
            changefreq: 'monthly', 
            priority: 0.9
        });

        // Cache the response
        streamToPromise(pipeline).then(sm => sitemap = sm);
        smStream.end();

        // Stream write the response
        pipeline.pipe(res).on('error', e => { throw e; });
    } catch (err) {
        console.error(err);
        res.status(500).end();
    }
});

module.exports = router;