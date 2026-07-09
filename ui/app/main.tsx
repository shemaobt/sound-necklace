import { createRoot } from 'react-dom/client';

import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('elemento #root ausente no index.html');
createRoot(container).render(<App />);
