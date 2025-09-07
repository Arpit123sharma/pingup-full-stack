import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  clerkId: { type: String, required: true, unique: true }, // Clerk ID is the primary identifier
  email: { type: String, required: true },
  full_name: { type: String, required: true },
  username: { type: String, unique: true },
  bio: { type: String, default: 'Hey there! I am using PingUp.' },
  profile_picture: { type: String, default: '' },
  cover_photo: { type: String, default: '' },
  location: { type: String, default: '' },
  followers: [{ type: String }],    // Clerk IDs
  following: [{ type: String }],    // Clerk IDs
  connections: [{ type: String }],  // Clerk IDs
}, { timestamps: true, minimize: false });

const User = mongoose.model('User', userSchema)

export default User