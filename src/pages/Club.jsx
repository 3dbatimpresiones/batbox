import { useAuth } from '../auth/AuthContext.jsx';
import { newest, useContent } from '../data/ContentContext.jsx';
import { fmtDate } from '../lib/text.js';
import Icon from '../components/Icon.jsx';
import AccessPanel from '../components/AccessPanel.jsx';
import { SectionHead } from '../components/ui.jsx';
import { ContentCard, Grid, NewsRow, ToolCard } from '../components/Cards.jsx';
import ClubPitch, { Benefits } from '../components/ClubPitch.jsx';

// El contenido exclusivo viene de Supabase: su enlace/video solo llega a
// miembros aprobados (RLS). Los ítems de ejemplo siguen siendo locales.

const COMING = ['Perfil', 'Favoritos', 'Proyectos guardados'];

export default function Club() {
  const { isMember, isAdmin, isEditor, member, displayName, access, isTrial, trialEndsAt } = useAuth();
  const { tools: TOOLS, byKind } = useContent();

  if (!isMember) {
    return (
      <div className="club-locked">
        <div className="club-locked-head">
          <div className="section-label">MAKERS CLUB</div>
          <h1>Zona exclusiva de Makers Club</h1>
          <p>Herramientas PRO, tutoriales exclusivos y recursos del taller, por una suscripción mensual.</p>
        </div>
        <div className="club-join">
          {/* Quien ya entró y todavía no es miembro ve la solicitud: los pasos ya están ahí. */}
          <ClubPitch title="Qué incluye la membresía" steps={['guest', 'loading', 'none'].includes(access)} />
          <div className="club-join-panel">
            <AccessPanel intro={access === 'guest' ? 'Sumate o ingresá' : 'Contenido solo para miembros'} benefitsLink={false} />
          </div>
        </div>
      </div>
    );
  }

  const clubTools = TOOLS.filter((t) => t.access === 'club');
  const tutorials = newest(byKind('tutorial').filter((i) => i.access === 'club'));
  const resources = byKind('resource').filter((i) => i.access === 'club');
  const news = newest(byKind('news').filter((i) => i.access === 'club'));

  return (
    <div className="club">
      <section className="club-welcome">
        <div className="cw-glow" />
        <div className="cw-main">
          <div className="section-label">MAKERS CLUB</div>
          <h1>¡Hola, {displayName}!</h1>
          <p>Bienvenido a tu zona exclusiva de Makers Club 3DBAT.</p>
        </div>
        <div className="cw-status card">
          <div className="section-label">TU MEMBRESÍA</div>
          <div className="chips">
            {isTrial
              ? <span className="chip club"><Icon name="crown" size={12} /> Prueba gratis</span>
              : <span className="chip ok"><Icon name="check" size={12} /> Miembro activo</span>}
            {isAdmin && <span className="chip club">✦ Admin</span>}
            {isEditor && <span className="chip cat">✎ Editor</span>}
          </div>
          <small>{member.email}</small>
          {member.subscription_expires_at && <small>{isTrial ? 'Prueba hasta' : 'Acceso hasta'}: {fmtDate((trialEndsAt || member.subscription_expires_at).slice(0, 10))}</small>}
          <a className="gate-link cw-link" href="#/acceso">{isTrial ? 'Suscribirme para seguir después de la prueba' : 'Mi suscripción y mis datos'}</a>
        </div>
      </section>

      <section className="block">
        <SectionHead label="HERRAMIENTAS EXCLUSIVAS" title="Tus herramientas PRO" />
        <Grid min={400}>{clubTools.map((t) => <ToolCard key={t.id} tool={t} />)}</Grid>
      </section>

      <section className="block">
        <SectionHead label="TUTORIALES EXCLUSIVOS" title="Solo para miembros" to="/academy" linkText="Todos los tutoriales" />
        {tutorials.length
          ? <Grid min={340}>{tutorials.map((i) => <ContentCard key={i.id} item={i} />)}</Grid>
          : <div className="card coming-soon">
              <Icon name="graduation" size={22} className="c-cyan" />
              <span>Muy pronto vas a tener acá tutoriales exclusivos para miembros. Mientras tanto, mirá todos los de <a href="#/academy">Tutoriales</a>.</span>
            </div>}
      </section>

      <div className="two-blocks">
        <section className="block">
          <SectionHead label="RECURSOS ESPECIALES" title="Archivos y listas del taller" />
          <Grid min={220}>{resources.map((i) => <ContentCard key={i.id} item={i} />)}</Grid>
        </section>
        <section className="block">
          <SectionHead label="NOVEDADES DE MAKERS CLUB" title="Lo último para miembros" />
          <div className="card news-list">{news.map((i) => <NewsRow key={i.id} item={i} />)}</div>
        </section>
      </div>

      <section className="card club-info club-included">
        <div className="ci-head">
          <div className="card-icon lg pink"><Icon name="crown" size={24} /></div>
          <div>
            <div className="section-label">TU MEMBRESÍA</div>
            <h2>Lo que incluye tu membresía</h2>
          </div>
        </div>
        <Benefits />
      </section>

      <section className="coming card">
        <Icon name="sparkles" size={18} className="c-cyan" />
        <span>Próximamente en tu cuenta:</span>
        {COMING.map((c) => <span key={c} className="chip muted">{c}</span>)}
      </section>
    </div>
  );
}
