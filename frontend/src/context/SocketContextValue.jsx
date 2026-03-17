import { createContext } from 'react'

// Provide defaults so components using the context won't crash if accidentally rendered
// outside of a provider (e.g. during tests or early render).
export const SocketContext = createContext({
  socket: null,
  onlineUsers: [],
  typingUsers: {}
})
