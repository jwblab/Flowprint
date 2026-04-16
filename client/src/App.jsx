import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { EntityTypesProvider } from './context/EntityTypesContext';
import { ThemeProvider } from './context/ThemeContext';
import Topbar from './components/Topbar';
import Sidebar from './components/Sidebar';
import EntityModal from './components/EntityModal';
import PipelineModal from './components/PipelineModal';
import GraphView from './pages/GraphView';
import ListView from './pages/ListView';
import PipelinesListView from './pages/PipelinesListView';
import EntityPage from './pages/EntityPage';
import PipelinePage from './pages/PipelinePage';
import ReportView from './pages/ReportView';
import PrintView from './pages/PrintView';
import PipelinePrintView from './pages/PipelinePrintView';
import LoginPage from './pages/LoginPage';
import AdminPage from './pages/AdminPage';
import { api } from './api';

export function ProtectedRoute({ children }) {
  const { token } = useAuth();
  return token ? children : <Navigate to="/login" replace />;
}

function AppShell() {
  const [entities, setEntities] = useState([]);
  const [pipelines, setPipelines] = useState([]);
  const [newEntityModal, setNewEntityModal] = useState(false);
  const [newPipelineModal, setNewPipelineModal] = useState(false);
  const location = useLocation();
  const { token } = useAuth();

  const isLogin = location.pathname.startsWith('/login');
  const showSidebar = !isLogin
    && !location.pathname.startsWith('/graph')
    && !location.pathname.startsWith('/reports')
    && !location.pathname.startsWith('/admin');

  // Which sidebar sections to show based on current route
  const sidebarMode = location.pathname.startsWith('/pipelines') ? 'pipelines'
    : location.pathname.startsWith('/list') ? 'entities'
    : 'all';

  async function loadEntities() {
    const data = await api.getEntities();
    setEntities(data);
  }

  async function loadPipelines() {
    const data = await api.getPipelines();
    setPipelines(data);
  }

  async function loadAll() {
    await Promise.all([loadEntities(), loadPipelines()]);
  }

  useEffect(() => {
    if (token) loadAll();
  }, [token]);

  async function handleCreateEntity(form) {
    const entity = await api.createEntity(form);
    // Assign to pipelines if any were selected
    if (form.pipeline_ids?.length) {
      await Promise.all(form.pipeline_ids.map(pid => api.addEntityToPipeline(pid, entity.id)));
      await loadPipelines();
    }
    await loadEntities();
    setNewEntityModal(false);
  }

  async function handleCreatePipeline(form) {
    await api.createPipeline(form);
    await loadPipelines();
    setNewPipelineModal(false);
  }

  return (
    <>
      {!isLogin && <Topbar />}
      <div className="app-shell">
        {showSidebar && (
          <Sidebar
            entities={entities}
            pipelines={pipelines}
            onNewEntity={() => setNewEntityModal(true)}
            onNewPipeline={() => setNewPipelineModal(true)}
            mode={sidebarMode}
          />
        )}
        <div className="main-content">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<Navigate to="/graph" replace />} />
            <Route path="/graph" element={
              <ProtectedRoute>
                <GraphView
                  entities={entities}
                  pipelines={pipelines}
                  onRefresh={loadAll}
                  onNew={() => setNewEntityModal(true)}
                  onNewPipeline={() => setNewPipelineModal(true)}
                />
              </ProtectedRoute>
            } />
            <Route path="/list" element={
              <ProtectedRoute><ListView entities={entities} /></ProtectedRoute>
            } />
            <Route path="/pipelines" element={
              <ProtectedRoute><PipelinesListView pipelines={pipelines} /></ProtectedRoute>
            } />
            <Route path="/entity/:id" element={
              <ProtectedRoute><EntityPage pipelines={pipelines} onRefresh={loadAll} /></ProtectedRoute>
            } />
            <Route path="/pipeline/:id" element={
              <ProtectedRoute>
                <PipelinePage pipelines={pipelines} onRefresh={loadAll} />
              </ProtectedRoute>
            } />
            <Route path="/reports" element={
              <ProtectedRoute><ReportView entities={entities} /></ProtectedRoute>
            } />
            <Route path="/admin" element={
              <ProtectedRoute><AdminPage /></ProtectedRoute>
            } />
          </Routes>
        </div>
      </div>

      {newEntityModal && (
        <EntityModal
          pipelines={pipelines}
          onSave={handleCreateEntity}
          onClose={() => setNewEntityModal(false)}
        />
      )}

      {newPipelineModal && (
        <PipelineModal
          pipelines={pipelines}
          onSave={handleCreatePipeline}
          onClose={() => setNewPipelineModal(false)}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <EntityTypesProvider>
      <Routes>
        {/* Print views render outside the app shell for their own scroll context */}
        <Route path="/print/pipeline/:id" element={
          <ProtectedRoute><PipelinePrintView /></ProtectedRoute>
        } />
        <Route path="/print/:id" element={
          <ProtectedRoute><PrintView /></ProtectedRoute>
        } />
        <Route path="*" element={<AppShell />} />
      </Routes>
      </EntityTypesProvider>
    </AuthProvider>
    </ThemeProvider>
  );
}
