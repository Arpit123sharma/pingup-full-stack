import fs from "fs";
import imagekit from "../configs/imageKit.js";
import Story from "../models/Story.js";
import User from "../models/User.js";
import { inngest } from "../inngest/index.js";

// Add User Story
export const addUserStory = async (req, res) =>{
    try {
        const { userId } = req.auth();
        const {content, media_type, background_color} = req.body;
        const media = req.file
        let media_url = ''

        // upload media to imagekit
        if(media_type === 'image' || media_type === 'video'){
            const fileBuffer = fs.readFileSync(media.path)
            const response = await imagekit.upload({
                file: fileBuffer,
                fileName: media.originalname,
            })
            media_url = response.url
        }
        // create story
        const story = await Story.create({
            user: userId,
            content,
            media_url,
            media_type,
            background_color
        })

        // schedule story deletion after 24 hours
        await inngest.send({
            name: 'app/story.delete',
            data: { storyId: story._id }
        })

        res.json({success: true})

    } catch (error) {
       console.log(error);
       res.json({ success: false, message: error.message }); 
    }
}

// Get User Stories
export const getStories = async (req, res) =>{
    try {
        const { userId } = req.auth();
        const user = await User.findOne({ clerkId: userId });


        // User connections and followings 
        const userIds = [userId, ...user.connections, ...user.following]

        // 1. Get stories for the user + their connections/followings
        const stories = await Story.find({
        user: { $in: userIds }
        }).sort({ createdAt: -1 });

        // 2. Fetch the matching users by clerkId
        const users = await User.find({ clerkId: { $in: userIds } });

        // 3. Create a quick lookup map for clerkId -> user object
        const usersMap = Object.fromEntries(
        users.map(user => [user.clerkId, user.toObject()])
        );

        // 4. Attach user data to each story
        const storiesWithUsers = stories.map(story => ({
        ...story.toObject(),
        user: usersMap[story.user] || null,
        }));

        // 5. Send response
        res.json({ success: true, stories: storiesWithUsers }); 
    } catch (error) {
       console.log(error);
       res.json({ success: false, message: error.message }); 
    }
}