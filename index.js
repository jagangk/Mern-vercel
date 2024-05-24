const express = require("express");
const cors = require("cors");
const { default: mongoose } = require("mongoose");
const app = express();
const User = require("./models/User");
const bcrypt = require("bcryptjs");
const salt = bcrypt.genSaltSync(10);
const jwt = require("jsonwebtoken");
const secret = "dbfdfd5454gf54gf4";
const { MongoClient } = require("mongodb");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const Post = require("./models/post");
const bodyParser = require("body-parser");
var nodemailer = require("nodemailer");
const dotenv = require("dotenv");
dotenv.config();
const sharp = require("sharp");
const aws = require("aws-sdk");
const RSS = require("rss");
const UserModel = require("./models/User");
const sitemapRouter = require('./generateSitemap');

//sitemap route
app.use('/sitemap.xml', sitemapRouter);

// AWS S3 bucket connect
const s3 = new aws.S3({
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_SECRET_KEY,
  region: "ap-south-1",
});

const s3UploadMiddleware = multer({
  storage: multer.memoryStorage(),
});

const url = 'mongodb+srv://blog:vhUWIEuOKLl1tVOE@cluster0.hrwjeaz.mongodb.net/?retryWrites=true&w=majority';

app.use(express.json());
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use("/uploads", express.static(__dirname + "/uploads"));

// Enable CORS
app.use(cors({
  origin: ['https://blogstera.site', 'https://www.api.blogstera.site'],
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
  credentials: true,
  optionsSuccessStatus: 204,
}));

//database connection
mongoose.set("strictQuery", false);
mongoose.connect(url, { useNewUrlParser: true, useUnifiedTopology: true });
const client = new MongoClient(url, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000,
});

async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}

connectToMongoDB();

app.get("/", (req, res) => {
  res.json("server is working");
});

//register page connection to database function
app.post("/register", async (req, res) => {
  const { username, password, email, interestType } = req.body;
  try {
    if (password.length < 4) {
      return res.status(400).json({ error: "401" });
    }

    const existingUser = await User.findOne({ username });
    const existingmail = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "402" });
    }
    else if(existingmail) {
      return res.status(400).json({ error: "403"})
    }
    
    const userDoc = await User.create({
      username,
      password: bcrypt.hashSync(password, salt),
      email,
      interestType,
    });

    res.json(userDoc);
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message });
  }
});

//update password route
app.post('/ResetPassword', async (req , res) => {
  const { identifier, newPassword } = req.body;

  if ( !identifier || !newPassword ) {
    return res.status(400).json ({ error: 'Email or New password is not been sent'});
  }

  try {
    const user = await UserModel.findOne ({
      $or : [{ email: identifier}, { username: identifier}],
    });

    if (!user) {
      console.log('User not found for identifier:', identifier);
      return res.status(404).json ({ error: 'User not found'});
    }

    const hashedPassword = await bcrypt.hash (newPassword, 10)
    user.password = hashedPassword;
    await user.save({ validateModifiedOnly: true });

    res.status(200).json ({ message: 'Password successfully updated'});
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json ({error: 'server error'});
  }
});

//login page end point connection to database function
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    // Check if the identifier is an email
    const isEmail = username.includes('@');
    const userDoc = await User.findOne(isEmail ? { email: username } : { username });

    if (!userDoc) {
      return res.status(400).json({ error: "401" });
    }

    const passOk = bcrypt.compareSync(password, userDoc.password);

    if (passOk) {
      jwt.sign({ username: userDoc.username, id: userDoc._id }, secret, {}, (err, token) => {
        if (err) throw err;
        res.cookie("token", token).json({
          id: userDoc._id,
          username: userDoc.username,
          token: token,
        });
      });
    } else {
      res.status(400).json({ error: "402" });
    }
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: "403" });
  }
});

//token verification
app.get("/profile", async (req, res) => {
  try {
    const { token } = req.cookies;

    if (!token) {
      return res.status(401).json({ message: "Token is missing" });
    }
    const decoded = await jwt.verify(token, secret);
    res.json(decoded);
  } catch (error) {
    console.error("Error verifying token:", error);

    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ message: "Invalid token" });
    }
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/logout", (req, res) => {
  res.cookie("token", "").json("ok");
});

//Create POST route
app.post("/post", s3UploadMiddleware.single("file"), async (req, res) => {
  const { originalname, buffer } = req.file;
  const parts = originalname.split(".");
  const ext = parts[parts.length - 1];
  const desiredQuality = 60;

  let processedBuffer;
  const { format } = await sharp(buffer).metadata();
  if (format === "jpeg") {
    processedBuffer = await sharp(buffer)
      .jpeg({ quality: desiredQuality })
      .toBuffer();
  } else if (format === "png") {
    processedBuffer = await sharp(buffer)
      .png({ compressionLevel: 5 })
      .toBuffer();
  } else {
    processedBuffer = await sharp(buffer).toBuffer();
  }

  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: `uploads/${Date.now()}.${ext}`,
    Body: processedBuffer,
    ContentType: req.file.mimetype,
    ACL: "public-read",
  };

  s3.upload(params, async (err, data) => {
    if (err) {
      console.error(err);
      res
        .status(500)
        .json({ error: "Failed to upload to S3", details: err.message });
    } else {
      const { token } = req.cookies;
      console.log(token);
      jwt.verify(token, secret, {}, async (err, info) => {
        if (err) throw err;
        const { title, summary, content, PostType } = req.body;
        const postDoc = await Post.create({
          title,
          summary,
          content,
          PostType,
          cover: data.Location,
          author: info.id,
        });
        res.json(postDoc);
      });
    }
  });
});


//fetch post route for indexpage
app.get("/post", async (req, res) => {
  const page = req.query.page || 1;
  const limit = req.query.limit || 10;
  try {
      const posts = await Post.find()
          .populate("author", ["username"])
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit);
      res.json(posts);
  } catch (error) {
      console.error("Error fetching posts:", error);
      res.status(500).json({ error: "Error fetching posts" });
  }
});

//RSS route
app.get("/rss", async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 }).limit(50);
    const feed = new RSS({
      title: 'Blogstera',
      description: 'News,sports,science,Tech,views and opinions etc',
      feed_url: 'https://www.api.blogstera.site/rss',
      site_url: 'https://blogstera.site',
      language: 'en',
    });

    posts.forEach(post => {
      feed.item({
        title: post.title,
        description: post.summary,
        url: `https://blogstera.site/post/${post._id}`,
        guid:`https://blogstera.site/post/${post._id}`,
        date: post.createdAt,
        enclosure: { url: post.cover},
        custom_elements: [
          { 'category': post.PostType}
        ]
      });
    });

    const xml = feed.xml({ indent: true });
    res.set('Content-Type', 'application/rss+xml');
    res.send(xml);
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});


// delete route
app.delete("/post/:id", async (req, res) => {
  const postId = req.params.id;

  try {
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    await post.deleteOne();
    const keyParts = post.cover.split('/');
    const key = keyParts[keyParts.length - 2] + '/' + keyParts[keyParts.length - 1];
    
    const s3Params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
    };

    s3.deleteObject(s3Params, (err, data) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to delete post image from S3", details: err.message });
      }
      res.json({ message: "Post deleted successfully", deletedPost: post });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete post", details: error.message });
  }
});


// post update route
app.put("/update", s3UploadMiddleware.single("file"), async (req, res) => {
  let newPath = null;
  try {
    if (req.file) {
      const { originalname, buffer } = req.file;
      const parts = originalname.split(".");
      const ext = parts[parts.length - 1];
      const desiredQuality = 60;

      let processedBuffer;
      // Determine the format of the image
      const { format } = await sharp(buffer).metadata();

      // Apply different options based on the format
      if (format === "jpeg") {
        processedBuffer = await sharp(buffer)
          .jpeg({ quality: desiredQuality })
          .toBuffer();
      } else if (format === "png") {
        processedBuffer = await sharp(buffer)
          .jpeg({ quality: desiredQuality })
          .toBuffer();
      } else {
        processedBuffer = await sharp(buffer).toBuffer();
      }

      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: `uploads/${Date.now()}.${ext}`,
        Body: processedBuffer,
        ContentType: req.file.mimetype,
        ACL: "public-read",
      };

      const uploadResult = await s3.upload(params).promise();
      newPath = uploadResult.Location;
    }

    const { token } = req.cookies;
    let info;

    try {
      info = jwt.verify(token, secret, {});
    } catch (jwtError) {
      throw new Error("Invalid token");
    }

    const { id, title, summary, content, PostType } = req.body;
    const postDoc = await Post.findById(id);
    const isAuthor = JSON.stringify(postDoc.author) === JSON.stringify(info.id);

    if (!isAuthor) {
      return res.status(400).json("You are not the author");
    }

    await postDoc.updateOne({
      title,
      summary,
      PostType,
      content,
      cover: newPath ? newPath : postDoc.cover,
    });

    res.json(postDoc);
  } catch (error) {
    console.error(error);
    res.status(500).json("Internal Server Error");
  }
});

app.get("/post/:id", async (req, res) => {
  const { id } = req.params;
  const postDoc = await Post.findById(id).populate("author", ["username"]);
  res.json(postDoc);
});

//customer contact function
app.post("/contact", async (req, res) => {
  try {
    const { name, email, query } = req.body;
    const adminTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.USER,
        pass: process.env.PASS,
      },
    });

    const adminMailOptions = {
      from: process.env.USER,
      to: process.env.USER,
      subject: "Customer contact",
      text: `Customer Name: ${name}\nCustomer Email: ${email}\n\n${query}`,
    };

    adminTransporter.sendMail(adminMailOptions, function (error, info) {
      if (error) {
        console.error(error);
        res.status(500).send("Internal Server Error");
      } else {
        console.log("Notification Email sent: " + info.response);
        res.status(200).send("Emails sent successfully");
      }
    });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.USER,
        pass: process.env.PASS,
      },
    });

    const mailOptions = {
      from: process.env.USER,
      to: email,
      subject: "Thank you for contacting us",
      html: `
              <p>Dear ${name},</p>
              <p>Thank you for contacting us. We have received your inquiry and will get back to you as soon as possible.</p>
              <p>Best regards,<br>Blogstera team</p>
              `,
    };

    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        console.error(error);
        res.status(500).send("Internal Server Error");
      } else {
        console.log("Email sent: " + info.response);
        res.status(200).send("Ack-Email sent successfully");
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

// user report aunthentication function
app.post("/report", async (req, res) => {
  try {
    const { name, email, author, postName, query, reportType } = req.body;
    const adminTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.USER,
        pass: process.env.PASS,
      },
    });

    const adminMailOptions = {
      from: process.env.USER,
      to: process.env.USER,
      subject: "Report contact",
      text: `Customer Name: ${name}\n
             Customer Email: ${email}\n
             Report Type: ${reportType}\n
             Reported Author Name: ${author}\n
             Reported post name: ${postName}\n
             customer mentions:${query}\n`,
    };

    adminTransporter.sendMail(adminMailOptions, function (error, info) {
      if (error) {
        console.error(error);
        res.status(500).send("Internal Server Error");
      } else {
        console.log("Notification Email sent: " + info.response);
        res.status(200).send("Emails sent successfully");
      }
    });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.USER,
        pass: process.env.PASS,
      },
    });

    const mailOptions = {
      from: process.env.USER,
      to: email,
      subject: "Thank you for reporting the article",
      html: `
        <p>Dear ${name},</p>
        <p>Thank you for contacting us. We have received your report regarding the article on our platform. Your report helps us maintain a safe and respectful community.</p>
        <div>
          <h3>Report Details:</h3>
          <p><strong>Article Author:</strong> ${author}</p>
          <p><strong>Article Title:</strong> ${postName}</p>
          <p><strong>Report Type:</strong> ${reportType}</p>
          <p><strong>Additional Notes:</strong> ${query}</p>
        </div>
        <p>We take reports seriously and will review them carefully. If we find that the reported content violates our community guidelines, we will take appropriate action.</p>
        <p>Best regards,<br>Blogstera team</p>
      `,
    };
    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        console.error(error);
        res.status(500).send("Internal Server Error");
      } else {
        console.log("Email sent: " + info.response);
        res.status(200).send("Ack-Email sent successfully");
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
module.exports = app;