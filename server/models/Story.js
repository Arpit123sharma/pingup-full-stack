import mongoose from 'mongoose';

const storySchema = new mongoose.Schema({
  user: { type: String, required: true },  // Clerk ID
  content: { type: String },
  media_url: { type: String },
  media_type: { type: String, enum: ['text', 'image', 'video'] },
  views_count: [{ type: String }],         // Clerk IDs
  background_color: { type: String },
}, { timestamps: true, minimize: false });

const Story = mongoose.model('Story', storySchema)

export default Story;