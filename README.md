<<<<<<< HEAD
# 🌿 Knoomi — Mental Health Support Web App
=======
# 🌿 MindBridge — Mental Health Support Web App
>>>>>>> 25715433bb13ee2baeb33eb1d9914574e804fc48

Full-stack mental health platform built with React (frontend) and Node.js/Express (backend), designed for easy migration to React Native.

---

## Tech Stack

| Layer      | Technology                         |
|------------|------------------------------------|
| Frontend   | React 18 + Vite + Tailwind CSS     |
| Backend    | Node.js + Express + Socket.IO      |
| Database   | PostgreSQL                         |
| AI Chat    | OpenAI GPT-4o                      |
| Real-time  | Socket.IO (WebSockets)             |
| Video      | Daily.co embedded rooms            |
| Auth       | JWT + bcryptjs                     |

---

## Project Structure

```
<<<<<<< HEAD
knoomi/
=======
mindbridge/
>>>>>>> 25715433bb13ee2baeb33eb1d9914574e804fc48
├── backend/
│   ├── config/
│   │   ├── db.js          # PostgreSQL connection pool
│   │   └── initDB.js      # Creates all tables on startup
│   ├── middleware/
│   │   └── auth.js        # JWT middleware
│   ├── routes/
│   │   ├── auth.js        # /api/auth
│   │   ├── chat.js        # /api/chat (AI + direct)
│   │   ├── groups.js      # /api/groups
│   │   ├── mood.js        # /api/mood
│   │   ├── video.js       # /api/video
│   │   └── crisis.js      # /api/crisis
│   ├── server.js
│   ├── package.json
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── context/
    │   │   └── AuthContext.jsx   # Global auth state
    │   ├── hooks/
    │   │   └── useFetch.js       # Reusable data fetching hooks
    │   ├── utils/
    │   │   ├── api.js            # Axios instance
    │   │   └── socket.js         # Socket.IO singleton
    │   ├── components/shared/
    │   │   └── Layout.jsx        # Sidebar navigation
    │   ├── pages/
    │   │   ├── LoginPage.jsx
    │   │   ├── RegisterPage.jsx
    │   │   ├── DashboardPage.jsx
    │   │   ├── AIChatPage.jsx
    │   │   ├── GroupsPage.jsx
    │   │   ├── GroupRoomPage.jsx
    │   │   ├── MoodPage.jsx
    │   │   ├── VideoPage.jsx
    │   │   └── CrisisPage.jsx
    │   ├── App.jsx
    │   └── main.jsx
    ├── package.json
    └── vite.config.js
```

---

## Setup (Windows)

### Prerequisites
- Node.js 18+ → https://nodejs.org
- PostgreSQL 16 → https://www.postgresql.org/download/windows/
- OpenAI API key → https://platform.openai.com

---

### 1. Create the database

<<<<<<< HEAD
Open pgAdmin 4 → right-click Databases → Create → name it `knoomi`.

Or in PowerShell:
```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE knoomi;"
=======
Open pgAdmin 4 → right-click Databases → Create → name it `mindbridge`.

Or in PowerShell:
```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE mindbridge;"
>>>>>>> 25715433bb13ee2baeb33eb1d9914574e804fc48
```

---

### 2. Backend

```powershell
cd backend
npm install
copy .env.example .env
```

Edit `.env`:
```
DB_PASSWORD=your_postgres_password
OPENAI_API_KEY=sk-...
JWT_SECRET=any-long-random-string
```

Start:
```powershell
node server.js
```

---

### 3. Frontend (development)

Open a second terminal:
```powershell
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**

The Vite dev server proxies `/api` calls to the backend on port 5000 automatically.

---

### 4. Production build

When ready to deploy, build the React app:
```powershell
cd frontend
npm run build
```

The backend will automatically serve the built files from `frontend/dist`.

---

## Migrating to React Native

This project is structured to make React Native migration straightforward:

| What stays the same            | What changes for React Native         |
|-------------------------------|---------------------------------------|
| All backend code (100%)       | —                                     |
| All API calls (axios)         | axios works in React Native           |
| All custom hooks (useFetch)   | Work identically in React Native      |
| AuthContext logic             | Works identically in React Native     |
| Socket.IO client logic        | socket.io-client works in React Native|
| Page component logic          | Copy the JS logic, swap JSX elements  |
| React Router                  | Replace with React Navigation         |
| Tailwind CSS classes          | Replace with StyleSheet objects       |
| HTML elements (div, input...) | Replace with View, TextInput, etc.    |
| iframe (video)                | Replace with react-native-webview     |

**Key principle:** All business logic lives in hooks and context — these files migrate with zero changes. Only the JSX rendering layer needs rewriting.
