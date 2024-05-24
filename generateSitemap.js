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
		const smStream = new SitemapStream({ 
			hostname: 'https://blogstera.site/' 
		});
		const pipeline = smStream.pipe(zlib.createGzip());

		posts.forEach(item => 
			smStream.write({
				url: item, 
				lastmod: date,
				changefreq: 'daily', 
				priority: 0.7
			})
		);

		smStream.write({
			url: '/login', 
			lastmod: date,
			changefreq: 'monthly', 
			priority: 0.9
		});

    smStream.write({
			url: '/register', 
			lastmod: date,
			changefreq: 'monthly', 
			priority: 0.9
		});

    smStream.write({
			url: '/create', 
			lastmod: date,
			changefreq: 'monthly', 
			priority: 0.9
		});

		smStream.write({
			url: '/contact', 
			lastmod: date,
			changefreq: 'monthly', 
			priority: 0.9
		});

		streamToPromise(pipeline).then(sm => sitemap = sm);
		smStream.end();

		pipeline.pipe(res).on('error', e => { throw e; });
	} catch (err) {
		console.error(err);
		res.status(500).end();
	}
});

module.exports = router;
