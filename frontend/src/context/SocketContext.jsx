import { useEffect, useState, useRef } from 'react'
import io from 'socket.io-client'
import { SocketContext } from './SocketContextValue'

const API = import.meta.env.VITE_API_URL || 'https://chatapp-dqda.onrender.com'
export const SocketProvider = ({ children, token }) => {
  const [socket, setSocket] = useState(null)
  const [onlineUsers, setOnlineUsers] = useState([])
  const [typingUsers, setTypingUsers] = useState({})
  const socketRef = useRef(null)

  useEffect(() => {
    if (!token) return

    // Clean up old socket if token changes
    if (socketRef.current) {
      socketRef.current.disconnect()
    }

    const newSocket = io(API, {
      auth: { token }
    })

    socketRef.current = newSocket
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(newSocket)

    newSocket.on('onlineUsers', setOnlineUsers)
    newSocket.on('userTyping', (data) => {
      setTypingUsers(prev => ({ ...prev, [data.senderId]: true }))
    })
    newSocket.on('userStopTyping', (data) => {
      setTypingUsers(prev => ({ ...prev, [data.senderId]: false }))
    })

    newSocket.on('roomTyping', (data) => {
      setTypingUsers(prev => ({ ...prev, [`room:${data.roomId}`]: true }))
    })
    newSocket.on('roomStopTyping', (data) => {
      setTypingUsers(prev => ({ ...prev, [`room:${data.roomId}`]: false }))
    })

    return () => {
      newSocket.off('onlineUsers')
      newSocket.off('userTyping')
      newSocket.off('userStopTyping')
      newSocket.disconnect()
    }
  }, [token])

  return (
    <SocketContext.Provider value={{ socket, onlineUsers, typingUsers }}>
      {children}
    </SocketContext.Provider>
  )
}
