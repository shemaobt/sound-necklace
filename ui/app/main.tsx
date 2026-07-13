import { createRoot } from 'react-dom/client';

import '../tokens/fonts';
import '../tokens/tokens.css';
import '../tokens/base.css';
import '../i18n'; // init do i18next (default PT) antes do primeiro render — ENG-279
import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('elemento #root ausente no index.html');
createRoot(container).render(<App />);

// Seam de resiliência para o E2E (ENG-277→257): só em DEV, lazy — fica fora do
// bundle de produção. Expõe os gatilhos de expiração de auth e trava alheia.
if (import.meta.env.DEV) void import('./test-seam').then((m) => m.installTestSeam());
