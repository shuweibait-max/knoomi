import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { connectSocket, getSocket } from '../utils/socket'
import { useAuth } from '../context/AuthContext'

export default function GroupRoomPage() {
  const { id }   = useParams()
  const groupId  = parseInt(id)
  const { user } = useAuth()
  const navigate = useNavigate()
  const [messages,  setMessages]  = useState([])
  const [input,     setInput]     = useState('')
  const [groupInfo, setGroupInfo] = useState(null)
  const [typing,    setTyping]    = useState('')
  const bottomRef  = useRef(null)
  const typingTimer = useRef(null)

  useEffect(() => {
    // Load history + group info
    Promise.all([
      api.get(`/groups/${groupId}/messages`),
      api.get('/groups/mine'),
    ]).then(([msgRes, groupRes]) => {
      setMessages(msgRes.data)
      setGroupInfo(groupRes.data.find(g => g.id === groupId))
    }).catch(() => navigate('/groups'))

    // Socket
    const socket = connectSocket()
    const token  = localStorage.getItem('mb_token')
    socket.emit('join_group_room', { token, group_id: groupId })

    socket.on('new_group_message', msg => setMessages(m => [...m, msg]))
    socket.on('system_message',    msg => setMessages(m => [...m, { ...msg, is_system: true, id: Date.now() }]))
    socket.on('user_typing', ({ username }) => {
      setTyping(`${username} is typing…`)
      clearTimeout(typingTimer.current)
      typingTimer.current = setTimeout(() => setTyping(''), 2000)
    })

    return () => {
      socket.emit('leave_group_room', { token, group_id: groupId })
      socket.off('new_group_message')
      socket.off('system_message')
      socket.off('user_typing')
    }
  }, [groupId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = () => {
    const content = input.trim()
    if (!content) return
    const token = localStorage.getItem('mb_token')
    getSocket()?.emit('send_group_message', { token, group_id: groupId, content })
    setInput('')
  }

  const handleKeyDown = e => {
    if (e.key === 'Enter') { e.preventDefault(); sendMessage() }
    const token = localStorage.getItem('mb_token')
    getSocket()?.emit('typing', { token, group_id: groupId })
  }

  const leaveGroup = async () => {
    if (!confirm('Leave this group?')) return
    const token = localStorage.getItem('mb_token')
    getSocket()?.emit('leave_group_room', { token, group_id: groupId })
    await api.delete(`/groups/${groupId}/leave`)
    navigate('/groups')
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center justify-between shrink-0">
        <div>
          <div className="font-bold text-slate-800 text-sm">{groupInfo?.name || 'Group Room'}</div>
          <div className="text-xs text-slate-400">{groupInfo?.topic} · {groupInfo?.member_count} members</div>
        </div>
        <button onClick={leaveGroup} className="text-xs text-red-400 hover:text-red-600 transition-colors">Leave</button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.map((msg, i) => (
          msg.is_system ? (
            <div key={msg.id || i} className="text-center text-xs text-slate-400 py-1 italic">{msg.content}</div>
          ) : (
            <div key={msg.id || i} className={`flex gap-2 ${msg.sender_id === user?.id ? 'flex-row-reverse' : ''}`}>
              <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold shrink-0 self-end">
                {msg.sender?.[0]?.toUpperCase()}
              </div>
              <div className={`max-w-[65%] flex flex-col ${msg.sender_id === user?.id ? 'items-end' : 'items-start'}`}>
                {msg.sender_id !== user?.id && (
                  <span className="text-xs text-slate-400 mb-1 px-1">{msg.sender}</span>
                )}
                <div className={`px-3 py-2 rounded-xl text-sm leading-relaxed
                  ${msg.sender_id === user?.id
                    ? 'bg-brand-600 text-white rounded-tr-sm'
                    : 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm'}`}>
                  {msg.content}
                </div>
              </div>
            </div>
          )
        ))}
        {typing && <div className="text-xs text-slate-400 italic px-2">{typing}</div>}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-slate-200 px-4 py-3 shrink-0">
        <div className="flex gap-2">
          <input className="input flex-1" placeholder="Message the group…"
            value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} />
          <button onClick={sendMessage} disabled={!input.trim()} className="btn-primary px-5">Send</button>
        </div>
      </div>
    </div>
  )
}
