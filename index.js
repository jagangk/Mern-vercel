//declarations
const express = require('express');
const cors = require('cors');
const { default: mongoose } = require('mongoose');
const app = express();
const User = require('./models/User');
const bcrypt = require('bcryptjs');
const salt = bcrypt.genSaltSync(10); 
const jwt = require('jsonwebtoken'); 
const secret = 'hello';
const cookieParser = require('cookie-parser');
const path = require('path');
const multer = require('multer');
const uploadMiddleware = multer({ dest: 'uploads/' });
const fs = require('fs');
const Post = require('./models/post');
const bodyParser = require('body-parser');
//const Contact = require('./models/contact');
var nodemailer = require('nodemailer');
const dotenv = require('dotenv');
dotenv.config();
const sharp = require('sharp');
const aws = require('aws-sdk');
const RSS = require('rss');
const feed = new RSS({
  title: 'Your Blog Title',
  description: 'Description of your blog.',
  feed_url: 'https://blogstera.tech/rss',
  site_url: 'https://blogstera.tech',
});


// AWS S3 bucket connect
const s3 = new aws.S3({
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
    region: 'ap-south-1',
});
//upload middleware for amazon s3
const s3UploadMiddleware = multer ({
     storage:multer.memoryStorage(),
     });

const url = 'mongodb+srv://blog:vhUWIEuOKLl1tVOE@cluster0.hrwjeaz.mongodb.net/?retryWrites=true&w=majority';

app.use(express.json());
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use('/uploads',express.static(__dirname + '/uploads'));
app.use(cors({
  origin: 'https://blogstera.tech',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204,
}));


 
//database connection
mongoose.set('strictQuery', false);
mongoose.connect(url,{ useNewUrlParser: true, useUnifiedTopology: true }); 

app.get('/',(req,res) => {
 res.json('server is fucking working');
});

//register page connection to database function
app.post('/test', async (req,res) => {
    const {username,password} = req.body;
   
    try{
        if(password.length < 4) {
            res.status(400);
            throw new e('Password must be at least 8 characters long');
            }    
        const userDoc = await User.create({
            username,
            password: bcrypt.hashSync(password,salt), 
        });
        res.json(userDoc);

    } catch(e) {
        console.log(e);
        res.status(400).json(e);

    }
});

//login page end point connection to database function
app.post('/login', async(req,res) => {
    const {username,password} = req.body;
    const userDoc = await User.findOne({username});
    const passOk = bcrypt.compareSync(password, userDoc.password);
    if (passOk) {
        jwt.sign({username,id:userDoc._id}, secret, {}, (err,token) =>{
            if (err) throw err;
            res.cookie('token',token)
            .json({
                id:userDoc._id,
                username,
                token : token
            });
        });
    } else{
        res.status(400).json('wrong credentials');
    }
  
});

app.get('/profile', (req,res) => {

    const {token} = req.cookies;

    
    jwt.verify(token, secret, {}, (err,info) => {
          if (err) throw err;
          res.json(info);
     });
});

app.post('/logout', (req,res) =>{
    res.cookie('token','').json('ok');

});

// POST route
app.post('/post', s3UploadMiddleware.single('file'), async (req, res) => {
  const { originalname, buffer } = req.file;
  const parts = originalname.split('.');
  const ext = parts[parts.length - 1];
  const desiredQuality = 60;
  
  let processedBuffer;
  // Determine the format of the image
  const { format } = await sharp(buffer).metadata();

  // Apply different options based on the format
  if (format === 'jpeg') {
    processedBuffer = await sharp(buffer).jpeg({ quality: desiredQuality }).toBuffer();
  } else if (format === 'png') {
    processedBuffer = await sharp(buffer).png({ compressionLevel: 5 }).toBuffer();
    // You can adjust the compression level (0 to 9) for PNG images
  } else {
    // Handle other formats or use a default behavior
    processedBuffer = await sharp(buffer).toBuffer();
  }

  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: `uploads/${Date.now()}.${ext}`,
    Body: processedBuffer,
    ContentType: req.file.mimetype,
    ACL:'public-read'
  };

  s3.upload(params, async (err, data) => {
    if (err) {
        console.error(err); 
        res.status(500).json({ error: 'Failed to upload to S3', details: err.message });
      } else {
      const { token } = req.cookies;
      console.log(token);
      jwt.verify(token, secret, {}, async (err, info) => {
        if (err) throw err;
        const { title, summary, content } = req.body;
        const postDoc = await Post.create({
          title,
          summary,
          content,
          cover: data.Location,
          author: info.id,
        });
        res.json(postDoc);
      });
    }
  });
});

app.get('/post', async (req,res) =>{
    res.json(await Post.find()
     .populate('author',['username'])
    .sort({createdAt: -1})
    .limit(20)
    );
});

// RSS route
app.get('/rss', async (req, res) => {
  try {
      const posts = await Post.find()
          .populate('author', ['username'])
          .sort({ createdAt: -1 })
          .limit(20);

      // Clear existing items in the feed
      feed.items = [];

      // Add each post to the RSS feed
      posts.forEach((post) => {
          const feedItem = {
              title: post.title,
              description: post.summary,
              url: `https://blogstera.tech/post/${post._id}`,
              author: post.author.username,
              date: post.createdAt,
              enclosure: { url: post.cover || '' }, // Optional enclosure for image
          };

          feed.item(feedItem);
      });

      // Set the response content type and send the RSS feed
      res.set('Content-Type', 'application/rss+xml');
      res.send(feed.xml({ indent: true }));
  } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.put('/update', s3UploadMiddleware.single('file'), async (req, res) => {
  let newPath = null;

  try {
    if (req.file) {
      const { originalname, buffer } = req.file;
      const parts = originalname.split('.');
      const ext = parts[parts.length - 1];
      const desiredQuality = 60;

      let processedBuffer;
      // Determine the format of the image
      const { format } = await sharp(buffer).metadata();

      // Apply different options based on the format
      if (format === 'jpeg') {
        processedBuffer = await sharp(buffer).jpeg({ quality: desiredQuality }).toBuffer();
      } else if (format === 'png') {
        processedBuffer = await sharp(buffer).jpeg({ quality: desiredQuality }).toBuffer();
      } else {
        processedBuffer = await sharp(buffer).toBuffer();
      }

      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: `uploads/${Date.now()}.${ext}`,
        Body: processedBuffer,
        ContentType: req.file.mimetype,
        ACL: 'public-read'
      };

      const uploadResult = await s3.upload(params).promise();
      newPath = uploadResult.Location;
    }

    const { token } = req.cookies;
    let info;

    try {
      info = jwt.verify(token, secret, {});
    } catch (jwtError) {
      throw new Error('Invalid token');
    }

    const { id, title, summary, content } = req.body;
    const postDoc = await Post.findById(id);
    const isAuthor = JSON.stringify(postDoc.author) === JSON.stringify(info.id);

    if (!isAuthor) {
      return res.status(400).json('You are not the author');
    }

    await postDoc.updateOne({
      title,
      summary,
      content,
      cover: newPath ? newPath : postDoc.cover,
    });

    res.json(postDoc);
  } catch (error) {
    console.error(error);
    res.status(500).json('Internal Server Error');
  }
});




app.get('/post/:id', async(req, res) => {
    const {id} = req.params;
    const postDoc = await Post.findById(id).populate('author',['username']);
    res.json(postDoc);
})



app.post('/contact', async (req, res) => {
    try {
        const { name, email, query } = req.body;
        //const newContact = new Contact({ name, email, query });
        //await newContact.save();


        // Send notification email to the admin
        const adminTransporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'blogsteratech@gmail.com',
                pass: 'jvqo vxmh ojlu uqtk'
            }
        });

        const adminMailOptions = {
            from: 'blogsteratech@gmail.com',
            to: 'blogsteratech@gmail.com',
            subject: 'Customer contact',
            text: `Customer Name: ${name}\nCustomer Email: ${email}\n\n${query}`
        };

        adminTransporter.sendMail(adminMailOptions, function (error, info) {
            if (error) {
                console.error(error);
                res.status(500).send('Internal Server Error');
            } else {
                console.log('Notification Email sent: ' + info.response);
                res.status(200).send('Emails sent successfully');
            }
        });

        //user acknowledgement mail

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'blogsteratech@gmail.com',
                pass: 'jvqo vxmh ojlu uqtk'
            }
        });

        const mailOptions = {
            from: 'blogsteratech@gmail.com',
            to: email,
            subject: 'Thank you for contacting us',
            html: `
                <p>Dear ${name},</p>
                <p>Thank you for contacting us. We have received your inquiry and will get back to you as soon as possible.</p>
                <p>Best regards,<br>Blogstera team</p>
                `
        };

        transporter.sendMail(mailOptions, function (error, info) {
            if (error) {
                console.error(error);
                res.status(500).send('Internal Server Error');
            } else {
                console.log('Email sent: ' + info.response);
                res.status(200).send('Ack-Email sent successfully');
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }

});

app.listen(4000);

module.exports = app;
