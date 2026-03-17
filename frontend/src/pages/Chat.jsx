import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import axios from 'axios'
import { useSocket } from '../hooks/useSocket'
import { Send, LogOut, Users } from 'lucide-react'

export default function Chat({ token, theme, toggleTheme }) {
  const { socket, onlineUsers = [], typingUsers = {} } = useSocket() || {}
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [messages, setMessages] = useState([])
  const [unreadCounts, setUnreadCounts] = useState({})
  const [newMessage, setNewMessage] = useState('')
  const [search, setSearch] = useState('')
  const [friends, setFriends] = useState([])
  const [friendRequests, setFriendRequests] = useState([])
  const [sentRequests, setSentRequests] = useState([])
  const [viewTab, setViewTab] = useState('friends')
  const [toasts, setToasts] = useState([])
  const toastIdRef = useRef(0)
  const messagesEndRef = useRef(null)

  const [currentUserId, currentUsername] = useMemo(() => {
    if (!token) return [null, null]
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      return [payload?.id ?? null, payload?.username ?? null]
    } catch {
      return [null, null]
    }
  }, [token])

  const isLoggedIn = Boolean(token && currentUserId)

  const addToast = useCallback((text) => {
    const id = toastIdRef.current++
    setToasts(prev => [...prev, { id, text }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  useEffect(() => {
    if (!('Notification' in window)) return
    if (Notification.permission === 'default') Notification.requestPermission()
  }, [])

  // Fetch friends + users
  const refreshFriends = useCallback(async () => {
    if (!token) return
    try {
      const res = await axios.get('http://localhost:5000/api/friends', {
        headers: { Authorization: `Bearer ${token}` }
      })
      setFriends(res.data.friends)
      setFriendRequests(res.data.requests)
      setSentRequests(res.data.sentRequests || [])
      setUsers(res.data.allUsers || [])
    } catch {
      // ignore
    }
  }, [token])

  useEffect(() => {
    if (!token || !currentUserId) re
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshFriends()
  }, [token, currentUserId, refreshFriends])

  const sendFriendRequest = async (receiverId) => {
    try {
      await axios.post('http://localhost:5000/api/friends/request', { receiverId }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      addToast('Friend request sent')
      refreshFriends()
    } catch (err) {
      addToast(err.response?.data?.message || 'Unable to send request')
    }
  }

  const respondFriendRequest = async (requesterId, accept) => {
    try {
      await axios.post('http://localhost:5000/api/friends/respond', { requesterId, accept }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      addToast(accept ? 'Friend added' : 'Request declined')
      refreshFriends()
    } catch (err) {
      addToast(err.response?.data?.message || 'Unable to update request')
    }
  }

  const markDetailsAsRead = useCallback(async (senderId) => {
    if (!senderId) return

    try {
      await axios.post('http://localhost:5000/api/messages/read', { senderId }, {
        headers: { Authorization: `Bearer ${token}` }
      })
    } catch {
      // ignore errors (offline or no permissions)
    }

    setUnreadCounts(prev => ({ ...prev, [senderId]: 0 }))
  }, [token])

  // Khi chọn user
  useEffect(() => {
    if (!selectedUser || !socket) return

    socket.emit('joinChat', { receiverId: selectedUser._id })
    // eslint-disable-next-line react-hooks/set-state-in-effect
    markDetailsAsRead(selectedUser._id)

    axios.get(`http://localhost:5000/api/messages/${selectedUser._id}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => setMessages(res.data)).catch(() => {})
  }, [selectedUser, token, socket, markDetailsAsRead])

  // Nhận tin nhắn real-time
  useEffect(() => {
    if (!socket) return

    const handleReceive = (msg) => {
      const isFromSelected = selectedUser && msg.sender === selectedUser._id
      const isToSelected = selectedUser && msg.receiver === selectedUser._id
      const isHidden = document.visibilityState === 'hidden' || !document.hasFocus()

      // If the chat is active, show message immediately
      if (isFromSelected || isToSelected) {
        // Prevent duplicates when the sender also adds the message locally
        setMessages(prev => {
          if (prev.some(m => m._id === msg._id)) return prev
          return [...prev, msg]
        })
        return
      }

      // Otherwise count as unread in the sidebar
      setUnreadCounts(prev => ({
        ...prev,
        [msg.sender]: (prev[msg.sender] || 0) + 1
      }))

      // Notify user when not focused
      if (isHidden) {
        const sender = users.find(u => u._id === msg.sender) || friends.find(u => u._id === msg.sender)
        const name = sender?.username || 'Someone'
        addToast(`New message from ${name}`)
        if (window.Notification?.permission === 'granted') {
          new Notification('New message', {
            body: `${name}: ${msg.content}`,
            silent: false
          })
        }
      }
    }

    socket.on('receiveMessage', handleReceive)
    return () => socket.off('receiveMessage', handleReceive)
  }, [selectedUser, socket, users, friends, addToast])

  const sendMessage = () => {
    if (!socket || !newMessage.trim() || !selectedUser) return
    const content = newMessage.trim()

    socket.emit('sendMessage', { receiverId: selectedUser._id, content })

    setNewMessage('')
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Read receipts: update local messages when other user reads them
  useEffect(() => {
    if (!socket) return

    const handleRead = ({ readerId }) => {
      // If we are the sender and the other user read the chat, mark messages as read
      if (readerId === selectedUser?._id) {
        setMessages(prev => prev.map(m => {
          if (m.sender === currentUserId && m.receiver === readerId) {
            return { ...m, isRead: true }
          }
          return m
        }))
      }
    }

    socket.on('messagesRead', handleRead)
    return () => socket.off('messagesRead', handleRead)
  }, [socket, selectedUser, currentUserId])

  if (!isLoggedIn) {
    return (
      <div className="flex h-screen items-center justify-center text-white">
        <div className="text-center">
          <p className="text-lg font-semibold">Session expired</p>
          <p className="text-sm text-gray-400">Please log in again.</p>
        </div>
      </div>
    )
  }

  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase())
  )

  const filteredFriends = friends.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase())
  )

  const listToShow = viewTab === 'friends' ? filteredFriends : filteredUsers

  const getPreview = (user) => {
    if (!selectedUser || user._id !== selectedUser._id) return 'Click to start chatting'
    if (!messages.length) return 'No messages yet'
    const last = messages[messages.length - 1]
    const isMe = last.sender === currentUserId
    return `${isMe ? 'You: ' : ''}${last.content.slice(0, 30)}${last.content.length > 30 ? '…' : ''}`
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id} className="bg-black/70 backdrop-blur rounded-xl px-4 py-2 text-sm text-white shadow-lg">
            {t.text}
          </div>
        ))}
      </div>
      {/* Sidebar */}
      <div className="w-80 border-r border-gray-800 flex flex-col">
        <div className="px-6 py-5 border-b border-gray-800">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center">
                <Users size={28} className="text-white" />
              </div>
              <div>
                <p className="font-bold text-lg tracking-wide">ChatApp</p>
                <p className="text-xs text-gray-400">Connect with friends</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleTheme}
                className="text-gray-400 hover:text-white transition"
                title="Toggle theme"
              >
                {theme === 'dark' ? '☀' : '🌙'}
              </button>
              <button
                onClick={() => { localStorage.clear(); window.location.reload() }}
                className="text-gray-400 hover:text-white transition"
                title="Logout"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
          <div className="mt-4 relative">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search users"
              className="w-full bg-gray-900/50 border border-gray-800 rounded-full py-2 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</div>
          </div>

          <div className="mt-4 flex gap-2 text-xs">
            <button
              onClick={() => setViewTab('friends')}
              className={`flex-1 rounded-full py-2 ${viewTab === 'friends' ? 'bg-blue-600 text-white' : 'bg-gray-900/40 text-gray-300 hover:bg-gray-900/70'}`}
            >
              Friends
            </button>
            <button
              onClick={() => setViewTab('all')}
              className={`flex-1 rounded-full py-2 ${viewTab === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-900/40 text-gray-300 hover:bg-gray-900/70'}`}
            >
              All users
            </button>
          </div>

          {friendRequests.length > 0 && (
            <div className="mt-4 px-4 py-3 bg-gray-900/50 rounded-2xl border border-gray-800">
              <div className="font-semibold text-sm text-white mb-2">Friend requests</div>
              {friendRequests.map(r => (
                <div key={r._id} className="flex items-center justify-between gap-2 py-1">
                  <div className="flex items-center gap-2">
                    <img src={r.avatar} className="w-8 h-8 rounded-full object-cover" />
                    <div>
                      <div className="text-sm font-medium text-white">{r.username}</div>
                      <div className="text-xs text-gray-400">Wants to be friends</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => respondFriendRequest(r._id, true)}
                      className="px-2 py-1 text-xs bg-green-600 rounded-lg"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => respondFriendRequest(r._id, false)}
                      className="px-2 py-1 text-xs bg-gray-700 rounded-lg"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {listToShow.map(u => {
            const isFriend = friends.some(f => f._id === u._id)
            const isRequested = sentRequests.some(r => r._id === u._id)
            const isIncoming = friendRequests.some(r => r._id === u._id)

            return (
              <div
                key={u._id}
                onClick={() => setSelectedUser(u)}
                className={`flex items-center gap-3 px-5 py-4 border-b border-gray-800 cursor-pointer transition-all ${selectedUser?._id === u._id ? 'bg-blue-900/50' : 'hover:bg-gray-900/50'}`}
              >
                <div className="relative">
                  <img src={u.avatar} className="w-12 h-12 rounded-2xl object-cover" />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-950 ${onlineUsers.includes(u._id) ? 'bg-green-400' : 'bg-gray-600'}`}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="font-semibold text-sm truncate">{u.username}</p>
                      {unreadCounts[u._id] > 0 && (
                        <span className="text-[10px] font-semibold bg-red-500 text-white rounded-full px-2 py-0.5">
                          {unreadCounts[u._id]}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">12:38</span>
                  </div>
                  <p className="text-xs text-gray-400 truncate">{getPreview(u)}</p>
                </div>

                {viewTab === 'all' && (
                  <div className="flex items-center gap-2">
                    {isFriend ? (
                      <span className="text-xs px-2 py-1 rounded-full bg-green-600/30 text-green-200">Friend</span>
                    ) : isIncoming ? (
                      <span className="text-xs px-2 py-1 rounded-full bg-yellow-600/30 text-yellow-200">Requested you</span>
                    ) : isRequested ? (
                      <span className="text-xs px-2 py-1 rounded-full bg-blue-600/30 text-blue-200">Requested</span>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); sendFriendRequest(u._id) }}
                        className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded-full"
                      >
                        Add
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="px-6 py-4 border-t border-gray-800">
          <div className="text-sm text-gray-400">
            Logged in as <span className="font-semibold text-white">{currentUsername ?? 'Unknown'}</span>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedUser ? (
          <>
            <div className="p-4 border-b border-gray-800 bg-gray-900 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={selectedUser.avatar} className="w-12 h-12 rounded-2xl" />
                <div>
                  <p className="font-bold text-lg">{selectedUser.username}</p>
                  <p className="text-xs text-gray-400">
                    {typingUsers[selectedUser._id]
                      ? 'Typing...'
                      : onlineUsers.includes(selectedUser._id)
                        ? 'Online'
                        : selectedUser.lastSeen
                          ? `Last seen ${new Date(selectedUser.lastSeen).toLocaleString()}`
                          : 'Offline'}
                  </p>
                </div>
              </div>
              <div className="text-gray-400 text-xs">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </div>

            <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.sender === currentUserId ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] px-5 py-3 rounded-3xl text-sm leading-relaxed ${msg.sender === currentUserId ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-200'}`}>
                    {msg.content}
                    <div className="text-[10px] text-gray-400 mt-1 text-right">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {msg.sender === currentUserId && msg.isRead && (
                        <span className="ml-2 text-green-200">Seen</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-5 bg-gray-900 border-t border-gray-800">
              <div className="flex items-center gap-3">
                <input
                  value={newMessage}
                  onChange={e => {
                    setNewMessage(e.target.value)
                    if (socket && selectedUser) {
                      socket.emit('typing', { receiverId: selectedUser._id })
                      setTimeout(() => socket.emit('stopTyping', { receiverId: selectedUser._id }), 800)
                    }
                  }}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 bg-gray-800 text-sm p-4 rounded-full focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <button onClick={sendMessage} className="bg-blue-600 hover:bg-blue-700 p-3 rounded-full transition">
                  <Send size={20} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-10">
            <div className="text-3xl font-semibold text-gray-400">Select a chat to start</div>
            <div className="text-sm text-gray-500 max-w-xs">Pick a user from the list to begin messaging instantly.</div>
          </div>
        )}
      </div>
    </div>
  )
}