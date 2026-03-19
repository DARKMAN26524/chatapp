import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Chat from './pages/Chat'
import { useState, useEffect } from 'react'
import { SocketProvider } from './context/SocketContext.jsx'

function isTokenValid(token) {
  if (!token) return false
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    if (!payload?.id) return false
    if (!payload?.exp) return true
    return payload.exp * 1000 > Date.now()
  } catch {
    return false
  }
}

function App() {
  const [token, setToken] = useState(() => {
    const saved = localStorage.getItem('token')
    if (isTokenValid(saved)) return saved
    localStorage.removeItem('token')
    return null
  })

  useEffect(() => {
    const theme = localStorage.getItem('theme') || 'dark'
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
  }, [])

  return (
    <SocketProvider token={token}>
      <Routes>
        <Route path="/login" element={token ? <Navigate to="/" /> : <Login setToken={setToken} />} />
        <Route
          path="/"
          element={
            token ? <Chat token={token} /> : <Navigate to="/login" />
          }
        />
      </Routes>
    </SocketProvider>
  )
}

export default App