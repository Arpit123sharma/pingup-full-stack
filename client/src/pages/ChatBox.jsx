import { useEffect, useRef, useState } from 'react'
import { ImageIcon, SendHorizonal } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { useParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import api from '../api/axios'
import { addMessage, fetchMessages, resetMessages } from '../features/messages/messagesSlice'
import toast from 'react-hot-toast'

// If your SSE endpoint requires auth via token header, you may need an EventSource polyfill that supports headers.
// For now this example assumes SSE endpoint uses the authenticated session (req.auth()) or accepts clerkId param.
const ChatBox = () => {
  const { messages = [] } = useSelector((state) => state.messages)
  const connections = useSelector((state) => state.connections.connections || [])

  const { userId: routeUserId } = useParams() // ID in URL (likely a clerkId)
  const { getToken, userId: authUserId } = useAuth() // authUserId is current user's clerkId
  const dispatch = useDispatch()

  const [text, setText] = useState('')
  const [image, setImage] = useState(null)
  const [user, setUser] = useState(null)
  const [pendingUsers, setPendingUsers] = useState([]) // not used but kept if needed
  const messagesEndRef = useRef(null)
  const eventSourceRef = useRef(null)

  // Fetch messages for the chat target
  const fetchUserMessages = async () => {
    try {
      const token = await getToken()
      dispatch(fetchMessages({ token, userId: routeUserId }))
    } catch (error) {
      toast.error(error?.message || 'Failed to load messages')
    }
  }

  // send
  const sendMessage = async () => {
    try {
      if (!text && !image) return

      const token = await getToken()
      const formData = new FormData()
      formData.append('to_user_id', routeUserId)
      formData.append('text', text)
      if (image) formData.append('image', image)

      const { data } = await api.post('/api/message/send', formData, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (data?.success) {
        setText('')
        setImage(null)
        // dispatch locally so sender sees it immediately
        dispatch(addMessage(data.message))
      } else {
        throw new Error(data?.message || 'Send failed')
      }
    } catch (error) {
      toast.error(error?.message || 'Failed to send message')
    }
  }

  // On mount / route change: load messages and reset on unmount
 // 🔁 Poll messages continuously while the chat is open
useEffect(() => {
  let mounted = true;
  let intervalId;

  const startPolling = async () => {
    try {
      // 1️⃣ Initial fetch when chat opens
      await fetchUserMessages();

      // 2️⃣ Then keep fetching every 3 seconds
      intervalId = setInterval(async () => {
        if (!mounted) return;
        try {
          const token = await getToken(); // ✅ always get fresh token
          dispatch(fetchMessages({ token, userId: routeUserId }));
        } catch (err) {
          console.error('polling error', err);
        }
      }, 3000);
    } catch (err) {
      console.error('polling start error', err);
    }
  };

  startPolling();

  // 3️⃣ Clean up when leaving chat
  return () => {
    mounted = false;
    if (intervalId) clearInterval(intervalId);
    dispatch(resetMessages());
  };
}, [routeUserId, dispatch, getToken]);


  // Resolve `user` from connections list — prefer clerkId
  useEffect(() => {
    if (Array.isArray(connections) && connections.length > 0) {
      // find by clerkId or fallback to _id
      const found = connections.find(
        (c) => (c.clerkId && c.clerkId === routeUserId) || c._id === routeUserId
      )
      setUser(found || null)
    } else {
      setUser(null)
    }
  }, [connections, routeUserId])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // SSE subscription for real-time incoming messages
  useEffect(() => {
    // Avoid multiple EventSource instances
    if (eventSourceRef.current) {
      return
    }

    // Build SSE url — adjust path to match your server route
    // If your server uses auth via cookie/session, you can call `/api/message/stream`
    // If your server expects clerkId param, use `/api/message/stream/${authUserId}`
    const sseUrl = `/api/message/stream/${authUserId}` // change if needed

    // If your server requires token in query string (not ideal), you can append ?token=...
    // const token = await getToken(); const sseUrl = `/api/message/stream/${authUserId}?token=${token}`

    try {
      const es = new EventSource(sseUrl)
      eventSourceRef.current = es

      es.onopen = () => {
        console.log('SSE connected for', authUserId)
      }

      es.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data)
          // payload should be the message object created by server (same shape as in DB)
          // dispatch to redux
          dispatch(addMessage(payload))
        } catch (err) {
          console.error('Failed to parse SSE message', err)
        }
      }

      es.addEventListener('message', (e) => {
        // optional duplicate listener; main handling is in onmessage
      })

      es.onerror = (err) => {
        console.error('SSE error', err)
        // eslint-disable-next-line no-unused-expressions
        es && es.readyState === EventSource.CLOSED && es.close()
      }

      return () => {
        es.close()
        eventSourceRef.current = null
      }
    } catch (err) {
      console.error('SSE init failed', err)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId, dispatch])

  // Render sorted messages (chronological)
  const sortedMessages = Array.isArray(messages)
    ? [...messages].sort((a, b) => new Date(a.createdAt || a.created_at) - new Date(b.createdAt || b.created_at))
    : []

  // Helper to determine if message is outgoing (sent by current user)
  const isOutgoing = (message) => {
    // message.from_user_id might be string id or populated object
    const from = message.from_user_id
    if (!from) return false
    if (typeof from === 'string') return from === authUserId
    if (typeof from === 'object') return (from.clerkId || from._id) === authUserId
    return false
  }

  // Helper to get the counterpart's id to compare (connection.user clerkId)
  const userClerkId = user?.clerkId || user?._id || routeUserId

  return user ? (
    <div className='flex flex-col h-screen'>
      <div className='flex items-center gap-2 p-2 md:px-10 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-gray-300'>
        <img src={user.profile_picture || '/placeholder-avatar.png'} alt='' className='w-8 h-8 rounded-full' />
        <div>
          <p className='font-medium'>{user.full_name || 'Unknown'}</p>
          <p className='text-sm text-gray-500 -mt-1.5'>@{user.username || ''}</p>
        </div>
      </div>

      <div className='p-5 md:px-10 h-full overflow-y-auto'>
        <div className='space-y-4 max-w-4xl mx-auto'>
          {sortedMessages.map((message) => {
            const outgoing = isOutgoing(message)
            const key = message._id || `${message.createdAt}-${Math.random()}`
            return (
              <div key={key} className={`flex flex-col ${outgoing ? 'items-end' : 'items-start'}`}>
                <div
                  className={`p-2 text-sm max-w-sm bg-white text-slate-700 rounded-lg shadow ${
                    outgoing ? 'rounded-br-none' : 'rounded-bl-none'
                  }`}
                >
                  {message.message_type === 'image' && (
                    <img src={message.media_url} className='w-full max-w-sm rounded-lg mb-1' alt='' />
                  )}
                  <p>{message.text}</p>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className='px-4 py-4'>
        <div className='flex items-center gap-3 pl-5 p-1.5 bg-white w-full max-w-xl mx-auto border border-gray-200 shadow rounded-full mb-5'>
          <input
            type='text'
            className='flex-1 outline-none text-slate-700'
            placeholder='Type a message...'
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            onChange={(e) => setText(e.target.value)}
            value={text}
          />

          <label htmlFor='image' className='cursor-pointer'>
            {image ? (
              <img src={URL.createObjectURL(image)} alt='preview' className='h-8 rounded' />
            ) : (
              <ImageIcon className='w-7 h-7 text-gray-400' />
            )}
            <input type='file' id='image' accept='image/*' hidden onChange={(e) => setImage(e.target.files[0])} />
          </label>

          <button
            onClick={sendMessage}
            className='bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-700 hover:to-purple-800 active:scale-95 cursor-pointer text-white p-2 rounded-full'
          >
            <SendHorizonal size={18} />
          </button>
        </div>
      </div>
    </div>
  ) : (
    <div className='p-6'>Loading chat...</div>
  )
}

export default ChatBox
