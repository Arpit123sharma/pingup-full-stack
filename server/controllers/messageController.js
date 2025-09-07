import fs from "fs";
import imagekit from "../configs/imageKit.js";
import Message from "../models/Message.js";

// Create an empty object to store SS Event connections
const connections = {}; 

// Controller function for the SSE endpoint
export const sseController = (req, res)=>{
    const { userId } = req.params
    console.log('New client connected : ', userId)

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Add the client's response object to the connections object
    connections[userId] = res

    // Send an initial event to the client
    res.write('log: Connected to SSE stream\n\n');

    // Handle client disconnection
    req.on('close', ()=>{
        // Remove the client's response object from the connections array
        delete connections[userId];
        console.log('Client disconnected');
    })
}

// Send Message
export const sendMessage = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { to_user_id, text } = req.body;
        const image = req.file;

        let media_url = '';
        let message_type = image ? 'image' : 'text';

        if(message_type === 'image'){
            const fileBuffer =  fs.readFileSync(image.path);
            const response = await imagekit.upload({
                file: fileBuffer,
                fileName: image.originalname,
            });
            media_url = imagekit.url({
                path: response.filePath,
                transformation: [
                    {quality: 'auto'},
                    {format: 'webp'},
                    {width: '1280'}
                ]
            })
        }

        const message = await Message.create({
            from_user_id: userId,
            to_user_id,
            text,
            message_type,
            media_url
        })

        res.json({ success: true, message });

        // Send message to to_user_id using SSE

        const messageData = message.toObject();
        const fromUser = await User.findOne({ clerkId: userId });

        messageData.from_user_id = fromUser;

        if(connections[to_user_id]){
            connections[to_user_id].write(`data: ${JSON.stringify(messageData)}\n\n`);
        }


    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// Get Chat Messages
export const getChatMessages = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { to_user_id } = req.body;

        const messages = await Message.find({
            $or: [
                {from_user_id: userId, to_user_id},
                {from_user_id: to_user_id, to_user_id: userId},
            ]
        }).sort({created_at: -1})
        // mark messages as seen
        await Message.updateMany({from_user_id: to_user_id, to_user_id: userId}, {seen: true})

        res.json({ success: true, messages });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
}

export const getUserRecentMessages = async (req, res) => {
    try {
        const { userId } = req.auth();
        const messages = await Message.find({to_user_id: userId}).sort({ created_at: -1 });

        const userIds = [...new Set(messages.flatMap(msg => [msg.from_user_id, msg.to_user_id]))];

        const users = await User.find({ clerkId: { $in: userIds } });

        const usersMap = Object.fromEntries(users.map(user => [user.clerkId, user.toObject()]));

        const messagesWithUsers = messages.map(msg => ({
            ...msg.toObject(),
            from_user_id: usersMap[msg.from_user_id] || null,
            to_user_id: usersMap[msg.to_user_id] || null,
        }));

        res.json({ success: true, messages: messagesWithUsers });

    } catch (error) {
        res.json({ success: false, message: error.message });
    }
}