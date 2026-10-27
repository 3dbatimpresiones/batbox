import { useAuth } from '../auth/AuthContext.jsx';
import { FEEDBACK_TOOLS } from '../components/FeedbackButton.jsx';
import FeedbackModal from '../components/FeedbackModal.jsx';
import Icon from '../components/Icon.jsx';
import { Empty, PageHead } from '../components/ui.jsx';
import { navigate } from '../lib/router.js';

function goBack(tool) {
  if (tool.back.startsWith('#/')) navigate(tool.back.slice(1));
  else window.location.assign(tool.back);
}

export default function Feedback({ source }) {
  const { access, user, signIn } = useAuth();
  const tool = FEEDBACK_TOOLS[source];

  if (!tool) return <Empty icon="alert" title="Herramienta no válida" text="Abrí Sugerencias desde el botón de una herramienta de BATBOX." />;
  if (access === 'loading') return <div className="empty"><div className="spinner" /></div>;

  if (!user) {
    return (
      <div className="feedback-page">
        <PageHead icon="message" label={tool.label} title="Sugerencias" text="Ingresá con tu cuenta para mandarnos una idea o avisarnos si algo no funciona." />
        <div className="gate card gate-wide">
          <div className="big-ico tone-pink"><Icon name="message" size={26} /></div>
          <h2>Tu sugerencia llega directo a 3DBAT</h2>
          <p className="gate-text">La cuenta nos permite evitar mensajes automáticos y responder mejor a cada herramienta.</p>
          <div className="gate-actions">
            <button type="button" className="btn primary wide" onClick={() => signIn(`/sugerencias?source=${source}`)}><Icon name="login" size={17} /> Ingresar con Google</button>
            <button type="button" className="btn ghost wide" onClick={() => goBack(tool)}>Volver a la herramienta</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="feedback-page">
      <PageHead icon="message" label={tool.label} title="Sugerencias" text="Ideas, errores o cualquier mejora que te gustaría ver." />
      <FeedbackModal source={source} sourceLabel={tool.label} context={{ route: window.location.hash }} onClose={() => goBack(tool)} />
    </div>
  );
}

