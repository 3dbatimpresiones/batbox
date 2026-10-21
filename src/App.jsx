import { useEffect } from 'react';
import { useRoute } from './lib/router.js';
import { useActivityPing } from './lib/activity.js';
import { useAuth } from './auth/AuthContext.jsx';
import { BottomNav, DevBanner, Footer, Header, Toast } from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import { Academy, Library, Tools } from './pages/Catalog.jsx';
import Community from './pages/Community.jsx';
import Wiki from './pages/Wiki.jsx';
import Club from './pages/Club.jsx';
import { Account } from './pages/Account.jsx';
import Admin from './pages/Admin.jsx';
import { Detail, NotFound, Search } from './pages/Detail.jsx';

function Page({ route }) {
  const { parts, query } = route;
  switch (parts[0] ?? '') {
    case '': return <Home />;
    case 'tools': return <Tools />;
    case 'academy': return <Academy />;
    case 'wiki': return <Wiki />;
    case 'library': return <Library />;
    case 'community': return <Community />;
    case 'club': return <Club />;
    case 'acceso': return <Account />;
    case 'admin': return <Admin route={route} />;
    case 'buscar': return <Search q={query.q ?? ''} />;
    case 'ver': return <Detail id={parts[1]} />;
    default: return <NotFound />;
  }
}

export default function App() {
  const route = useRoute();
  const { isMember, simulated } = useAuth();
  // Minutos de uso para el ranking de admins (solo miembros aprobados).
  useActivityPing(isMember && !simulated, route.parts[0] || 'inicio');
  // Al cambiar de sección se arranca arriba (no al filtrar ni al buscar).
  useEffect(() => { window.scrollTo(0, 0); }, [route.path]);

  return (
    <div className="app">
      <DevBanner />
      <Header route={route} />
      <main className="page" key={route.path}>
        <Page route={route} />
      </main>
      <Footer />
      <BottomNav route={route} />
      <Toast />
    </div>
  );
}
