import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import axios from 'axios';
import { useSocket } from '../hooks/useSocket';
import { Send, LogOut, Users, Phone, PhoneOff } from 'lucide-react';
import EmojiPicker from '../components/EmojiPicker';
import StickerPicker from '../components/StickerPicker';

const API = import.meta.env.VITE_API_URL || 'https://chatapp-dqda.onrender.com'

export default function Chat({ token }) {
    // Emoji & sticker picker state (đã di chuyển lên đầu, nhưng hiện không dùng nên xóa)
  const { socket, onlineUsers = [], typingUsers = {} } = useSocket() || {}
  const [users, setUsers] = useState([])
  const [rooms, setRooms] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [messages, setMessages] = useState([])
  const [unreadCounts, setUnreadCounts] = useState({})
  const [roomUnreadCounts, setRoomUnreadCounts] = useState({})
  const [newMessage, setNewMessage] = useState('')
  const [search, setSearch] = useState('')
  const [friends, setFriends] = useState([])
  const [friendRequests, setFriendRequests] = useState([])
  const [sentRequests, setSentRequests] = useState([])
  const [viewTab, setViewTab] = useState('friends')
  const [attachment, setAttachment] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [showCreateRoom, setShowCreateRoom] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomMembers, setNewRoomMembers] = useState([])
  const [toasts, setToasts] = useState([])
  const toastIdRef = useRef(0)
  const messagesEndRef = useRef(null)

  // New states for advanced features
  const [userPreferences, setUserPreferences] = useState(() => ({ theme: localStorage.getItem('theme') || 'dark', status: 'online' }))
  const [editingMessage, setEditingMessage] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [showRoomSettings, setShowRoomSettings] = useState(false)
  const [availableThemes] = useState(['light', 'dark', 'auto'])

  // New states for additional features
  const [replyingTo, setReplyingTo] = useState(null)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [gifSearch, setGifSearch] = useState('')
  const [gifs, setGifs] = useState([])
  const [searchingGifs, setSearchingGifs] = useState(false)
  const [translations, setTranslations] = useState({})
  const [callState, setCallState] = useState('idle')
  const [callPeerId, setCallPeerId] = useState(null)
  const [incomingCall, setIncomingCall] = useState(null)
  const localAudioRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const localStreamRef = useRef(null)
  const peerConnectionRef = useRef(null)
  const pendingCandidatesRef = useRef([])
  const callTimeoutRef = useRef(null)

  const [currentUserId, currentUsername] = useMemo(() => {
    if (!token) return [null, null]
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      return [payload?.id ?? null, payload?.username ?? null]
    } catch {
      return [null, null]
    }
  }, [token])

  const getEntityId = useCallback((value) => {
    if (!value) return null
    if (typeof value === 'string') return value
    if (typeof value === 'object') {
      if (value._id != null) return String(value._id)
      if (value.id != null) return String(value.id)
    }
    return String(value)
  }, [])

  const isLoggedIn = Boolean(token && currentUserId)

  const selectedChatTitle = selectedRoom ? selectedRoom.name : selectedUser?.username
  const selectedChatSubtitle = selectedRoom
    ? (typingUsers[`room:${selectedRoom._id}`] ? 'Typing...' : `${selectedRoom.members?.length || 0} member${(selectedRoom.members?.length || 0) === 1 ? '' : 's'}`)
    : selectedUser && (typingUsers[selectedUser._id]
      ? 'Typing...'
      : onlineUsers.includes(selectedUser._id)
        ? 'Online'
        : selectedUser.lastSeen
          ? `Last seen ${new Date(selectedUser.lastSeen).toLocaleString()}`
          : 'Offline')

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
      const res = await axios.get(`${API}/api/friends`, {
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

  const refreshRooms = useCallback(async () => {
    if (!token) return
    try {
      const res = await axios.get(`${API}/api/rooms`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setRooms(res.data || [])
    } catch {
      // ignore
    }
  }, [token])

  useEffect(() => {
    if (!token || !currentUserId) return
    refreshFriends()
    refreshRooms()
  }, [token, currentUserId, refreshFriends, refreshRooms])

  const sendFriendRequest = async (receiverId) => {
    try {
      await axios.post(`${API}/api/friends/request`, { receiverId }, {
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
      await axios.post(`${API}/api/friends/respond`, { requesterId, accept }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      addToast(accept ? 'Friend added' : 'Request declined')
      refreshFriends()
    } catch (err) {
      addToast(err.response?.data?.message || 'Unable to update request')
    }
  }

  const createRoom = async () => {
    if (!newRoomName.trim()) {
      addToast('Please enter a room name')
      return
    }
    if (!newRoomMembers.length) {
      addToast('Select at least one member')
      return
    }

    try {
      const res = await axios.post(`${API}/api/rooms`, {
        name: newRoomName.trim(),
        memberIds: newRoomMembers
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })

      setRooms(prev => [res.data, ...prev])
      setSelectedRoom(res.data)
      setSelectedUser(null)
      setShowCreateRoom(false)
      setNewRoomName('')
      setNewRoomMembers([])
      addToast('Room created')
    } catch (err) {
      addToast(err.response?.data?.message || 'Unable to create room')
    }
  }

  // New functions for advanced features
  const updateUserPreferences = async (updates) => {
    const nextPrefs = { ...userPreferences, ...updates }

    // Apply theme locally (for UI effects) even if server update fails.
    if (updates.theme) {
      localStorage.setItem('theme', updates.theme)
      document.documentElement.classList.toggle('dark', updates.theme === 'dark')
    }

    setUserPreferences(nextPrefs)

    try {
      const res = await axios.put(`${API}/api/user/preferences`, updates, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setUserPreferences(prev => ({ ...prev, ...res.data }))
      addToast('Preferences updated')
    } catch {
      addToast('Failed to update preferences')
    }
  }

  // Push notification subscription
  const subscribeToNotifications = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in navigator)) {
      addToast('Push notifications not supported')
      return
    }

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BKxQzQy8q5yI4VzHt8KjJcJcQzQy8q5yI4VzHt8KjJc')
      })

      await axios.post(`${API}/api/push/subscribe`, { subscription }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      addToast('Push notifications enabled')
    } catch {
      addToast('Failed to enable push notifications')
    }
  }

  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }

  const reactToMessage = async (messageId, emoji) => {
    try {
      const res = await axios.post(`${API}/api/messages/${messageId}/react`, { emoji }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      // Update the message in state
      setMessages(prev => prev.map(msg => msg._id === messageId ? res.data : msg))
    } catch {
      addToast('Failed to react to message')
    }
  }

  const startEditingMessage = (message) => {
    if (getEntityId(message.sender) !== currentUserId) return
    if (Date.now() - new Date(message.createdAt) > 5 * 60 * 1000) {
      addToast('Can only edit messages within 5 minutes')
      return
    }
    setEditingMessage(message._id)
    setEditContent(message.content)
  }

  const saveEditedMessage = async () => {
    if (!editContent.trim()) return
    try {
      const res = await axios.put(`${API}/api/messages/${editingMessage}`, {
        content: editContent.trim()
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setMessages(prev => prev.map(msg => msg._id === editingMessage ? res.data : msg))
      setEditingMessage(null)
      setEditContent('')
      addToast('Message edited')
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to edit message')
    }
  }

  const deleteMessage = async (messageId) => {
    try {
      await axios.delete(`${API}/api/messages/${messageId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setMessages(prev => prev.map(msg => 
        msg._id === messageId ? { ...msg, deletedAt: new Date(), content: 'This message was deleted' } : msg
      ))
      addToast('Message deleted')
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to delete message')
    }
  }

  const addRoomMember = async (userId) => {
    if (!selectedRoom) return
    try {
      const res = await axios.post(`${API}/api/rooms/${selectedRoom._id}/members`, { userId }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setSelectedRoom(res.data)
      setRooms(prev => prev.map(r => r._id === selectedRoom._id ? res.data : r))
      addToast('Member added')
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to add member')
    }
  }

  const removeRoomMember = async (userId) => {
    if (!selectedRoom) return
    try {
      const res = await axios.delete(`${API}/api/rooms/${selectedRoom._id}/members/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setSelectedRoom(res.data)
      setRooms(prev => prev.map(r => r._id === selectedRoom._id ? res.data : r))
      addToast('Member removed')
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to remove member')
    }
  }

  // New functions for additional features
  const replyToMessage = (message) => {
    setReplyingTo(message)
  }

  const cancelReply = () => {
    setReplyingTo(null)
  }

  const deleteChat = async () => {
    if (!selectedUser) return
    if (!confirm('Are you sure you want to delete this entire chat? This action cannot be undone.')) return

    try {
      await axios.delete(`${API}/api/chats/${selectedUser._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setMessages([])
      addToast('Chat deleted')
    } catch {
      addToast('Failed to delete chat')
    }
  }

  const unfriendUser = async () => {
    if (!selectedUser) return
    if (!confirm('Are you sure you want to unfriend this user?')) return

    try {
      await axios.delete(`${API}/api/friends/${selectedUser._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      // Remove from friends list and close chat
      setFriends(prev => prev.filter(f => f._id !== selectedUser._id))
      setSelectedUser(null)
      setMessages([])
      addToast('Unfriended successfully')
    } catch {
      addToast('Failed to unfriend')
    }
  }

  const searchGifs = async (query) => {
    if (!query.trim()) return
    setSearchingGifs(true)
    try {
      const res = await axios.get(`${API}/api/gifs/search?q=${encodeURIComponent(query)}&limit=20`)
      setGifs(res.data)
    } catch {
      addToast('Failed to search GIFs')
    } finally {
      setSearchingGifs(false)
    }
  }

  const sendGif = async (gif) => {
    const clientId = Date.now().toString()
    const payload = {
      clientId,
      content: '',
      gif: {
        url: gif.url,
        title: gif.title
      },
      receiverId: selectedUser?._id,
      roomId: selectedRoom?._id
    }

    // Add message locally
    const tempMessage = {
      _id: clientId,
      clientId,
      sender: currentUserId,
      receiver: selectedUser?._id,
      room: selectedRoom?._id,
      content: '',
      gif: payload.gif,
      createdAt: new Date(),
      isRead: false
    }
    setMessages(prev => [...prev, tempMessage])

    socket.emit('sendMessage', payload, (message) => {
      // Update with real message
      setMessages(prev => prev.map(msg => msg.clientId === clientId ? message : msg))
    })

    setShowGifPicker(false)
    setGifSearch('')
  }

  const translateMessage = async (messageId, text) => {
    if (!text) return

    // Toggle off existing translation when the user clicks translate again.
    if (translations[messageId]) {
      setTranslations(prev => {
        const next = { ...prev }
        delete next[messageId]
        return next
      })
      return
    }

    try {
      const res = await fetch('https://libretranslate.de/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text, source: 'auto', target: 'vi', format: 'text' })
      })

      if (!res.ok) throw new Error('Translate request failed')
      const data = await res.json()
      if (!data?.translatedText) throw new Error('No translated text')

      setTranslations(prev => ({ ...prev, [messageId]: data.translatedText }))
    } catch {
      addToast('Translation failed')
    }
  }

  const sendBotMessage = async () => {
    if (!selectedUser && !selectedRoom) {
      addToast('Select a chat before using AI')
      return
    }

    const prompt = newMessage.trim() || messages[messages.length - 1]?.content || 'Help me with this chat'

    try {
      const res = await axios.post(`${API}/api/bot/message`, {
        message: prompt,
        conversationId: selectedUser?._id || selectedRoom?._id,
        type: selectedRoom ? 'room' : 'user'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })

      // Show bot reply immediately
      setMessages(prev => [...prev, res.data])
      if (newMessage.trim()) setNewMessage('')
    } catch {
      addToast('Bot is unavailable')
    }
  }

  const stopLocalTracks = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
    }
    if (localAudioRef.current) localAudioRef.current.srcObject = null
  }, [])

  const clearCallTimeout = useCallback(() => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current)
      callTimeoutRef.current = null
    }
  }, [])

  const cleanupCall = useCallback((resetIncoming = true) => {
    clearCallTimeout()

    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null
      peerConnectionRef.current.ontrack = null
      peerConnectionRef.current.onconnectionstatechange = null
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }

    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null
    pendingCandidatesRef.current = []
    stopLocalTracks()
    setCallState('idle')
    setCallPeerId(null)
    if (resetIncoming) setIncomingCall(null)
  }, [stopLocalTracks, clearCallTimeout])

  const createPeerConnection = useCallback((targetUserId) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    })

    pc.onicecandidate = (event) => {
      if (event.candidate && socket && targetUserId) {
        socket.emit('call:ice-candidate', {
          toUserId: targetUserId,
          candidate: event.candidate
        })
      }
    }

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams
      if (remoteAudioRef.current && remoteStream) {
        remoteAudioRef.current.srcObject = remoteStream
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallState('in-call')
      }

      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        cleanupCall(false)
        addToast('Call ended')
      }
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current))
    }

    peerConnectionRef.current = pc
    return pc
  }, [socket, cleanupCall, addToast])

  const flushPendingCandidates = useCallback(async () => {
    const pc = peerConnectionRef.current
    if (!pc || !pendingCandidatesRef.current.length) return

    const queue = [...pendingCandidatesRef.current]
    pendingCandidatesRef.current = []

    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch {
        // ignore candidate errors from stale peers
      }
    }
  }, [])

  const ensureLocalAudio = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Audio call is not supported in this browser')
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    localStreamRef.current = stream
    if (localAudioRef.current) localAudioRef.current.srcObject = stream
    return stream
  }, [])

  const startCall = useCallback(async () => {
    if (!socket) {
      addToast('Socket is not connected')
      return
    }
    if (!selectedUser || selectedRoom) {
      addToast('Voice call is available for 1:1 chat only')
      return
    }
    if (callState !== 'idle') {
      addToast('A call is already in progress')
      return
    }

    try {
      setCallState('calling')
      setCallPeerId(selectedUser._id)
      await ensureLocalAudio()

      const pc = createPeerConnection(selectedUser._id)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      socket.emit('call:start', {
        toUserId: selectedUser._id,
        offer,
        fromUsername: currentUsername || 'Unknown'
      }, (ack) => {
        if (ack?.error) {
          addToast(ack.error)
          cleanupCall()
        }
      })

      // If no answer in time, treat as unreachable.
      clearCallTimeout()
      callTimeoutRef.current = setTimeout(() => {
        setCallState(prev => {
          if (prev === 'calling' || prev === 'connecting') {
            addToast('Khong lien lac duoc voi nguoi nay')
            cleanupCall()
          }
          return prev
        })
      }, 20000)
    } catch {
      addToast('Unable to start voice call')
      cleanupCall()
    }
  }, [socket, selectedUser, selectedRoom, callState, ensureLocalAudio, createPeerConnection, currentUsername, addToast, cleanupCall, clearCallTimeout])

  const endCall = useCallback((notifyPeer = true) => {
    if (notifyPeer && socket && callPeerId) {
      socket.emit('call:end', { toUserId: callPeerId })
    }
    cleanupCall()
  }, [socket, callPeerId, cleanupCall])

  const rejectIncomingCall = useCallback(() => {
    if (socket && incomingCall?.fromUserId) {
      socket.emit('call:reject', { toUserId: incomingCall.fromUserId, reason: 'Call rejected' })
    }
    cleanupCall()
  }, [socket, incomingCall, cleanupCall])

  const acceptIncomingCall = useCallback(async () => {
    if (!socket || !incomingCall?.fromUserId || !incomingCall?.offer) return

    try {
      setCallState('connecting')
      setCallPeerId(incomingCall.fromUserId)
      await ensureLocalAudio()

      const pc = createPeerConnection(incomingCall.fromUserId)
      await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer))
      await flushPendingCandidates()

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      socket.emit('call:answer', { toUserId: incomingCall.fromUserId, answer })
      setIncomingCall(null)
    } catch {
      addToast('Unable to accept call')
      cleanupCall()
    }
  }, [socket, incomingCall, ensureLocalAudio, createPeerConnection, flushPendingCandidates, addToast, cleanupCall])

  const markDetailsAsRead = useCallback(async (senderId) => {
    if (!senderId) return

    try {
      await axios.post(`${API}/api/messages/read`, { senderId }, {
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
    markDetailsAsRead(selectedUser._id)

    axios.get(`${API}/api/messages/${selectedUser._id}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => setMessages(res.data)).catch(() => {})
  }, [selectedUser, token, socket, markDetailsAsRead])

  // Khi chọn phòng (group chat)
  useEffect(() => {
    if (!selectedRoom || !socket) return

    socket.emit('joinRoom', { roomId: selectedRoom._id })
    setRoomUnreadCounts(prev => ({ ...prev, [selectedRoom._id]: 0 }))

    axios.get(`${API}/api/rooms/${selectedRoom._id}/messages`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => setMessages(res.data)).catch(() => {})
  }, [selectedRoom, token, socket])

  // Nhận tin nhắn real-time
  useEffect(() => {
    if (!socket) return

    const handleReceive = (msg) => {
      const senderId = getEntityId(msg.sender)
      const receiverId = getEntityId(msg.receiver)
      const isFromSelected = Boolean(selectedUser && senderId === selectedUser._id)
      const isToSelected = Boolean(selectedUser && receiverId === selectedUser._id)
      const isHidden = document.visibilityState === 'hidden' || !document.hasFocus()

      // If the chat is active, show message immediately
      if (isFromSelected || isToSelected) {
        // Prevent duplicates when the sender also adds the message locally
        setMessages(prev => {
          if (prev.some(m => m._id === msg._id || (msg.clientId && m.clientId === msg.clientId))) return prev
          return [...prev, msg]
        })
        return
      }

      // Otherwise count as unread in the sidebar
      if (!senderId) return
      setUnreadCounts(prev => ({
        ...prev,
        [senderId]: (prev[senderId] || 0) + 1
      }))

      // Notify user when not focused
      if (isHidden) {
        const sender = users.find(u => u._id === senderId) || friends.find(u => u._id === senderId)
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

    const handleRoomReceive = (msg) => {
      const roomId = getEntityId(msg.room)
      const isActiveRoom = Boolean(selectedRoom && roomId === selectedRoom._id)
      const isHidden = document.visibilityState === 'hidden' || !document.hasFocus()

      if (isActiveRoom) {
        setMessages(prev => {
          if (prev.some(m => m._id === msg._id || (msg.clientId && m.clientId === msg.clientId))) return prev
          return [...prev, msg]
        })
        return
      }

      if (!roomId) return
      setRoomUnreadCounts(prev => ({
        ...prev,
        [roomId]: (prev[roomId] || 0) + 1
      }))

      if (isHidden) {
        const room = rooms.find(r => r._id === roomId)
        const name = room?.name || 'Room'
        addToast(`New message in ${name}`)
        if (window.Notification?.permission === 'granted') {
          new Notification('New message', {
            body: `${name}: ${msg.content}`,
            silent: false
          })
        }
      }
    }

    socket.on('receiveMessage', handleReceive)
    socket.on('receiveRoomMessage', handleRoomReceive)
    return () => {
      socket.off('receiveMessage', handleReceive)
      socket.off('receiveRoomMessage', handleRoomReceive)
    }
  }, [selectedUser, selectedRoom, socket, users, friends, rooms, addToast, getEntityId])

  // Realtime friend list updates (new request, accept, etc.)
  useEffect(() => {
    if (!socket) return
    const onFriendUpdate = () => {
      refreshFriends()
      refreshRooms()
    }
    socket.on('friendUpdate', onFriendUpdate)
    return () => socket.off('friendUpdate', onFriendUpdate)
  }, [socket, refreshFriends, refreshRooms])

  useEffect(() => {
    if (!socket) return

    const onIncomingCall = ({ fromUserId, fromUsername, offer }) => {
      if (callState !== 'idle') {
        socket.emit('call:reject', { toUserId: fromUserId, reason: 'User is busy' })
        return
      }

      setIncomingCall({ fromUserId, fromUsername, offer })
      setCallState('incoming')
      setCallPeerId(fromUserId)
      addToast(`Incoming call from ${fromUsername || 'Unknown'}`)
    }

    const onCallAnswer = async ({ answer }) => {
      const pc = peerConnectionRef.current
      if (!pc) return

      try {
        clearCallTimeout()
        await pc.setRemoteDescription(new RTCSessionDescription(answer))
        await flushPendingCandidates()
        setCallState('connecting')
      } catch {
        addToast('Failed to establish call')
        cleanupCall()
      }
    }

    const onIceCandidate = async ({ candidate }) => {
      const pc = peerConnectionRef.current
      if (!pc || !pc.remoteDescription) {
        pendingCandidatesRef.current.push(candidate)
        return
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch {
        // ignore candidate errors from stale peers
      }
    }

    const onCallReject = ({ reason }) => {
      addToast(reason || 'Call rejected')
      cleanupCall()
    }

    const onCallEnd = () => {
      addToast('Call ended')
      cleanupCall()
    }

    socket.on('call:incoming', onIncomingCall)
    socket.on('call:answer', onCallAnswer)
    socket.on('call:ice-candidate', onIceCandidate)
    socket.on('call:reject', onCallReject)
    socket.on('call:end', onCallEnd)

    return () => {
      socket.off('call:incoming', onIncomingCall)
      socket.off('call:answer', onCallAnswer)
      socket.off('call:ice-candidate', onIceCandidate)
      socket.off('call:reject', onCallReject)
      socket.off('call:end', onCallEnd)
    }
  }, [socket, callState, addToast, flushPendingCandidates, cleanupCall, clearCallTimeout])

  useEffect(() => {
    return () => cleanupCall(false)
  }, [cleanupCall])

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const form = new FormData()
    form.append('file', file)

    try {
      const res = await axios.post(`${API}/api/upload`, form, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      })
      setAttachment(res.data)
      addToast('File ready to send')
    } catch {
      addToast('Upload failed')
    } finally {
      setUploading(false)
      // Allow selecting the same file again after an upload attempt.
      e.target.value = ''
    }
  }

  const sendMessage = () => {
    if (!socket || (!newMessage.trim() && !attachment)) return

    const clientId = Date.now().toString()

    const payload = {
      clientId,
      content: newMessage.trim(),
      attachment
    }

    // Handle reply
    if (replyingTo) {
      payload.replyTo = replyingTo._id
    }

    if (selectedRoom) {
      payload.roomId = selectedRoom._id
    } else if (selectedUser) {
      payload.receiverId = selectedUser._id
    } else {
      return
    }

    // Add message locally for immediate feedback
    const tempMessage = {
      _id: clientId, // temporary ID
      clientId,
      sender: currentUserId,
      receiver: selectedUser?._id,
      room: selectedRoom?._id,
      content: payload.content,
      attachment: payload.attachment,
      replyTo: payload.replyTo,
      createdAt: new Date(),
      isRead: false
    }
    setMessages(prev => [...prev, tempMessage])

    socket.emit('sendMessage', payload, (message) => {
      // Replace local temp message once the server returns the real one
      setMessages(prev => prev.map(msg => msg.clientId === clientId ? message : msg))
    })

    setNewMessage('')
    setAttachment(null)
    setReplyingTo(null)
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
          if (getEntityId(m.sender) === currentUserId && getEntityId(m.receiver) === readerId) {
            return { ...m, isRead: true }
          }
          return m
        }))
      }
    }

    socket.on('messagesRead', handleRead)
    return () => socket.off('messagesRead', handleRead)
  }, [socket, selectedUser, currentUserId, getEntityId])

  if (!isLoggedIn) {
    return (
      <div className="flex h-screen items-center justify-center text-white bg-linear-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-200 dark:text-gray-300">Session expired</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">Please log in again.</p>
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

  const filteredRooms = rooms.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase())
  )

  const listToShow = viewTab === 'friends' ? filteredFriends : viewTab === 'rooms' ? filteredRooms : filteredUsers

  const getPreview = (user) => {
    if (!selectedUser || user._id !== selectedUser._id) return 'Click to start chatting'
    if (!messages.length) return 'No messages yet'
    const last = messages[messages.length - 1]
    const isMe = getEntityId(last.sender) === currentUserId
    const prefix = last.attachment ? '📎 ' : ''
    const content = last.content || ''
    const snippet = content.slice(0, 30) + (content.length > 30 ? '…' : '')
    return `${isMe ? 'You: ' : ''}${prefix}${snippet}`
  }

  const deleteRoom = async () => {
    if (!selectedRoom) return
    if (!confirm(`Delete room "${selectedRoom.name}"? This action cannot be undone.`)) return

    try {
      await axios.delete(`${API}/api/rooms/${selectedRoom._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      setRooms(prev => prev.filter(room => room._id !== selectedRoom._id))
      setSelectedRoom(null)
      setMessages([])
      setShowRoomSettings(false)
      addToast('Room deleted')
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to delete room')
    }
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-linear-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="mx-auto flex h-screen max-w-7xl w-full">
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
          {toasts.map(t => (
            <div key={t.id} className="bg-black/70 backdrop-blur rounded-xl px-4 py-2 text-sm text-white shadow-lg">
              {t.text}
            </div>
          ))}
        </div>
        {/* Sidebar */}
        <div className="w-80 border-r border-gray-200 bg-white text-slate-900 flex flex-col">
          <div className="px-6 py-5 border-b border-gray-200">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-indigo-500 to-sky-500 flex items-center justify-center">
                  <Users size={28} className="text-white" />
                </div>
                <div>
                  <p className="font-bold text-lg tracking-wide text-slate-900">ChatApp</p>
                  <p className="text-xs text-gray-400">Connect with friends</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCreateRoom(true)}
                  className="text-gray-400 hover:text-white transition"
                  title="Create room"
                >
                  ➕
                </button>
                <select
                  value={userPreferences.theme}
                  onChange={(e) => updateUserPreferences({ theme: e.target.value })}
                  className="bg-transparent text-gray-400 border-none outline-none cursor-pointer hover:text-white transition"
                  title="Select theme"
                >
                  {availableThemes.map(t => (
                    <option key={t} value={t} className="bg-gray-800 text-white">
                      {t === 'light' ? '☀ Light' : t === 'dark' ? '🌙 Dark' : '🌓 Auto'}
                    </option>
                  ))}
                </select>
                <select
                  value={userPreferences.status}
                  onChange={(e) => updateUserPreferences({ status: e.target.value })}
                  className="bg-transparent text-gray-400 border-none outline-none cursor-pointer hover:text-white transition"
                  title="Set status"
                >
                  <option value="online" className="bg-gray-800 text-white">🟢 Online</option>
                  <option value="away" className="bg-gray-800 text-white">🟡 Away</option>
                  <option value="busy" className="bg-gray-800 text-white">🔴 Busy</option>
                  <option value="invisible" className="bg-gray-800 text-white">👻 Invisible</option>
                </select>
                <button
                  onClick={subscribeToNotifications}
                  className="text-gray-400 hover:text-white transition"
                  title="Enable notifications"
                >
                  🔔
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
                className="w-full bg-gray-100/70 border border-gray-200 rounded-full py-2 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</div>
            </div>

          <div className="mt-4 flex gap-2 text-xs">
            <button
              onClick={() => setViewTab('friends')}
              className={`flex-1 rounded-full py-2 ${viewTab === 'friends' ? 'bg-blue-600 text-white' : 'bg-gray-200/50 text-gray-700 hover:bg-gray-200/70'}`}
            >
              Friends
            </button>
            <button
              onClick={() => setViewTab('rooms')}
              className={`flex-1 rounded-full py-2 ${viewTab === 'rooms' ? 'bg-blue-600 text-white' : 'bg-gray-200/50 text-gray-700 hover:bg-gray-200/70'}`}
            >
              Rooms
            </button>
            <button
              onClick={() => setViewTab('all')}
              className={`flex-1 rounded-full py-2 ${viewTab === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200/50 text-gray-700 hover:bg-gray-200/70'}`}
            >
              All users
            </button>
          </div>

          {friendRequests.length > 0 && (
            <div className="mt-4 px-4 py-3 bg-white/80 rounded-2xl border border-gray-200">
              <div className="font-semibold text-sm text-slate-900 mb-2">Friend requests</div>
              {friendRequests.map(r => (
                <div key={r._id} className="flex items-center justify-between gap-2 py-1">
                  <div className="flex items-center gap-2">
                    <img src={r.avatar} className="w-8 h-8 rounded-full object-cover" />
                    <div>
                      <div className="text-sm font-medium text-slate-900">{r.username}</div>
                      <div className="text-xs text-gray-400">Wants to be friends</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => respondFriendRequest(r._id, true)}
                      className="px-2 py-1 text-xs bg-green-600 rounded-lg hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => respondFriendRequest(r._id, false)}
                      className="px-2 py-1 text-xs bg-gray-700 rounded-lg hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-500"
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
          {viewTab === 'rooms' ? (
            filteredRooms.map(room => {
              const unread = roomUnreadCounts[room._id] || 0
              return (
                <div
                  key={room._id}
                  onClick={() => {
                    setSelectedRoom(room)
                    setSelectedUser(null)
                  }}
                  className={`flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-800 cursor-pointer transition-all ${selectedRoom?._id === room._id ? 'bg-blue-900/50' : 'hover:bg-gray-200/50 dark:hover:bg-gray-900/50'}`}
                >
                  <div className="relative">
                    <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-indigo-500 to-sky-500 flex items-center justify-center">
                      <Users size={20} className="text-white" />
                    </div>
                    {unread > 0 && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-red-500 text-[10px] font-semibold text-white flex items-center justify-center">
                        {unread}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="font-semibold text-sm truncate text-slate-900 dark:text-white">{room.name}</p>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">{room.members?.length ?? 0} member{(room.members?.length ?? 0) === 1 ? '' : 's'}</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{room.members?.map(m => m.username).join(', ')}</p>
                  </div>
                </div>
              )
            })
          ) : (
            listToShow.map(u => {
              const isFriend = friends.some(f => f._id === u._id)
              const isRequested = sentRequests.some(r => r._id === u._id)
              const isIncoming = friendRequests.some(r => r._id === u._id)

              return (
                <div
                  key={u._id}
                  onClick={() => {
                    setSelectedUser(u)
                    setSelectedRoom(null)
                  }}
                  className={`flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-800 cursor-pointer transition-all ${selectedUser?._id === u._id ? 'bg-blue-900/50' : 'hover:bg-gray-200/50 dark:hover:bg-gray-900/50'}`}
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
                          className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded-full text-white"
                        >
                          Add
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                Logged in as <span className="font-semibold text-slate-900">{currentUsername ?? 'Unknown'}</span>
              </div>
              <button
                onClick={() => { localStorage.clear(); window.location.reload() }}
                className="text-gray-400 hover:text-red-500 transition text-sm px-3 py-1 rounded-lg hover:bg-red-50"
                title="Logout"
              >
                <LogOut size={16} className="inline mr-1" />
                Logout
              </button>
            </div>
          </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {(selectedUser || selectedRoom) ? (
          <>
            <div className="p-4 border-b border-gray-200 bg-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                {selectedRoom ? (
                  <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-indigo-500 to-sky-500 flex items-center justify-center">
                    <Users size={28} className="text-white" />
                  </div>
                ) : (
                  <img src={selectedUser?.avatar} className="w-12 h-12 rounded-2xl" />
                )}
                <div>
                  <p className="font-bold text-lg text-slate-900">{selectedChatTitle}</p>
                  <p className="text-xs text-gray-400">{selectedChatSubtitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {selectedUser && !selectedRoom && (
                  <button
                    onClick={callState === 'idle' ? startCall : () => endCall(true)}
                    className={`p-2 rounded-full transition ${callState === 'idle' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}
                    title={callState === 'idle' ? 'Start voice call' : 'End call'}
                  >
                    {callState === 'idle' ? <Phone size={16} /> : <PhoneOff size={16} />}
                  </button>
                )}
                {selectedRoom && (
                  <button
                    onClick={() => setShowRoomSettings(true)}
                    className="text-gray-400 hover:text-gray-600 transition"
                    title="Room settings"
                  >
                    ⚙️
                  </button>
                )}
                {selectedUser && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={unfriendUser}
                      className="text-red-400 hover:text-red-600 transition text-sm"
                      title="Unfriend"
                    >
                      👤❌
                    </button>
                    <button
                      onClick={deleteChat}
                      className="text-red-400 hover:text-red-600 transition text-sm"
                      title="Delete chat"
                    >
                      🗑️
                    </button>
                  </div>
                )}
                <div className="text-gray-400 text-xs">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>

            {callState !== 'idle' && !incomingCall && (
              <div className="px-6 py-2 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-sm flex items-center justify-between">
                <span>
                  {callState === 'calling' && 'Calling...'}
                  {callState === 'connecting' && 'Connecting call...'}
                  {callState === 'in-call' && 'In voice call'}
                </span>
                <button
                  onClick={() => endCall(true)}
                  className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white"
                >
                  End
                </button>
              </div>
            )}

            <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-white">
              {messages.map((msg) => {
                const isOwnMessage = getEntityId(msg.sender) === currentUserId
                return (
                <div key={msg._id} className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                  <div className="group relative max-w-[70%]">
                    <div className={`px-5 py-3 rounded-3xl text-sm leading-relaxed ${isOwnMessage ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-900'}`}>
                      {editingMessage === msg._id ? (
                        <div className="space-y-2">
                          <input
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEditedMessage()
                              if (e.key === 'Escape') setEditingMessage(null)
                            }}
                            className="w-full bg-transparent border-none outline-none text-inherit"
                            autoFocus
                          />
                          <div className="flex gap-2 text-xs">
                            <button onClick={saveEditedMessage} className="text-green-400 hover:text-green-300">Save</button>
                            <button onClick={() => setEditingMessage(null)} className="text-gray-400 hover:text-gray-300">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Reply indicator */}
                          {msg.replyTo && (() => {
                            const replied = typeof msg.replyTo === 'string'
                              ? messages.find(m => m._id === msg.replyTo || m.clientId === msg.replyTo)
                              : msg.replyTo

                            return (
                              <div className="mb-2 p-2 rounded-lg bg-gray-100 dark:bg-gray-700 border-l-2 border-blue-500">
                                <div className="text-xs text-gray-600">
                                  Replying to {getEntityId(replied?.sender) === currentUserId ? 'yourself' : 'someone'}
                                </div>
                                <div className="text-xs text-gray-900 dark:text-gray-200 truncate">{replied?.content || 'Attachment'}</div>
                              </div>
                            )
                          })()}

                          {/* GIF display */}
                          {msg.gif && (
                            <div className="mb-2">
                              <img src={msg.gif.url} alt={msg.gif.title} className="max-h-44 w-auto rounded-xl" />
                              {msg.gif.title && <div className="text-xs text-gray-500 mt-1">{msg.gif.title}</div>}
                            </div>
                          )}

                          {/* Sticker display */}
                          {msg.sticker && (
                            <div className="mb-2">
                              <img src={msg.sticker.url} alt={msg.sticker.name} className="h-16 w-16" />
                            </div>
                          )}

                          {msg.attachment && (
                            <div className="mb-2">
                              {msg.attachment.type?.startsWith('image') ? (
                                <img src={msg.attachment.url} alt={msg.attachment.name} className="max-h-44 w-auto rounded-xl" />
                              ) : (
                                <a href={msg.attachment.url} target="_blank" rel="noreferrer" className="text-blue-200 underline">
                                  {msg.attachment.name || 'Download file'}
                                </a>
                              )}
                            </div>
                          )}
                          {msg.content && <div className={msg.deletedAt ? 'italic text-gray-500' : ''}>{msg.content}</div>}
                          {translations[msg._id] && (
                            <div className="text-xs text-gray-500 mt-1">
                              🈯 {translations[msg._id]}
                            </div>
                          )}
                          <div className="text-[10px] text-gray-400 mt-1 text-right">
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {msg.editedAt && <span className="ml-1">(edited)</span>}
                            {isOwnMessage && msg.isRead && (
                              <span className="ml-2 text-green-200">Seen</span>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Message actions */}
                    {!editingMessage && !msg.deletedAt && (
                      <div className={`absolute top-0 ${isOwnMessage ? 'left-0 -translate-x-full' : 'right-0 translate-x-full'} opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1`}>
                        <button
                          onClick={() => replyToMessage(msg)}
                          className="p-1 rounded-full bg-gray-200 hover:bg-gray-300 text-xs"
                          title="Reply"
                        >
                          ↩️
                        </button>
                        <button
                          onClick={() => translateMessage(msg._id, msg.content)}
                          className="p-1 rounded-full bg-gray-200 hover:bg-gray-300 text-xs"
                          title="Translate to Vietnamese"
                        >
                          🌐
                        </button>
                        <button
                          onClick={() => reactToMessage(msg._id, '👍')}
                          className="p-1 rounded-full bg-gray-200 hover:bg-gray-300 text-xs"
                          title="Like"
                        >
                          👍
                        </button>
                        <button
                          onClick={() => reactToMessage(msg._id, '❤️')}
                          className="p-1 rounded-full bg-gray-200 hover:bg-gray-300 text-xs"
                          title="Love"
                        >
                          ❤️
                        </button>
                        <button
                          onClick={() => reactToMessage(msg._id, '😂')}
                          className="p-1 rounded-full bg-gray-200 hover:bg-gray-300 text-xs"
                          title="Laugh"
                        >
                          😂
                        </button>
                        {isOwnMessage && (
                          <>
                            <button
                              onClick={() => startEditingMessage(msg)}
                              className="p-1 rounded-full bg-gray-200 hover:bg-gray-300 text-xs"
                              title="Edit"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => deleteMessage(msg._id)}
                              className="p-1 rounded-full bg-red-200 hover:bg-red-300 text-xs"
                              title="Delete"
                            >
                              🗑️
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Reactions display */}
                    {msg.reactions && msg.reactions.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {msg.reactions.map((reaction, idx) => (
                          <span key={idx} className="text-xs bg-gray-200 px-2 py-1 rounded-full">
                            {reaction.emoji} {reaction.user.username}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-5 bg-white border-t border-gray-200">
              {/* Reply indicator */}
              {replyingTo && (
                <div className="mb-3 p-3 bg-blue-50 rounded-xl border border-blue-200">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-xs text-blue-600 font-medium">Replying to</div>
                      <div className="text-sm text-gray-900 truncate">
                        {replyingTo.content || 'Attachment'}
                      </div>
                    </div>
                    <button
                      onClick={cancelReply}
                      className="text-gray-400 hover:text-gray-600 ml-2"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <label className={`cursor-pointer p-2 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 transition ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <input type="file" className="hidden" onChange={handleFileChange} disabled={uploading} />
                  {uploading ? '⏳' : '📎'}
                </label>

                <button
                  onClick={() => setShowGifPicker(!showGifPicker)}
                  className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 transition"
                  title="GIF"
                >
                  🎭
                </button>

                <button
                  onClick={sendBotMessage}
                  className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 transition"
                  title="Chat with Bot"
                >
                  🤖
                </button>

                <div className="flex-1">
                  {attachment && (
                    <div className="mb-2 flex items-center justify-between rounded-xl bg-gray-200 px-3 py-2 text-xs text-gray-900">
                      <span className="truncate">{attachment.name}</span>
                      <button onClick={() => setAttachment(null)} className="text-gray-400 hover:text-white dark:text-gray-500 dark:hover:text-gray-300">✕</button>
                    </div>
                  )}

                  {/* GIF Picker */}
                  {showGifPicker && (
                    <div className="mb-2 p-3 bg-gray-50 rounded-xl">
                      <div className="flex gap-2 mb-2">
                        <input
                          value={gifSearch}
                          onChange={(e) => setGifSearch(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && searchGifs(gifSearch)}
                          placeholder="Search GIFs..."
                          className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={() => searchGifs(gifSearch)}
                          disabled={searchingGifs}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                        >
                          {searchingGifs ? '...' : 'Search'}
                        </button>
                      </div>
                      {gifs.length > 0 && (
                        <div className="grid grid-cols-4 gap-2 max-h-32 overflow-y-auto">
                          {gifs.map((gif) => (
                            <img
                              key={gif.id}
                              src={gif.url}
                              alt={gif.title}
                              onClick={() => sendGif(gif)}
                              className="w-full h-16 object-cover rounded cursor-pointer hover:opacity-80"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <input
                    value={newMessage}
                    onChange={e => {
                      setNewMessage(e.target.value)
                      if (!socket) return
                      if (selectedRoom) {
                        socket.emit('roomTyping', { roomId: selectedRoom._id })
                        setTimeout(() => socket.emit('roomStopTyping', { roomId: selectedRoom._id }), 800)
                      } else if (selectedUser) {
                        socket.emit('typing', { receiverId: selectedUser._id })
                        setTimeout(() => socket.emit('stopTyping', { receiverId: selectedUser._id }), 800)
                      }
                    }}
                    onKeyDown={e => e.key === 'Enter' && sendMessage()}
                    placeholder="Type a message..."
                    className="w-full bg-gray-200 text-sm p-4 rounded-full focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <button onClick={sendMessage} className="bg-blue-600 hover:bg-blue-700 p-3 rounded-full transition">
                  <Send size={20} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-10 bg-white">
            <div className="text-3xl font-semibold text-gray-400">Select a chat to start</div>
            <div className="text-sm text-gray-500 max-w-xs">Pick a user from the list to begin messaging instantly.</div>
          </div>
        )}
      </div>
      </div>

      {/* Create Room Modal */}
      {incomingCall && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4 text-center">
            <h3 className="text-lg font-semibold text-slate-900">Incoming Voice Call</h3>
            <p className="mt-2 text-sm text-gray-600">{incomingCall.fromUsername || 'Unknown'} is calling you</p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={rejectIncomingCall}
                className="flex-1 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white"
              >
                Decline
              </button>
              <button
                onClick={acceptIncomingCall}
                className="flex-1 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}

      <audio ref={localAudioRef} autoPlay muted className="hidden" />
      <audio ref={remoteAudioRef} autoPlay className="hidden" />

      {showCreateRoom && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Create Room</h2>
              <button
                onClick={() => setShowCreateRoom(false)}
                className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Room Name
                </label>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="Enter room name"
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Select Members
                </label>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {friends.map(friend => (
                    <label key={friend._id} className="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newRoomMembers.includes(friend._id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewRoomMembers(prev => [...prev, friend._id])
                          } else {
                            setNewRoomMembers(prev => prev.filter(id => id !== friend._id))
                          }
                        }}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                      />
                      <img src={friend.avatar} className="w-8 h-8 rounded-full object-cover" />
                      <span className="text-sm text-gray-900 dark:text-gray-100">{friend.username}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateRoom(false)}
                className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl transition dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={createRoom}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition"
              >
                Create Room
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Room Settings Modal */}
      {showRoomSettings && selectedRoom && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Room Settings</h2>
              <button
                onClick={() => setShowRoomSettings(false)}
                className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Members ({selectedRoom.members?.length || 0})</h3>
                <div className="space-y-3">
                  {selectedRoom.members?.map(member => (
                    <div key={member._id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="flex items-center gap-3">
                        <img src={member.avatar} className="w-8 h-8 rounded-full object-cover" />
                        <span className="text-sm text-gray-900 dark:text-gray-100">{member.username}</span>
                        {selectedRoom.admins?.includes(member._id) && (
                          <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-2 py-1 rounded-full">Admin</span>
                        )}
                        {selectedRoom.createdBy === member._id && (
                          <span className="text-xs bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 px-2 py-1 rounded-full">Owner</span>
                        )}
                      </div>
                      {selectedRoom.createdBy === currentUserId && member._id !== currentUserId && (
                        <button
                          onClick={() => removeRoomMember(member._id)}
                          className="text-red-500 hover:text-red-700 text-sm"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Add Member</h3>
                <div className="space-y-2">
                  {friends.filter(friend => !selectedRoom.members?.some(m => m._id === friend._id)).map(friend => (
                    <div key={friend._id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="flex items-center gap-3">
                        <img src={friend.avatar} className="w-8 h-8 rounded-full object-cover" />
                        <span className="text-sm text-gray-900 dark:text-gray-100">{friend.username}</span>
                      </div>
                      <button
                        onClick={() => addRoomMember(friend._id)}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 mt-6">
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRoomSettings(false)}
                  className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl transition dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200"
                >
                  Close
                </button>
              </div>
              {(selectedRoom.createdBy === currentUserId || selectedRoom.admins?.includes(currentUserId)) && (
                <button
                  onClick={deleteRoom}
                  className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl transition mt-2"
                >
                  Xóa nhóm này
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
