import { AuthProvider, useAuth } from './context/AuthContext'
import { Login } from './components/Login'
import { ArticlesList } from './components/ArticlesList'
import './App.css'

function AppContent() {
  const { operator, logout, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-4 border-slate-100 border-t-primary rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!operator) {
    return <Login />
  }

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden text-slate-900 font-sans">
      {/* Premium Industry 4.0 Header */}
      <header className="bg-white border-b border-slate-100 shrink-0 z-50">
        <div className="w-full px-6 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-primary rounded-md flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-lg">MQ</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-primary tracking-tight">
                MAGIC QC
              </h1>
              <p className="text-[10px] text-secondary font-bold uppercase tracking-[0.2em] -mt-0.5">
                OPERATOR PANEL | v4.0
              </p>
            </div>
          </div>

          <div className="flex items-center gap-10">
            {/* Operator Info Card */}
            <div className="flex items-center bg-slate-50 px-4 py-2 rounded-md border border-slate-100">
              <div className="w-7 h-7 bg-white rounded border border-slate-200 flex items-center justify-center mr-3 shadow-sm">
                <svg className="w-4 h-4 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider leading-none mb-1">Active Operator</p>
                <div className="flex items-baseline">
                  <p className="text-xs font-bold text-primary leading-none uppercase">{operator?.full_name || 'System'}</p>
                  <span className="ml-2 text-[10px] text-secondary font-medium tracking-tight">({operator?.employee_id})</span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-8 text-[11px] font-bold text-secondary uppercase tracking-wider">
              <div className="flex items-center">
                <span className="w-2.5 h-2.5 rounded-full bg-success mr-2 shadow-sm shadow-success/20"></span>
                Shift Active
              </div>
              <div className="h-4 w-px bg-slate-200"></div>
              <button
                onClick={logout}
                className="text-secondary hover:text-error transition-colors flex items-center"
              >
                Logout
                <svg className="w-3.5 h-3.5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-hidden px-4 py-2">
        <ArticlesList />
      </main>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
