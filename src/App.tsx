import { useEffect } from 'react';
import { useRoute } from './hooks/useRoute';
import { useSession } from './store/session';
import { Hoje } from './screens/Hoje';
import { Registrar } from './screens/Registrar';
import { Analise } from './screens/Analise';
import { Diario } from './screens/Diario';
import { Progresso } from './screens/Progresso';
import { Agente } from './screens/Agente';
import { Plano } from './screens/Plano';

export function App() {
  const route = useRoute();
  const { draft } = useSession();
  useEffect(() => { document.querySelector('.screen')?.scrollTo(0, 0); }, [route]);

  return (
    <main className="app">
      {route === 'hoje' && <Hoje />}
      {route === 'registrar' && <Registrar />}
      {/* a new capture remounts Análise so the analysis starts over */}
      {route === 'analise' && <Analise key={draft?.id ?? 0} />}
      {route === 'diario' && <Diario />}
      {route === 'progresso' && <Progresso />}
      {route === 'agente' && <Agente />}
      {route === 'plano' && <Plano />}
    </main>
  );
}
