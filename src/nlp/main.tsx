import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../App';
import '../styles/index.css';
import { configureNerEnv } from './configureNerEnv';

const root = createRoot(document.getElementById('root')!);

try {
  await configureNerEnv();
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} catch (error) {
  console.error('[nlp/main] NER 환경 설정 실패:', error);
  root.render(
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>NLP 모드 초기화 실패</h1>
      <p>NER 환경을 설정할 수 없습니다. 콘솔 로그를 확인하세요.</p>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{String(error)}</pre>
    </div>,
  );
}
