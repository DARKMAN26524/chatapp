import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Chat from './pages/Chat'
import { useState, useEffect } from 'react'
import { SocketProvider } from './context/SocketContext.jsx'

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark')

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))

  return (
    <SocketProvider token={token}>
      <Routes>
        <Route path="/login" element={token ? <Navigate to="/" /> : <Login setToken={setToken} />} />
        <Route
          path="/"
          element={
            token ? <Chat token={token} toggleTheme={toggleTheme} theme={theme} /> : <Navigate to="/login" />
          }
        />
      </Routes>
    </SocketProvider>
  )
}

export default App