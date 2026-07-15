import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore'
import { db, auth } from '../config/firebase'
import api from '../utils/api'
import { connectSocket, getSocket } from '../utils/socket'
import { useAuth } from '../context/AuthContext'
import GroupManageModal from '../components/groups/GroupManageModal'

export default function GroupRoomPage() {
  const { id }   = useParams()
  const groupId  = id
  const { user } = useAuth()
  const navigate = useNavigate()
  const [messages,  setMessages]  = useState([])
  const [input,     setInput]     = useState('')
  const [groupInfo, setGroupInfo] = useState(null)
  const [typing,    setTyping]    = useState('')
  const [showManage, setShowManage] = useState(false)
  const bottomRef  = useRef(null)
  const typingTimer = useRef(null)

  const loadGroupInfo = () => {
    api.get('/groups/mine')
      .then(r => {
        const info = r.data.find(g => g.id === groupId)
        if (!info) { navigate('/groups'); return }
        setGroupInfo(info)
      })
      .catch(() => navigate('/groups'))
  }

  useEffect(() => { loadGroupInfo() }, [groupId])

  // Messages come straight from Firestore — no Express round-trip, no
  // socket relay. Firestore security rules enforce group membership.
  useEffect(() => {
    const q = query(
      collection(db, 'groups', groupId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(200)
    )
    const unsubscribe = onSnapshot(q, snap => {
      setMessages(snap.docs.map(doc => {
        const d = doc.data()
        return { id: doc.id, sender_id: d.senderId, sender: d.senderUsername, content: d.content }
      }))
    }, () => {
      // Most likely cause: Firestore security rules not yet published,
      // or the user isn't (or is no longer) a member of this group.
      navigate('/groups')
    })

    const socket = connectSocket()
    socket.emit('join_group_room', { group_id: groupId })
    socket.on('user_typing', ({ username }) => {
      setTyping(`${username} is typing…`)
      clearTimeout(typingTimer.current)
      typingTimer.current = setTimeout(() => setTyping(''), 2000)
    })

    return () => {
      unsubscribe()
      socket.emit('leave_group_room', { group_id: groupId })
      socket.off('user_typing')
    }
  }, [groupId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    const content = input.trim()
    if (!content) return
    setInput('')
    try {
      await addDoc(collection(db, 'groups', groupId, 'messages'), {
        senderId: user.id,
        senderUsername: user.username,
        content,
        createdAt: serverTimestamp(),
      })
    } catch {
      alert('Could not send message — check your connection and try again.')
    }
  }

  const emitTyping = async () => {
    const token = await auth.currentUser?.getIdToken()
    getSocket()?.emit('typing', { token, group_id: groupId })
  }

  const handleKeyDown = e => {
    if (e.key === 'Enter') { e.preventDefault(); sendMessage() }
    emitTyping()
  }

  const leaveGroup = async () => {
    if (!confirm('Leave this group?')) return
    try {
      await api.delete(`/groups/${groupId}/leave`)
      navigate('/groups')
    } catch (err) {
      alert(err.response?.data?.error || 'Could not leave group')
    }
  }

  const myRole = groupInfo?.my_role
  const roleBadge = myRole === 'owner'
    ? <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">👑 Owner</span>
    : myRole === 'admin'
    ? <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">🛡️ Admin</span>
    : null

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center justify-between shrink-0">
        <div>
          <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
            {groupInfo?.name || 'Group Room'}
            {roleBadge}
          </div>
          <div className="text-xs text-slate-400">{groupInfo?.topic} · {groupInfo?.member_count} members</div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowManage(true)}
            className="text-xs text-slate-500 hover:text-brand-600 font-medium transition-colors">
            Members
          </button>
          {myRole !== 'owner' && (
            <button onClick={leaveGroup} className="text-xs text-red-400 hover:text-red-600 transition-colors">Leave</button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.map((msg, i) => (
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

      {showManage && groupInfo && (
        <GroupManageModal
          group={groupInfo}
          currentUserId={user?.id}
          myRole={myRole}
          onClose={() => setShowManage(false)}
          onGroupUpdated={(updated) => setGroupInfo(g => ({ ...g, ...updated }))}
          onGroupDeleted={() => setShowManage(false)}
        />
      )}
    </div>
  )
}
