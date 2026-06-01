import { useEffect } from 'react';
import useStore from './store/useStore';
import Header from './components/layout/Header';
import ChatPage from './pages/ChatPage';
import Settings from './pages/Settings';
import ErrorBoundary from './components/ErrorBoundary';
import './styles/global.scss';

function App() {
  // Get state and actions from Zustand store
  const currentPage = useStore((state) => state.currentPage);
  const setCurrentPage = useStore((state) => state.setCurrentPage);
  const ollamaStatus = useStore((state) => state.ollamaStatus);
  // null until loadSettings() resolves; defaults are fetched from oread-cli.
  const settings = useStore((state) => state.settings);

  // Initialize on mount (only once)
  useEffect(() => {
    const initialize = useStore.getState().initialize;
    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app">
      <Header
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        ollamaStatus={ollamaStatus}
      />
      <div className="app__container">
        <main className="main-content">
          <ErrorBoundary>
            {!settings ? (
              <div className="app__loading">Loading…</div>
            ) : (
              <>
                {currentPage === 'chat' && <ChatPage />}
                {currentPage === 'settings' && <Settings />}
              </>
            )}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

export default App;
