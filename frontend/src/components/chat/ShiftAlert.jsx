// Location: /frontend/src/components/chat/ShiftAlert.jsx
//
// Inline banner shown in the chat when a mood shift is detected.
// Renders differently based on severity.

const STYLES = {
  info: {
    bg: 'bg-brand-50 border-brand-200',
    icon: '💭',
    accent: 'text-brand-700',
    accentSub: 'text-brand-600',
  },
  concern: {
    bg: 'bg-amber-50 border-amber-200',
    icon: '💛',
    accent: 'text-amber-800',
    accentSub: 'text-amber-700',
  },
  urgent: {
    bg: 'bg-red-50 border-red-200',
    icon: '❤️',
    accent: 'text-red-700',
    accentSub: 'text-red-600',
  },
}

export default function ShiftAlert({ notification, onDismiss }) {
  const style = STYLES[notification.severity] || STYLES.info

  return (
    <div className={`${style.bg} border rounded-2xl px-4 py-3 mx-auto max-w-md`}>
      <div className="flex items-start gap-3">
        <div className="text-xl shrink-0 leading-none pt-0.5">{style.icon}</div>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold ${style.accent} mb-0.5`}>
            {notification.title}
          </div>
          <div className={`text-xs leading-relaxed ${style.accentSub}`}>
            {notification.message}
          </div>
          {notification.severity === 'urgent' && (
            <a href="/crisis"
              className="inline-block mt-2 text-xs font-bold text-red-700 hover:text-red-900 underline">
              View crisis resources →
            </a>
          )}
        </div>
        {onDismiss && (
          <button onClick={onDismiss} className={`text-xs ${style.accentSub} hover:opacity-70`}>
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
