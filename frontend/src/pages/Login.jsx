import { useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000'

export default function Login({ setToken }) {
  const [isLogin, setIsLogin] = useState(true)
  const [form, setForm] = useState({ username: '', email: '', password: '' })
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    const url = isLogin ? '/api/auth/login' : '/api/auth/register'
    try {
      const res = await axios.post(`${API}${url}`, form)
      localStorage.setItem('token', res.data.token)
      setToken(res.data.token)
      navigate('/')
    } catch (err) {
      alert(err.response?.data?.message || 'Invalid email/password')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="bg-gray-900 p-10 rounded-3xl w-full max-w-md shadow-2xl">
        <h1 className="text-5xl font-bold text-center mb-10 text-blue-400 tracking-wide">CHATAPP</h1>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          {!isLogin && (
            <input type="text" placeholder="Username" value={form.username}
              onChange={e => setForm({...form, username: e.target.value})}
              className="w-full p-4 bg-gray-800 rounded-2xl text-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          )}
          <input type="email" placeholder="Email" value={form.email}
            onChange={e => setForm({...form, email: e.target.value})}
            className="w-full p-4 bg-gray-800 rounded-2xl text-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          <input type="password" placeholder="Password" value={form.password}
            onChange={e => setForm({...form, password: e.target.value})}
            className="w-full p-4 bg-gray-800 rounded-2xl text-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" required />

          <button type="submit" className="w-full py-4 bg-blue-600 hover:bg-blue-700 rounded-2xl text-xl font-bold transition">
            {isLogin ? 'Login' : 'Create account'}
          </button>
        </form>

        <p className="text-center mt-8 text-gray-300">
          {isLogin ? "Don't have an account?" : 'Already have an account?'}
          <span onClick={() => setIsLogin(!isLogin)} className="text-blue-300 cursor-pointer ml-2 hover:underline font-medium">
            {isLogin ? 'Sign up' : 'Login'}
          </span>
        </p>
      </div>
    </div>
  )
}