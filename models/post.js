const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const PostSchema = new Schema({
  title: String,
  summary: String,
  content: String,
  PostType: String,
  cover: String,
  keywords: [String],
  author: { type: Schema.Types.ObjectId, ref: 'User' },
  views: { type: Number, default: 0 },
}, {
  timestamps: true,
});

const PostModel = model('Post', PostSchema);
module.exports = PostModel;

