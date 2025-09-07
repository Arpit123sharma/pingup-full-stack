import { Inngest } from "inngest";
import User from "../models/User.js";
import Connection from "../models/Connection.js";
import sendEmail from "../configs/nodeMailer.js";
import Story from "../models/Story.js";
import Message from "../models/Message.js";

// Create a client to send and receive events
export const inngest = new Inngest({ id: "pingup-app" });

// Inngest Function to save user data to a database
const syncUserCreation = inngest.createFunction(
    {id: 'sync-user-from-clerk'},
    {event: 'clerk/user.created'},
    async ({event})=>{
        const {id, first_name, last_name, email_addresses, image_url} = event.data
        let username = email_addresses[0].email_address.split('@')[0]

        // Check availability of username
        const user = await User.findOne({username})

        if (user) {
            username = username + Math.floor(Math.random() * 10000)
        }

        const userData = {
            clerkId: id,
            email: email_addresses[0].email_address,
            full_name: first_name + " " + last_name,
            profile_picture: image_url,
            username
        }
        

        await User.create(userData)
        
    }
)

// Inngest Function to update user data in database 
const syncUserUpdation = inngest.createFunction(
    {id: 'update-user-from-clerk'},
    {event: 'clerk/user.updated'},
    async ({event})=>{
        const {id, first_name, last_name, email_addresses, image_url} = event.data
        
    const updatedUserData = {
        email:  email_addresses[0].email_address,
        full_name: first_name + ' ' + last_name,
        profile_picture: image_url
    }
    await User.findOneAndUpdate({ clerkId: id }, updatedUserData);
        
    }
)

// Inngest Function to delete user from database
const syncUserDeletion = inngest.createFunction(
    {id: 'delete-user-with-clerk'},
    {event: 'clerk/user.deleted'},
    async ({event})=>{
        const {id} = event.data
        await User.findOneAndDelete({ clerkId: id });
    }
)

// Inngest Function to send Reminder when a new connection request is added
const sendNewConnectionRequestReminder = inngest.createFunction(
    { id: "send-new-connection-request-reminder" },
    { event: "app/connection-request" },
    async ({ event, step }) => {
        const { connectionId } = event.data;

        // Step 1: Send initial connection request email
        await step.run('send-connection-request-mail', async () => {
            const connection = await Connection.findById(connectionId);
            const fromUser = await User.findOne({ clerkId: connection.from_user_id });
            const toUser = await User.findOne({ clerkId: connection.to_user_id });

            const subject = `👋 New Connection Request`;
            const body = `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>Hi ${toUser.full_name},</h2>
                <p>You have a new connection request from ${fromUser.full_name} - @${fromUser.username}</p>
                <p>Click <a href="${process.env.FRONTEND_URL}/connections" style="color: #10b981;">here</a> to accept or reject the request</p>
                <br/>
                <p>Thanks,<br/>PingUp - Stay Connected</p>
            </div>`;

            await sendEmail({
                to: toUser.email,
                subject,
                body
            });
        });

        // Step 2: Wait for 24 hours
        const in24Hours = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await step.sleepUntil("wait-for-24-hours", in24Hours);

        // Step 3: Send reminder if connection not yet accepted
        await step.run('send-connection-request-reminder', async () => {
            const connection = await Connection.findById(connectionId);
            const fromUser = await User.findOne({ clerkId: connection.from_user_id });
            const toUser = await User.findOne({ clerkId: connection.to_user_id });

            if (connection.status === "accepted") {
                return { message: "Already accepted" };
            }

            const subject = `👋 Reminder: Connection Request Pending`;
            const body = `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>Hi ${toUser.full_name},</h2>
                <p>You still have a pending connection request from ${fromUser.full_name} - @${fromUser.username}</p>
                <p>Click <a href="${process.env.FRONTEND_URL}/connections" style="color: #10b981;">here</a> to accept or reject the request</p>
                <br/>
                <p>Thanks,<br/>PingUp - Stay Connected</p>
            </div>`;

            await sendEmail({
                to: toUser.email,
                subject,
                body
            });

            return { message: "Reminder sent." };
        });
    }
);


// Inngest Function to delete story after 24 hours
const deleteStory = inngest.createFunction(
    {id: 'story-delete'},
    { event: 'app/story.delete' },
    async ({ event, step }) => {
        const { storyId } = event.data;
        const in24Hours = new Date(Date.now() + 24 * 60 * 60 * 1000)
        await step.sleepUntil('wait-for-24-hours', in24Hours)
        await step.run("delete-story", async () => {
            await Story.findByIdAndDelete(storyId)
            return { message: "Story deleted." }
        })
    }
)

const sendNotificationOfUnseenMessages = inngest.createFunction(
    {id: "send-unseen-messages-notification"},
    {cron: "TZ=America/New_York 0 9 * * *"}, // Every Day 9 AM
    async ({step}) => {
        const messages = await Message.find({ seen: false });
        const unseenCount = {};

        messages.forEach(message => {
            unseenCount[message.to_user_id] = (unseenCount[message.to_user_id] || 0) + 1;
        });

        const userIds = Object.keys(unseenCount);
        const users = await User.find({ clerkId: { $in: userIds } });
        const usersMap = Object.fromEntries(users.map(user => [user.clerkId, user.toObject()]));

        for (const userId of userIds) {
            const user = usersMap[userId];

            if (!user) continue; // skip if user not found

            const subject = `📬 You have ${unseenCount[userId]} unseen messages`;

            const body = `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>Hi ${user.full_name},</h2>
                <p>You have ${unseenCount[userId]} unseen messages</p>
                <p>Click <a href="${process.env.FRONTEND_URL}/messages" style="color: #10b981;">here</a> to view them</p>
                <br/>
                <p>Thanks,<br/>PingUp - Stay Connected</p>
            </div>
            `;

            await sendEmail({
                to: user.email,
                subject,
                body
            });

        }
        return {message: "Notification sent."}
    }
)


// Create an empty array where we'll export future Inngest functions
export const functions = [
    syncUserCreation,
    syncUserUpdation,
    syncUserDeletion,
    sendNewConnectionRequestReminder,
    deleteStory,
    sendNotificationOfUnseenMessages
];