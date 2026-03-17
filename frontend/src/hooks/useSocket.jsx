import { useContext } from 'react'
import { SocketContext } from '../context/SocketContextValue'

export const useSocket = () => useContext(SocketContext)
